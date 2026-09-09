#!/usr/bin/env node
// Generates the 5-page AcmeCatalog quality dashboard as static HTML with
// hand-rendered inline SVG charts (no client-side charting library, no CDN
// dependency) from real rows in Azure Table Storage. Deployed by ci.yml's
// publish-dashboard job via Azure/static-web-apps-deploy@v1 — refreshes on
// every CI run, nothing manual. See the design doc for why each KPI/chart
// exists; this file is the "how," not a restatement of the "why."

import { mkdirSync, writeFileSync } from 'node:fs'
import { TableClient } from '@azure/data-tables'
import { AzureCliCredential } from '@azure/identity'

const STORAGE_ACCOUNT = process.env.METRICS_STORAGE_ACCOUNT ?? 'acmecatalogmetrics'
const OUT_DIR = process.env.DASHBOARD_OUT_DIR ?? 'dist'
const LOOKBACK_DAYS = 90

const GATING_JOBS = new Set(['backend-tests', 'component-tests', 'e2e-smoke', 'e2e-regression'])
const LAYERS = ['backend-unit', 'backend-integration', 'component', 'e2e-ui', 'e2e-api']
const LAYER_LABEL = {
  'backend-unit': 'Backend unit',
  'backend-integration': 'Backend integration',
  component: 'Component',
  'e2e-ui': 'E2E UI',
  'e2e-api': 'E2E API',
}

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

  const lines = series.map((s) => {
    const path = s.points
      .slice()
      .sort((a, b) => (a.x < b.x ? -1 : 1))
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.x).toFixed(1)} ${yPos(p.y).toFixed(1)}`)
      .join(' ')
    const dots = s.points.map((p) => `<circle cx="${xPos(p.x).toFixed(1)}" cy="${yPos(p.y).toFixed(1)}" r="2.5" fill="${s.color}" />`).join('')
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" />${dots}`
  }).join('')

  const legend = series.map((s, i) => `
    <g transform="translate(${pad.left + i * 140}, ${height - 2})">
      <rect width="9" height="9" y="-9" fill="${s.color}" rx="2" />
      <text x="13" y="0" class="chart-legend">${escapeHtml(s.label)}</text>
    </g>`).join('')

  return `<svg viewBox="0 0 ${width} ${height + 16}" role="img" aria-label="${escapeHtml(yLabel)} trend" class="chart">
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
      <rect x="${pad.left}" y="${y}" width="${w.toFixed(1)}" height="${barHeight}" fill="${b.color}" rx="3" />
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
  .badge-flake { background: var(--accent-tint); color: var(--accent); }
  .badge-infra { background: var(--accent-tint); color: var(--accent); }
  .badge-ok { background: var(--primary-tint); color: var(--primary-dark); }
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

  const gatingFlakes = testRuns.filter((r) => r.AttemptIndex > 1 && GATING_JOBS.has(r.JobName)).length

  const failed = finals.filter((r) => r.FinalOutcome === 'failed')
  const infra = failed.filter((r) => r.FailureCategory === 'infra-flake').length
  const other = failed.length - infra

  const jobRowsFinal = jobRuns.filter((r) => r.StepName === 'JOB' && GATING_JOBS.has(r.partitionKey))
  const byRun = groupBy(jobRowsFinal, (r) => r.RunId)
  const criticalPaths = [...byRun.values()]
    .map((rows) => Math.max(...rows.map((r) => r.DurationSeconds ?? 0)))
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
  const colors = { 'backend-unit': '#2d5540', 'backend-integration': '#4d7c62', component: '#c17a4f', 'e2e-ui': '#8a5a3a', 'e2e-api': '#b08968' }
  const series = LAYERS.map((layer) => ({
    label: LAYER_LABEL[layer],
    color: colors[layer],
    points: [...passRateByDayLayer.entries()]
      .filter(([k]) => k.startsWith(`${layer}|`))
      .map(([k, v]) => ({ x: k.split('|')[1], y: pct(v.pass, v.total) })),
  })).filter((s) => s.points.length > 0)

  const failCategoryBars = svgBarChart({
    bars: [
      { label: 'Infra flake', value: infra, color: 'var(--accent)' },
      { label: 'Unclassified / other', value: other, color: '#8a5a3a' },
    ],
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
  const latestRunJobs = jobFinal.filter((r) => r.RunId === latestRunId)

  const bootSteps = jobRuns.filter((r) => r.StepName !== 'JOB' && r.RunId === latestRunId)
  const bootSeconds = bootSteps.reduce((sum, r) => sum + (r.DurationSeconds ?? 0), 0)
  const totalJobSeconds = latestRunJobs.reduce((sum, r) => sum + (r.DurationSeconds ?? 0), 0)
  const bootPct = pct(bootSeconds, totalJobSeconds)

  const waterfall = svgBarChart({
    bars: latestRunJobs
      .filter((r) => r.DurationSeconds != null)
      .sort((a, b) => b.DurationSeconds - a.DurationSeconds)
      .map((r) => ({ label: `${r.partitionKey}${r.MatrixIndex !== '0' ? ` (${r.MatrixIndex})` : ''}`, value: r.DurationSeconds, color: 'var(--primary)' })),
    valueSuffix: 's',
  })

  const finals = testRuns.filter((r) => r.IsFinalAttempt && r.AttemptDurationMs != null)
  const durations = finals.map((r) => r.AttemptDurationMs)
  const p50 = median(durations)
  const p95 = percentile(durations, 95)

  const slowest = [...finals].sort((a, b) => b.AttemptDurationMs - a.AttemptDurationMs).slice(0, 10)

  const jobTrend = groupBy(jobFinal, (r) => r.partitionKey)
  const trendColors = ['#2d5540', '#4d7c62', '#c17a4f', '#8a5a3a', '#b08968']
  const jobSeries = [...jobTrend.entries()].map(([job, rows], i) => ({
    label: job,
    color: trendColors[i % trendColors.length],
    points: rows.filter((r) => r.DurationSeconds != null).map((r) => ({ x: dayKey(r.StartedAt), y: r.DurationSeconds })),
  }))

  const body = `
    <p class="subtitle">Latest run: <code>${escapeHtml(latestRunId ?? '—')}</code></p>
    <div class="kpi-grid">
      ${kpi(bootPct === null ? '—' : `${bootPct.toFixed(0)}%`, 'Pipeline time spent booting services')}
      ${kpi(p50 === null ? '—' : `${Math.round(p50)}ms`, 'Median test duration (P50)')}
      ${kpi(p95 === null ? '—' : `${Math.round(p95)}ms`, 'P95 test duration')}
      ${kpi(latestRunJobs.length, 'Jobs in latest run')}
    </div>
    <h2>Critical path — latest run (by job duration)</h2>
    <div class="card">${waterfall}</div>
    <h2>Per-job duration trend</h2>
    <div class="card">${svgLineChart({ series: jobSeries, yLabel: 'Duration (s)' })}</div>
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

