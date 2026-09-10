#!/usr/bin/env node
// Generates the 6-page AcmeCatalog quality dashboard as static HTML with
// hand-rendered inline SVG charts (no client-side charting library, no CDN
// dependency) from real rows in Azure Table Storage. Deployed by ci.yml's
// publish-dashboard job via Azure/static-web-apps-deploy@v1 — refreshes on
// every CI run, nothing manual. See the design doc for why each KPI/chart
// exists; this file is the "how," not a restatement of the "why."

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TableClient } from '@azure/data-tables'
import { AzureCliCredential } from '@azure/identity'

const STORAGE_ACCOUNT = process.env.METRICS_STORAGE_ACCOUNT ?? 'acmecatalogmetrics'
const OUT_DIR = process.env.DASHBOARD_OUT_DIR ?? 'dist'
const LOOKBACK_DAYS = 90

// Every job whose failure fails the CI run — i.e. everything except
// ai-prompt-demo, which ci.yml marks `continue-on-error: true`. This set
// went stale when the 3 Pact jobs were added (none of them had
// `continue-on-error` either, but they were never added here), which
// under-counted both the "gating-job flake incidents" KPI and the old
// critical-path calculation for every run since Pact shipped.
const GATING_JOBS = new Set(['backend-tests', 'component-tests', 'e2e-smoke', 'e2e-regression', 'pact-consumer-catalog', 'pact-consumer-frontend', 'pact-provider-verify'])
const LAYERS = ['backend-unit', 'backend-integration', 'component', 'e2e-ui', 'e2e-api', 'contract-pact']
const LAYER_LABEL = {
  'backend-unit': 'Backend unit',
  'backend-integration': 'Backend integration',
  component: 'Component',
  'e2e-ui': 'E2E UI',
  'e2e-api': 'E2E API',
  'contract-pact': 'Contract (Pact)',
}

// A larger, index-assigned palette instead of a short array that silently
// wraps and starts *reusing* colors once the series count exceeds it — the
// exact bug that made every job past the 5th look identical on the
// per-job trend chart. 12 is comfortably above today's job/layer counts.
const CHART_PALETTE = [
  '#2d5540', '#c17a4f', '#4a5a8a', '#8a5a3a', '#4d7c62', '#b08968',
  '#a3425c', '#3a7a8a', '#6b4a8a', '#8a8a3a', '#5a8a4a', '#8a4a4a',
]
function paletteColor(index) {
  return CHART_PALETTE[index % CHART_PALETTE.length]
}

// Real dependency shape read directly from ci.yml, not guessed: Stage 1
// jobs all start in parallel (none declares `needs:`); Stage 2
// (pact-provider-verify) needs both Pact consumer jobs; Stage 3
// (record-job-timing) needs every Stage 1 + Stage 2 job; Stage 4
// (publish-dashboard) needs Stage 3. ai-prompt-demo has `continue-on-error:
// true` and nothing depends on it — it never gates the pipeline, so it's
// excluded from the critical-path calculation (shown for reference only).
const JOB_STAGE = {
  'backend-tests': 1, 'component-tests': 1, 'e2e-smoke': 1, 'e2e-regression': 1,
  'pact-consumer-catalog': 1, 'pact-consumer-frontend': 1,
  'pact-provider-verify': 2,
  'record-job-timing': 3,
  'publish-dashboard': 4,
}
const STAGE_LABEL = {
  1: 'Stage 1 — parallel gating jobs',
  2: 'Stage 2 — contract verification',
  3: 'Stage 3 — job-timing rollup',
  4: 'Stage 4 — dashboard publish',
}
const STAGE_COLOR = { 1: '#2d5540', 2: '#c17a4f', 3: '#4a5a8a', 4: '#a3425c' }
const NON_GATING_JOBS = new Set(['ai-prompt-demo'])

// Seeded heuristic categories (see push-test-metrics.mjs's classifyFailure)
// — shared here so the Overview failure-mix chart and the Failures page
// badges render the same label/color for the same category.
const FAILURE_CATEGORY_LABEL = {
  'infra-flake': 'Infra flake',
  'ui-timeout': 'UI timeout',
  'assertion-failure': 'Assertion failure',
  'http-error': 'HTTP error',
  'contract-mismatch': 'Contract mismatch',
  unclassified: 'Unclassified',
}
const FAILURE_CATEGORY_COLOR = {
  'infra-flake': '#c17a4f',
  'ui-timeout': '#b08968',
  'assertion-failure': '#a3425c',
  'http-error': '#8a4a4a',
  'contract-mismatch': '#4a5a8a',
  unclassified: '#8a5a3a',
}

// Not a contractual SLA — reasonable defaults for a CRUD API on modest
// infra. Edit these two constants if a real target differs.
const SLA_TARGET_MS = 500
const SLA_BREACH_MS = 1000

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

function credential() {
  return new AzureCliCredential()
}

async function fetchAll(tableName, filter) {
  const url = `https://${STORAGE_ACCOUNT}.table.core.windows.net`
  const client = new TableClient(url, tableName, credential())
  const rows = []
  for await (const entity of client.listEntities({ queryOptions: { filter } })) {
    rows.push(entity)
  }
  return rows
}