function buildHygienePage(testRuns, generatedAt) {
  const finals = testRuns.filter((r) => r.IsFinalAttempt)
  const byTestName = groupBy(finals, (r) => r.TestName)
  const untagged = [...byTestName.values()].filter((rows) => rows[0].Tag === 'untagged' && !['e2e-api'].includes(rows[0].partitionKey)).length

  const countByLayer = LAYERS.map((layer) => ({
    label: LAYER_LABEL[layer],
    value: new Set(finals.filter((r) => r.partitionKey === layer).map((r) => r.TestName)).size,
    color: 'var(--primary)',
  }))

  const body = `
    <div class="kpi-grid">
      ${kpi(untagged, 'Untagged tests (excl. API-contract specs)')}
      ${kpi(new Set(finals.map((r) => r.TestName)).size, 'Distinct tests seen')}
    </div>
    <h2>Test count by layer</h2>
    <div class="card">${svgBarChart({ bars: countByLayer })}</div>
  `
  return shell('hygiene.html', 'Suite Hygiene', body, generatedAt)
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
      <td><span class="badge ${r.FailureCategory === 'infra-flake' ? 'badge-infra' : 'badge-flake'}">${escapeHtml(r.FailureCategory ?? 'unclassified')}</span></td>
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
  writeFileSync(`${OUT_DIR}/hygiene.html`, buildHygienePage(testRuns, generatedAt))
  writeFileSync(`${OUT_DIR}/failures.html`, buildFailuresPage(testRuns, generatedAt))
  // No staticwebapp.config.json at all: this is 5 real, distinct HTML files
  // (not a client-routed SPA like the frontend), so there's no fallback
  // rewrite to configure — each nav link is a real file Static Web Apps
  // serves directly.

  console.log(`generate-dashboard: wrote 5 pages from ${testRuns.length} test rows / ${jobRuns.length} job rows`)
}

main().catch((err) => {
  console.error('generate-dashboard: failed:', err?.message ?? err)
  process.exit(1)
})