function isoDaysAgo(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

async function fetchData() {
  const cutoff = isoDaysAgo(LOOKBACK_DAYS)
  const [testRuns, jobRuns] = await Promise.all([
    fetchAll('TestRuns', `RecordedAt ge '${cutoff}'`),
    fetchAll('CiJobRuns', null),
  ])
  return { testRuns, jobRuns }
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function dayKey(iso) {
  return (iso ?? '').slice(0, 10)
}

function median(nums) {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function percentile(nums, p) {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function pct(numerator, denominator) {
  if (!denominator) return null
  return (100 * numerator) / denominator
}

function groupBy(rows, keyFn) {
  const map = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(row)
  }
  return map
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ---------------------------------------------------------------------------
// SVG chart primitives — hand-rendered, driven entirely by computed data
// ---------------------------------------------------------------------------

function svgEmpty(width, height, message) {
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(message)}" class="chart">
    <text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="chart-empty">${escapeHtml(message)}</text>
  </svg>`
}

// Simple multi-series line chart. series: [{ label, color, points: [{x, y}] }]
function svgLineChart({ width = 720, height = 240, series, yLabel = '', yMax: yMaxOverride }) {
  const pad = { top: 16, right: 16, bottom: 28, left: 44 }
  const allPoints = series.flatMap((s) => s.points)
  if (allPoints.length === 0) return svgEmpty(width, height, 'Not enough runs yet to chart a trend.')

  const xs = [...new Set(allPoints.map((p) => p.x))].sort()
  const yMax = yMaxOverride ?? Math.max(1, ...allPoints.map((p) => p.y))
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const xPos = (x) => pad.left + (xs.length <= 1 ? innerW / 2 : (innerW * xs.indexOf(x)) / (xs.length - 1))
  const yPos = (y) => pad.top + innerH - (innerH * y) / yMax

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = pad.top + innerH * (1 - f)
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="chart-grid" />
      <text x="${pad.left - 6}" y="${y + 3}" text-anchor="end" class="chart-axis">${Math.round(yMax * f)}</text>`
  }).join('')

  const xTicks = xs.filter((_, i) => xs.length <= 8 || i % Math.ceil(xs.length / 8) === 0)
    .map((x) => `<text x="${xPos(x)}" y="${height - 6}" text-anchor="middle" class="chart-axis">${x.slice(5)}</text>`)
    .join('')

  const unitSuffix = yLabel.includes('%') ? '%' : yLabel.toLowerCase().includes('(s)') ? 's' : ''
  const lines = series.map((s) => {
    const sorted = s.points.slice().sort((a, b) => (a.x < b.x ? -1 : 1))
    const path = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.x).toFixed(1)} ${yPos(p.y).toFixed(1)}`).join(' ')
    const dashAttr = s.dashed ? ' stroke-dasharray="4,3"' : ''
    const dots = sorted.map((p) => {
      const note = p.n > 1 ? ` (median of ${p.n} runs)` : ''
      return `<circle cx="${xPos(p.x).toFixed(1)}" cy="${yPos(p.y).toFixed(1)}" r="3" fill="${s.color}"><title>${escapeHtml(s.label)} — ${escapeHtml(p.x)}: ${p.y}${unitSuffix}${note}</title></circle>`
    }).join('')
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2"${dashAttr} />${dots}`
  }).join('')

  // Wraps into multiple rows once the series count outgrows one line —
  // without this, 6+ layers/jobs (e.g. after adding contract-pact) ran the
  // legend clean off the right edge of the viewBox.
  const itemWidth = 150
  const itemsPerRow = Math.max(1, Math.floor(width / itemWidth))
  const legendRows = Math.ceil(series.length / itemsPerRow)
  const legend = series.map((s, i) => {
    const col = i % itemsPerRow
    const row = Math.floor(i / itemsPerRow)
    return `
    <g transform="translate(${pad.left + col * itemWidth}, ${height - 2 + row * 16})">
      <rect width="9" height="9" y="-9" fill="${s.color}" rx="2" />
      <text x="13" y="0" class="chart-legend">${escapeHtml(s.label)}</text>
    </g>`
  }).join('')
  const legendHeight = 18 + (legendRows - 1) * 16

  return `<svg viewBox="0 0 ${width} ${height + legendHeight}" role="img" aria-label="${escapeHtml(yLabel)} trend" class="chart">
    ${gridLines}${xTicks}${lines}
    <g transform="translate(0, 18)">${legend}</g>
  </svg>`
}

// Horizontal bar chart. bars: [{ label, value, color }]
function svgBarChart({ width = 640, bars, valueSuffix = '', barHeight = 22, gap = 10 }) {
  if (bars.length === 0) return svgEmpty(width, 120, 'No data yet.')
  const pad = { left: 220, right: 60, top: 8, bottom: 8 }
  const maxVal = Math.max(1, ...bars.map((b) => b.value))
  const innerW = width - pad.left - pad.right
  const height = pad.top + pad.bottom + bars.length * (barHeight + gap)

  const rows = bars.map((b, i) => {
    const y = pad.top + i * (barHeight + gap)
    const w = Math.max(2, (innerW * b.value) / maxVal)
    return `
      <text x="${pad.left - 10}" y="${y + barHeight / 2 + 4}" text-anchor="end" class="chart-bar-label">${escapeHtml(b.label)}</text>
      <rect x="${pad.left}" y="${y}" width="${w.toFixed(1)}" height="${barHeight}" fill="${b.color}" rx="3"><title>${escapeHtml(b.label)}: ${b.value.toFixed(1)}${valueSuffix}</title></rect>
      <text x="${pad.left + w + 8}" y="${y + barHeight / 2 + 4}" class="chart-bar-value">${b.value.toFixed(1)}${valueSuffix}</text>`
  }).join('')

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart" class="chart">${rows}</svg>`
}

// Attempt heatmap: rows = test names, columns = day, cell color = worst outcome that day
function svgHeatmap({ tests, days, cellSize = 16 }) {
  if (tests.length === 0 || days.length === 0) return svgEmpty(640, 120, 'No flaky attempts recorded yet.')
  const pad = { left: 260, top: 20, right: 10, bottom: 10 }
  const width = pad.left + days.length * cellSize + pad.right
  const height = pad.top + tests.length * cellSize + pad.bottom

  const dayLabels = days.filter((_, i) => days.length <= 20 || i % Math.ceil(days.length / 20) === 0)
    .map((d) => `<text x="${pad.left + days.indexOf(d) * cellSize + cellSize / 2}" y="${pad.top - 6}" text-anchor="middle" class="chart-axis">${d.slice(5)}</text>`)
    .join('')

  const rows = tests.map((t, ti) => {
    const label = `<text x="${pad.left - 8}" y="${pad.top + ti * cellSize + cellSize / 2 + 4}" text-anchor="end" class="chart-bar-label">${escapeHtml(t.name.slice(0, 42))}</text>`
    const cells = days.map((d, di) => {
      const cell = t.byDay.get(d)
      if (!cell) return ''
      const color = cell.attempts > 1 ? 'var(--accent)' : cell.outcome === 'passed' ? 'var(--primary)' : '#c1524f'
      return `<rect x="${pad.left + di * cellSize}" y="${pad.top + ti * cellSize}" width="${cellSize - 2}" height="${cellSize - 2}" fill="${color}" rx="2">
        <title>${escapeHtml(t.name)} — ${d} — ${cell.attempts} attempt(s), ${cell.outcome}</title>
      </rect>`
    }).join('')
    return label + cells
  }).join('')

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Attempt heatmap" class="chart">${dayLabels}${rows}</svg>`
}

// Real timeline chart for one CI run: each job drawn as a bar from its real
// GitHub Actions start to end offset (seconds since the run's first job
// started), colored by dependency stage — this is what actually shows a
// "critical path" (which jobs overlap in parallel vs. which wait on
// something else), unlike a flat list of durations sorted descending.
function svgGantt({ width = 720, jobs, runStartMs }) {
  if (jobs.length === 0 || runStartMs == null) return svgEmpty(width, 200, 'No timing data for the latest run yet.')
  const pad = { left: 210, right: 50, top: 10, bottom: 26 }
  const rowH = 24
  const sorted = jobs.slice().sort((a, b) => new Date(a.StartedAt) - new Date(b.StartedAt))
  const height = pad.top + pad.bottom + sorted.length * rowH
  const maxEnd = Math.max(...sorted.map((j) => (new Date(j.CompletedAt).getTime() - runStartMs) / 1000))
  const innerW = width - pad.left - pad.right
  const xPos = (s) => pad.left + (innerW * s) / maxEnd

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const x = pad.left + innerW * f
    return `<line x1="${x.toFixed(1)}" y1="${pad.top}" x2="${x.toFixed(1)}" y2="${height - pad.bottom}" class="chart-grid" />
      <text x="${x.toFixed(1)}" y="${height - pad.bottom + 14}" text-anchor="middle" class="chart-axis">${Math.round(maxEnd * f)}s</text>`
  }).join('')

  const rows = sorted.map((j, i) => {
    const y = pad.top + i * rowH
    const startS = (new Date(j.StartedAt).getTime() - runStartMs) / 1000
    const endS = (new Date(j.CompletedAt).getTime() - runStartMs) / 1000
    const x1 = xPos(startS)
    const x2 = xPos(endS)
    const stage = JOB_STAGE[j.partitionKey]
    const color = stage ? STAGE_COLOR[stage] : '#8a8a8a'
    const label = `${j.partitionKey}${j.MatrixIndex && j.MatrixIndex !== '0' ? ` (${j.MatrixIndex})` : ''}`
    return `
      <text x="${pad.left - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" class="chart-bar-label">${escapeHtml(label)}</text>
      <rect x="${x1.toFixed(1)}" y="${y + 3}" width="${Math.max(2, x2 - x1).toFixed(1)}" height="${rowH - 8}" fill="${color}" rx="3">
        <title>${escapeHtml(label)} — ${Math.round(endS - startS)}s (${Math.round(startS)}s to ${Math.round(endS)}s into the run)</title>
      </rect>`
  }).join('')

  const stagesPresent = [...new Set(sorted.map((j) => JOB_STAGE[j.partitionKey]).filter(Boolean))].sort()
  const legendItems = stagesPresent.map((s) => ({ label: STAGE_LABEL[s], color: STAGE_COLOR[s] }))
  if (sorted.some((j) => !JOB_STAGE[j.partitionKey])) legendItems.push({ label: 'Non-gating (e.g. AI demo)', color: '#8a8a8a' })
  const legend = legendItems.map((item, i) => `
    <g transform="translate(${pad.left + i * 210}, ${height - 2})">
      <rect width="9" height="9" y="-9" fill="${item.color}" rx="2" />
      <text x="13" y="0" class="chart-legend">${escapeHtml(item.label)}</text>
    </g>`).join('')

  return `<svg viewBox="0 0 ${width} ${height + 16}" role="img" aria-label="Job timeline for the latest CI run, colored by pipeline stage" class="chart">
    ${gridLines}${rows}
    <g transform="translate(0, 18)">${legend}</g>
  </svg>`
}

// Sparkline for a single series
function svgSparkline(values, width = 100, height = 24, color = 'var(--primary)') {
  if (values.length < 2) return `<svg viewBox="0 0 ${width} ${height}" class="sparkline"></svg>`
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return `<svg viewBox="0 0 ${width} ${height}" class="sparkline"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" /></svg>`
}

// ---------------------------------------------------------------------------
// Page shell (shared nav/CSS — same design tokens as the architecture and
// test-strategy docs)
// ---------------------------------------------------------------------------

const NAV = [
  ['index.html', 'Overview'],
  ['flakiness.html', 'Flakiness'],
  ['performance.html', 'Performance'],
  ['sla.html', 'SLA'],
  ['hygiene.html', 'Hygiene'],
  ['failures.html', 'Failures'],
]

function shell(activeFile, title, body, generatedAt) {
  const navLinks = NAV.map(([file, label]) =>
    `<a href="${file}" class="${file === activeFile ? 'active' : ''}">${label}</a>`).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — AcmeCatalog Quality</title>
<style>
  :root {
    --bg: #f5f4f0; --surface: #ffffff; --surface-2: #edece5;
    --ink: #1c2621; --ink-muted: #5b6b62;
    --primary: #2d5540; --primary-dark: #1f3d2d; --primary-tint: #e3ebe6;
    --accent: #c17a4f; --accent-tint: #f3e3d8;
    --border: #dedcd2; --shadow: 0 1px 2px rgba(28,38,33,0.06), 0 8px 24px rgba(28,38,33,0.06);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #141a17; --surface: #1b2420; --surface-2: #212b26;
      --ink: #eef1ee; --ink-muted: #9fb0a6;
      --primary: #6fae8d; --primary-dark: #8ec4a8; --primary-tint: #223229;
      --accent: #e0996a; --accent-tint: #33261d;
      --border: #2d3934; --shadow: 0 1px 2px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.35);
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif; line-height: 1.5; }
  a { color: var(--primary-dark); }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 1.5rem 1.5rem 4rem; }
  nav { display: flex; gap: 0.25rem; margin-bottom: 2rem; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  nav a { padding: 0.7rem 1rem; text-decoration: none; color: var(--ink-muted); font-weight: 600; font-size: 0.9rem; border-bottom: 2px solid transparent; }
  nav a.active { color: var(--primary-dark); border-bottom-color: var(--primary); }
  h1 { font-size: 1.6rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.15rem; margin: 2.25rem 0 0.9rem; }
  .subtitle { color: var(--ink-muted); font-size: 0.9rem; margin-bottom: 1.5rem; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.15rem; box-shadow: var(--shadow); }
  .kpi .value { font-size: 1.7rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .kpi .label { font-size: 0.78rem; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.03em; margin-top: 0.2rem; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; box-shadow: var(--shadow); margin-bottom: 1.5rem; overflow-x: auto; }
  .chart { width: 100%; height: auto; }
  .chart-grid { stroke: var(--border); stroke-width: 1; }
  .chart-axis { font-size: 9px; fill: var(--ink-muted); }
  .chart-legend { font-size: 11px; fill: var(--ink); }
  .chart-bar-label { font-size: 11px; fill: var(--ink); }
  .chart-bar-value { font-size: 11px; fill: var(--ink-muted); font-variant-numeric: tabular-nums; }
  .chart-empty { font-size: 13px; fill: var(--ink-muted); }
  .sparkline { width: 90px; height: 22px; vertical-align: middle; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { text-align: left; padding: 0.5rem 0.65rem; border-bottom: 1px solid var(--border); }
  th { background: var(--surface-2); font-size: 0.7rem; text-transform: uppercase; color: var(--ink-muted); cursor: pointer; user-select: none; }
  tr:hover td { background: var(--surface-2); }
  .badge { display: inline-block; font-size: 0.68rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 4px; }
  input[type=text] { padding: 0.45rem 0.65rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--ink); width: 100%; max-width: 320px; }
  footer { margin-top: 3rem; color: var(--ink-muted); font-size: 0.78rem; }
</style>
</head>
<body>
<div class="wrap">
  <nav>${navLinks}</nav>
  <h1>${escapeHtml(title)}</h1>
  ${body}
  <footer>Generated ${escapeHtml(generatedAt)} · AcmeCatalog CI · <a href="https://github.com/RamishFatimaa/AcmeCatalog">source</a></footer>
</div>
</body>
</html>`
}

function kpi(value, label) {
  return `<div class="kpi"><div class="value">${escapeHtml(value)}</div><div class="label">${escapeHtml(label)}</div></div>`
}

// ---------------------------------------------------------------------------
// Computation + page builders
// ---------------------------------------------------------------------------

function buildOverviewPage(testRuns, jobRuns, generatedAt) {
  const finals = testRuns.filter((r) => r.IsFinalAttempt)
  const passRate = pct(finals.filter((r) => r.FinalOutcome === 'passed').length, finals.length)

  // Contract (Pact) rows are a subset of `finals` (same TestRuns table,
  // partitionKey 'contract-pact') — both consumer specs
  // (IdentityClientPactTests, the frontend's auth.consumer.pact.test.ts)
  // and the provider verifier (IdentityServiceProviderVerificationTests).
  // Surfaced as its own KPI since it answers a different question than the
  // overall pass rate: "are the published contracts currently satisfied,"
  // not "is the suite green."
  const pactFinals = finals.filter((r) => r.partitionKey === 'contract-pact')
  const pactPassRate = pct(pactFinals.filter((r) => r.FinalOutcome === 'passed').length, pactFinals.length)

  const gatingFlakes = testRuns.filter((r) => r.AttemptIndex > 1 && GATING_JOBS.has(r.JobName)).length

  const failed = finals.filter((r) => r.FinalOutcome === 'failed')
  const infra = failed.filter((r) => r.FailureCategory === 'infra-flake').length
  const other = failed.length - infra

  // Same real-timeline definition as the Performance page's critical-path
  // chart (MAX(CompletedAt) - MIN(StartedAt) across gating jobs in a run) —
  // not the max of any single job's own duration, which conflates jobs
  // that ran in parallel with ones that waited on each other.
  const jobRowsFinal = jobRuns.filter((r) => r.StepName === 'JOB' && GATING_JOBS.has(r.partitionKey) && r.DurationSeconds != null)
  const byRun = groupBy(jobRowsFinal, (r) => r.RunId)
  const criticalPaths = [...byRun.values()]
    .map((rows) => {
      const start = Math.min(...rows.map((r) => new Date(r.StartedAt).getTime()))
      const end = Math.max(...rows.map((r) => new Date(r.CompletedAt).getTime()))
      return Math.round((end - start) / 1000)
    })
    .filter((v) => v > 0)
  const medianCriticalPath = median(criticalPaths)

  const passRateByDayLayer = new Map()
  for (const r of finals) {
    const day = dayKey(r.RecordedAt)
    const key = `${r.partitionKey}|${day}`
    if (!passRateByDayLayer.has(key)) passRateByDayLayer.set(key, { pass: 0, total: 0 })
    const bucket = passRateByDayLayer.get(key)
    bucket.total += 1
    if (r.FinalOutcome === 'passed') bucket.pass += 1
  }
  const series = LAYERS.map((layer, i) => ({
    label: LAYER_LABEL[layer],
    color: paletteColor(i),
    points: [...passRateByDayLayer.entries()]
      .filter(([k]) => k.startsWith(`${layer}|`))
      .map(([k, v]) => ({ x: k.split('|')[1], y: pct(v.pass, v.total) })),
  })).filter((s) => s.points.length > 0)

  const failuresByCategory = groupBy(failed, (r) => r.FailureCategory ?? 'unclassified')
  const failCategoryBars = svgBarChart({
    bars: [...failuresByCategory.entries()]
      .map(([cat, rows]) => ({
        label: FAILURE_CATEGORY_LABEL[cat] ?? cat,
        value: rows.length,
        color: FAILURE_CATEGORY_COLOR[cat] ?? '#8a5a3a',
      }))
      .sort((a, b) => b.value - a.value),
    valueSuffix: ' failures',
  })

  const body = `
    <p class="subtitle">Rolling ${LOOKBACK_DAYS}-day window, ${finals.length} final test outcomes.</p>
    <div class="kpi-grid">
      ${kpi(passRate === null ? '—' : `${passRate.toFixed(1)}%`, 'Pass rate')}
      ${kpi(gatingFlakes, 'Gating-job flake incidents')}
      ${kpi(medianCriticalPath === null ? '—' : `${medianCriticalPath}s`, 'Median critical path')}
      ${kpi(failed.length ? `${infra} infra : ${other} real` : '—', 'Failures: infra vs. real')}
      ${kpi(finals.length, 'Test-attempts recorded')}
      ${kpi(pactPassRate === null ? '—' : `${pactPassRate.toFixed(1)}%`, 'Contract (Pact) pass rate')}
    </div>
    <h2>Pass rate over time, by layer</h2>
    <div class="card">${svgLineChart({ series, yLabel: 'Pass rate %', yMax: 100 })}</div>
    <h2>Failure mix</h2>
    <div class="card">${failCategoryBars}</div>
  `
  return shell('index.html', 'Health Overview', body, generatedAt)
}

function buildFlakinessPage(testRuns, generatedAt) {
  const byTest = groupBy(testRuns, (r) => `${r.partitionKey}::${r.TestName}`)
  const flaky = [...byTest.entries()]
    .map(([key, rows]) => {
      const runsForTest = groupBy(rows, (r) => r.RunId)
      const totalRuns = runsForTest.size
      const flakyRuns = [...runsForTest.values()].filter((rs) => rs.some((r) => r.AttemptIndex > 1)).length
      return { key, name: rows[0].TestName, layer: rows[0].partitionKey, totalRuns, flakyRuns, flakeRate: pct(flakyRuns, totalRuns) }
    })
    .filter((t) => t.flakyRuns > 0)
    .sort((a, b) => b.flakeRate - a.flakeRate)

  const attempt1Failures = testRuns.filter((r) => r.AttemptIndex === 1 && r.AttemptState === 'failed' && r.TotalAttempts > 1)
  const recovered = attempt1Failures.filter((r) => r.FinalOutcome === 'passed').length
  const recoveryRate = pct(recovered, attempt1Failures.length)

  const leaderboardBars = svgBarChart({
    bars: flaky.slice(0, 12).map((t) => ({ label: t.name.slice(0, 45), value: t.flakeRate, color: 'var(--accent)' })),
    valueSuffix: '%',
  })

  const heatmapTests = flaky.slice(0, 15).map((t) => {
    const rows = byTest.get(t.key)
    const byDay = new Map()
    for (const r of rows.filter((r) => r.IsFinalAttempt)) {
      const day = dayKey(r.RecordedAt)
      byDay.set(day, { attempts: r.TotalAttempts, outcome: r.FinalOutcome })
    }
    return { name: t.name, byDay }
  })
  const allDays = [...new Set(testRuns.map((r) => dayKey(r.RecordedAt)))].sort()

  const distinctFlaky = flaky.length

  const body = `
    <p class="subtitle">Rolling ${LOOKBACK_DAYS}-day window — the view a plain pass/fail count can't give you.</p>
    <div class="kpi-grid">
      ${kpi(distinctFlaky, 'Distinct tests flaked')}
      ${kpi(attempt1Failures.length, 'Attempt-1 failures')}
      ${kpi(recoveryRate === null ? '—' : `${recoveryRate.toFixed(0)}%`, 'Retry recovery rate')}
    </div>
    <h2>Flaky-test leaderboard (top 12 by flake rate)</h2>
    <div class="card">${leaderboardBars}</div>
    <h2>Attempt heatmap</h2>
    <div class="card">${svgHeatmap({ tests: heatmapTests, days: allDays })}</div>
    <h2>All flaky tests</h2>
    <div class="card">
      <table>
        <thead><tr><th>Test</th><th>Layer</th><th>Flaky runs</th><th>Total runs</th><th>Flake rate</th></tr></thead>
        <tbody>
          ${flaky.map((t) => `<tr><td>${escapeHtml(t.name)}</td><td>${LAYER_LABEL[t.layer] ?? t.layer}</td><td>${t.flakyRuns}</td><td>${t.totalRuns}</td><td>${t.flakeRate.toFixed(1)}%</td></tr>`).join('') || '<tr><td colspan="5">No flaky tests recorded yet — good sign, or not enough runs yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  `
  return shell('flakiness.html', 'Flakiness', body, generatedAt)
}

function buildPerformancePage(testRuns, jobRuns, generatedAt) {
  const jobFinal = jobRuns.filter((r) => r.StepName === 'JOB')
  const latestRunId = [...new Set(jobFinal.map((r) => r.RunId))].sort().at(-1)
  const latestRunJobs = jobFinal.filter((r) => r.RunId === latestRunId && r.DurationSeconds != null)

  const bootSteps = jobRuns.filter((r) => r.StepName !== 'JOB' && r.RunId === latestRunId)
  const bootSeconds = bootSteps.reduce((sum, r) => sum + (r.DurationSeconds ?? 0), 0)
  const totalJobSeconds = latestRunJobs.reduce((sum, r) => sum + (r.DurationSeconds ?? 0), 0)
  const bootPct = pct(bootSeconds, totalJobSeconds)

  // The real critical path, not a stand-in: gating jobs (Stage 1) all start
  // in parallel, and pact-provider-verify (Stage 2) waits on both Pact
  // consumer jobs — so the wall-clock time users actually experience is
  // MAX(CompletedAt) - MIN(StartedAt) across those real GitHub Actions
  // timestamps, not the sum of every job's own duration (which conflates
  // jobs that ran concurrently with ones that waited on each other). Stage
  // 3/4 (record-job-timing, publish-dashboard) run after this and aren't
  // separately timed today — see the caption below.
  const gatingRunJobs = latestRunJobs.filter((r) => !NON_GATING_JOBS.has(r.partitionKey))
  const criticalPathMeta = gatingRunJobs.length
    ? (() => {
        const runStart = Math.min(...gatingRunJobs.map((r) => new Date(r.StartedAt).getTime()))
        const runEnd = Math.max(...gatingRunJobs.map((r) => new Date(r.CompletedAt).getTime()))
        return { runStart, seconds: Math.round((runEnd - runStart) / 1000) }
      })()
    : null

  const finals = testRuns.filter((r) => r.IsFinalAttempt && r.AttemptDurationMs != null)
  const durations = finals.map((r) => r.AttemptDurationMs)
  const p50 = median(durations)
  const p95 = percentile(durations, 95)

  const slowest = [...finals].sort((a, b) => b.AttemptDurationMs - a.AttemptDurationMs).slice(0, 10)

  // Aggregate classification alongside the individual outliers above — P95
  // by layer shows which *kind* of test tends to be slow, not just which
  // ten happened to rank highest today.
  const layerDurationStats = [...groupBy(finals, (r) => r.partitionKey).entries()]
    .map(([layer, rows]) => ({
      layer,
      label: LAYER_LABEL[layer] ?? layer,
      count: rows.length,
      p50: median(rows.map((r) => r.AttemptDurationMs)),
      p95: percentile(rows.map((r) => r.AttemptDurationMs), 95),
    }))
    .sort((a, b) => b.p95 - a.p95)

  // One median point per job per day: matrix jobs (e2e-smoke's 3 shards,
  // e2e-regression's 3 containers) can run multiple times on the same day,
  // and plotting every individual run at the same x position drew a
  // meaningless zigzag instead of a trend line.
  const jobTrend = groupBy(jobFinal, (r) => r.partitionKey)
  const jobNames = [...jobTrend.keys()].sort()
  const jobSeries = jobNames.map((job, i) => {
    const rows = jobTrend.get(job).filter((r) => r.DurationSeconds != null)
    const byDay = groupBy(rows, (r) => dayKey(r.StartedAt))
    const points = [...byDay.entries()].map(([day, dayRows]) => ({
      x: day,
      y: Math.round(median(dayRows.map((r) => r.DurationSeconds))),
      n: dayRows.length,
    }))
    return { label: job, color: paletteColor(i), dashed: NON_GATING_JOBS.has(job), points }
  })

  const body = `
    <p class="subtitle">Latest run: <code>${escapeHtml(latestRunId ?? '—')}</code></p>
    <div class="kpi-grid">
      ${kpi(criticalPathMeta === null ? '—' : `${criticalPathMeta.seconds}s`, 'Critical path (Stage 1–2, measured)')}
      ${kpi(bootPct === null ? '—' : `${bootPct.toFixed(0)}%`, 'Pipeline time spent booting services')}
      ${kpi(p50 === null ? '—' : `${Math.round(p50)}ms`, 'Median test duration (P50)')}
      ${kpi(p95 === null ? '—' : `${Math.round(p95)}ms`, 'P95 test duration')}
      ${kpi(latestRunJobs.length, 'Jobs in latest run')}
    </div>
    <h2>Critical path — latest run (real job timeline, by stage)</h2>
    <p class="subtitle">Bar position/width is each job's real GitHub Actions start and end time, not a sorted duration list — this is what actually shows which jobs ran in parallel vs. which waited on something else. Stage 3 (job-timing rollup) and Stage 4 (dashboard publish) aren't shown: neither is separately timed in CiJobRuns today, and together they typically add another 1–2 minutes after Stage 2 finishes.</p>
    <div class="card">${svgGantt({ jobs: latestRunJobs, runStartMs: criticalPathMeta?.runStart })}</div>
    <h2>Per-job duration trend</h2>
    <div class="card">${svgLineChart({ series: jobSeries, yLabel: 'Duration (s)' })}</div>
    <h2>Test duration by layer</h2>
    <div class="card">
      <table>
        <thead><tr><th>Layer</th><th>Count</th><th>P50</th><th>P95</th></tr></thead>
        <tbody>
          ${layerDurationStats.map((s) => `<tr><td>${escapeHtml(s.label)}</td><td>${s.count}</td><td>${Math.round(s.p50)}ms</td><td>${Math.round(s.p95)}ms</td></tr>`).join('') || '<tr><td colspan="4">No duration data yet.</td></tr>'}
        </tbody>
      </table>
    </div>
    <h2>Slowest individual tests</h2>
    <div class="card">
      <table>
        <thead><tr><th>Test</th><th>Layer</th><th>Duration</th></tr></thead>
        <tbody>
          ${slowest.map((r) => `<tr><td>${escapeHtml(r.TestName)}</td><td>${LAYER_LABEL[r.partitionKey] ?? r.partitionKey}</td><td>${r.AttemptDurationMs}ms</td></tr>`).join('') || '<tr><td colspan="3">No duration data yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  `
  return shell('performance.html', 'Performance & Timing', body, generatedAt)
}

function buildSlaPage(testRuns, generatedAt) {
  // Real network response time (cy.request()'s own `duration`, recorded by
  // the SLA-style tests in api-response-time.cy.ts) — distinct from
  // AttemptDurationMs (that same test's full wall-clock: setup, assertions,
  // retries). A slow suite doesn't necessarily mean a slow API and vice
  // versa, which is exactly why this lives on its own page instead of
  // buried under general test-performance numbers.
  const apiRows = testRuns.filter((r) => r.IsFinalAttempt && r.ResponseTimeMs != null)
  const met = apiRows.filter((r) => r.ResponseTimeMs <= SLA_TARGET_MS).length
  const compliance = pct(met, apiRows.length)
  const breaches = apiRows.filter((r) => r.ResponseTimeMs > SLA_BREACH_MS).length

  const byEndpoint = [...groupBy(apiRows, (r) => r.ApiEndpoint ?? 'Unknown endpoint').entries()]
    .map(([endpoint, rows]) => {
      const times = rows.map((r) => r.ResponseTimeMs)
      const p50 = median(times)
      const p95 = percentile(times, 95)
      const endpointMet = rows.filter((r) => r.ResponseTimeMs <= SLA_TARGET_MS).length
      const status = p95 > SLA_BREACH_MS ? 'breach' : p95 > SLA_TARGET_MS ? 'warn' : 'met'
      return { endpoint, count: rows.length, p50, p95, compliance: pct(endpointMet, rows.length), status }
    })
    .sort((a, b) => b.p95 - a.p95)

  // Literal hex, not a CSS var: the badge appends a hex alpha suffix
  // (`${color}22`) for the tinted background, which only works on a real
  // hex value — `var(--x)22` is invalid CSS and silently drops the
  // background, exactly what happened here before this fix.
  const STATUS_BADGE = {
    met: ['Met', '#2d5540'],
    warn: ['Near limit', '#b08968'],
    breach: ['Breach', '#a3425c'],
  }
  const statusBadge = (status) => {
    const [label, color] = STATUS_BADGE[status]
    return `<span class="badge" style="background:${color}22;color:${color}">${label}</span>`
  }

  const body = `
    <p class="subtitle">Target p95 under ${SLA_TARGET_MS}ms, breach above ${SLA_BREACH_MS}ms — measured from cy.request()'s own network timing in api-response-time.cy.ts, not test wall-clock. Edit SLA_TARGET_MS/SLA_BREACH_MS in generate-dashboard.mjs if your real target differs.</p>
    <div class="kpi-grid">
      ${kpi(compliance === null ? '—' : `${compliance.toFixed(1)}%`, `Requests under ${SLA_TARGET_MS}ms`)}
      ${kpi(breaches, `Breaches (over ${SLA_BREACH_MS}ms)`)}
      ${kpi(apiRows.length, 'Samples measured')}
    </div>
    <h2>SLA by endpoint</h2>
    <div class="card">
      <table>
        <thead><tr><th>Endpoint</th><th>Samples</th><th>P50</th><th>P95</th><th>Under target</th><th>Status</th></tr></thead>
        <tbody>
          ${byEndpoint.map((s) => `<tr><td>${escapeHtml(s.endpoint)}</td><td>${s.count}</td><td>${Math.round(s.p50)}ms</td><td>${Math.round(s.p95)}ms</td><td>${s.compliance.toFixed(0)}%</td><td>${statusBadge(s.status)}</td></tr>`).join('') || '<tr><td colspan="6">No SLA samples recorded yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  `
  return shell('sla.html', 'SLA', body, generatedAt)
}

function buildHygienePage(testRuns, generatedAt) {
  const finals = testRuns.filter((r) => r.IsFinalAttempt)
  const byTestName = groupBy(finals, (r) => r.TestName)
  const isUntagged = (rows) => rows[0].Tag === 'untagged' && rows[0].partitionKey !== 'e2e-api'

  const perLayer = LAYERS.map((layer) => {
    const rows = finals.filter((r) => r.partitionKey === layer)
    if (rows.length === 0) return null
    const distinct = new Set(rows.map((r) => r.TestName)).size
    const passed = rows.filter((r) => r.FinalOutcome === 'passed').length
    const untaggedInLayer = [...groupBy(rows, (r) => r.TestName).values()].filter(isUntagged).length
    return { label: LAYER_LABEL[layer] ?? layer, distinct, passRate: pct(passed, rows.length), untagged: untaggedInLayer }
  }).filter(Boolean)

  const untaggedTests = [...byTestName.entries()]
    .filter(([, rows]) => isUntagged(rows))
    .map(([name, rows]) => ({ name, layer: rows[0].partitionKey }))
    .sort((a, b) => a.layer.localeCompare(b.layer))

  // Seen within the 90-day fetch window but nothing recorded in the last
  // 14 days — a real signal of a test that's dead, disabled, or fell out
  // of every CI tag filter, distinct from a test that simply never existed
  // before (which wouldn't appear here at all).
  const staleCutoff = isoDaysAgo(14)
  const staleTests = [...byTestName.entries()]
    .map(([name, rows]) => ({ name, layer: rows[0].partitionKey, lastSeen: rows.map((r) => r.RecordedAt).sort().at(-1) }))
    .filter((t) => t.lastSeen < staleCutoff)
    .sort((a, b) => (a.lastSeen < b.lastSeen ? -1 : 1))

  const body = `
    <p class="subtitle">Rolling ${LOOKBACK_DAYS}-day window.</p>
    <div class="kpi-grid">
      ${kpi(new Set(finals.map((r) => r.TestName)).size, 'Distinct tests seen')}
      ${kpi(untaggedTests.length, 'Untagged tests (excl. API-contract specs)')}
      ${kpi(staleTests.length, 'Stale tests (no run in 14+ days)')}
    </div>
    <h2>Coverage by layer</h2>
    <div class="card">
      <table>
        <thead><tr><th>Layer</th><th>Distinct tests</th><th>Pass rate</th><th>Untagged</th></tr></thead>
        <tbody>
          ${perLayer.map((l) => `<tr><td>${escapeHtml(l.label)}</td><td>${l.distinct}</td><td>${l.passRate === null ? '—' : `${l.passRate.toFixed(1)}%`}</td><td>${l.untagged}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    <h2>Untagged tests</h2>
    <p class="subtitle">No @smoke/@regression tag — not selectable by either tag-filtered CI job. API-contract specs are excluded; they don't use this tagging scheme.</p>
    <div class="card">
      <table>
        <thead><tr><th>Test</th><th>Layer</th></tr></thead>
        <tbody>
          ${untaggedTests.map((t) => `<tr><td>${escapeHtml(t.name)}</td><td>${LAYER_LABEL[t.layer] ?? t.layer}</td></tr>`).join('') || '<tr><td colspan="2">None — every tagged layer is fully tagged.</td></tr>'}
        </tbody>
      </table>
    </div>
    <h2>Stale tests</h2>
    <p class="subtitle">Recorded within the ${LOOKBACK_DAYS}-day window but not run in the last 14 days — worth checking whether it's dead code, a disabled job, or fell out of every CI tag filter.</p>
    <div class="card">
      <table>
        <thead><tr><th>Test</th><th>Layer</th><th>Last seen</th></tr></thead>
        <tbody>
          ${staleTests.map((t) => `<tr><td>${escapeHtml(t.name)}</td><td>${LAYER_LABEL[t.layer] ?? t.layer}</td><td>${escapeHtml(t.lastSeen.slice(0, 10))}</td></tr>`).join('') || '<tr><td colspan="3">None — every test has run within the last 14 days.</td></tr>'}
        </tbody>
      </table>
    </div>
  `
  return shell('hygiene.html', 'Suite Hygiene', body, generatedAt)
}

function failureBadge(category) {
  const cat = category ?? 'unclassified'
  const label = FAILURE_CATEGORY_LABEL[cat] ?? cat
  const color = FAILURE_CATEGORY_COLOR[cat] ?? '#8a5a3a'
  return `<span class="badge" style="background:${color}22;color:${color}">${escapeHtml(label)}</span>`
}

function buildFailuresPage(testRuns, generatedAt) {
  const failures = testRuns
    .filter((r) => r.IsFinalAttempt && r.FinalOutcome === 'failed')
    .sort((a, b) => (a.RecordedAt < b.RecordedAt ? 1 : -1))
    .slice(0, 300)

  const rowsHtml = failures.map((r) => `
    <tr data-test="${escapeHtml(r.TestName.toLowerCase())}" data-category="${escapeHtml(r.FailureCategory ?? '')}">
      <td>${escapeHtml(r.TestName)}</td>
      <td>${LAYER_LABEL[r.partitionKey] ?? r.partitionKey}</td>
      <td>${failureBadge(r.FailureCategory)}</td>
      <td>${escapeHtml((r.FailureMessage ?? '').slice(0, 120))}</td>
      <td>${escapeHtml(r.CommitSha?.slice(0, 7) ?? '')}</td>
      <td>${escapeHtml(r.Actor ?? '')}</td>
      <td>${escapeHtml(r.RecordedAt?.slice(0, 16) ?? '')}</td>
    </tr>`).join('')

  const body = `
    <p class="subtitle">Most recent ${failures.length} failures across the ${LOOKBACK_DAYS}-day window.</p>
    <input type="text" id="filter-input" placeholder="Filter by test name..." />
    <div class="card" style="margin-top:1rem">
      <table id="failures-table">
        <thead><tr><th>Test</th><th>Layer</th><th>Category</th><th>Message</th><th>Commit</th><th>Actor</th><th>When</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="7">No failures recorded in this window.</td></tr>'}</tbody>
      </table>
    </div>
    <script>
      document.getElementById('filter-input').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase()
        document.querySelectorAll('#failures-table tbody tr').forEach((tr) => {
          tr.style.display = (tr.dataset.test ?? '').includes(q) ? '' : 'none'
        })
      })
      document.querySelectorAll('#failures-table th').forEach((th, colIndex) => {
        th.addEventListener('click', () => {
          const tbody = document.querySelector('#failures-table tbody')
          const rows = [...tbody.querySelectorAll('tr')]
          const asc = th.dataset.asc !== 'true'
          rows.sort((a, b) => a.children[colIndex].textContent.localeCompare(b.children[colIndex].textContent) * (asc ? 1 : -1))
          rows.forEach((r) => tbody.appendChild(r))
          th.dataset.asc = asc
        })
      })
    </script>
  `
  return shell('failures.html', 'Failure Explorer', body, generatedAt)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { testRuns, jobRuns } = await fetchData()
  const generatedAt = new Date().toISOString()

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(`${OUT_DIR}/index.html`, buildOverviewPage(testRuns, jobRuns, generatedAt))
  writeFileSync(`${OUT_DIR}/flakiness.html`, buildFlakinessPage(testRuns, generatedAt))
  writeFileSync(`${OUT_DIR}/performance.html`, buildPerformancePage(testRuns, jobRuns, generatedAt))
  writeFileSync(`${OUT_DIR}/sla.html`, buildSlaPage(testRuns, generatedAt))
  writeFileSync(`${OUT_DIR}/hygiene.html`, buildHygienePage(testRuns, generatedAt))
  writeFileSync(`${OUT_DIR}/failures.html`, buildFailuresPage(testRuns, generatedAt))
  // No staticwebapp.config.json at all: this is 6 real, distinct HTML files
  // (not a client-routed SPA like the frontend), so there's no fallback
  // rewrite to configure — each nav link is a real file Static Web Apps
  // serves directly.

  console.log(`generate-dashboard: wrote 6 pages from ${testRuns.length} test rows / ${jobRuns.length} job rows`)
}

// Guarded rather than a bare top-level call so this module can also be
// imported (e.g. by a local script feeding synthetic rows to a single page
// builder to preview it, without ever touching the real Azure table) —
// only runs main()'s real fetch+deploy path when executed directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('generate-dashboard: failed:', err?.message ?? err)
    process.exit(1)
  })
}

export { buildOverviewPage, buildFlakinessPage, buildPerformancePage, buildSlaPage, buildHygienePage, buildFailuresPage }
