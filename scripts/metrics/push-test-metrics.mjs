#!/usr/bin/env node
// Pushes real test-attempt rows into Azure Table Storage's `TestRuns` table —
// the data source behind the AcmeCatalog quality dashboard. Two source
// modes: `cypress` (reads the attempts-*.json files recordAttempts.ts
// writes, which carry the per-attempt breakdown JUnit discards) and
// `dotnet` (parses TRX directly — NUnit here never retries, so every test
// is exactly one attempt).
//
// Deliberately non-fatal: a metrics push failing must never fail the CI job
// it's attached to (`if: always()` on the calling step handles that; this
// script also never throws past its own top-level catch).

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { TableClient } from '@azure/data-tables'
import { AzureCliCredential } from '@azure/identity'

const mode = process.argv[2]
const arg = process.argv[3]

const env = {
  storageAccount: process.env.METRICS_STORAGE_ACCOUNT ?? 'acmecatalogmetrics',
  runId: process.env.GITHUB_RUN_ID ?? 'local',
  jobName: process.env.METRICS_JOB_NAME ?? process.env.GITHUB_JOB ?? 'unknown',
  matrixIndex: process.env.METRICS_MATRIX_INDEX ?? '0',
  commitSha: process.env.GITHUB_SHA ?? 'unknown',
  branch: process.env.GITHUB_REF_NAME ?? 'unknown',
  prNumber: process.env.METRICS_PR_NUMBER ?? '',
  actor: process.env.GITHUB_ACTOR ?? 'unknown',
  triggerEvent: process.env.GITHUB_EVENT_NAME ?? 'unknown',
}

function shortHash(value) {
  return createHash('sha1').update(value).digest('hex').slice(0, 12)
}

function truncate(message, max = 500) {
  if (!message) return null
  return message.length > max ? `${message.slice(0, max)}…` : message
}

// Seeded heuristic, not a solved classifier — see the test-strategy doc.
// Order matters: most specific/actionable category wins. Anything not
// matched stays "unclassified" for manual/dashboard-side triage. Patterns
// are real, documented message shapes from the tools this repo actually
// uses (Cypress+Chai's AssertionError text, NUnit's Assert.That
// Expected/But was block, Pact's verifier mismatch report, standard HTTP
// error wording) — not invented categories with no message to match.
function classifyFailure(message) {
  if (!message) return null
  if (/ECONNREFUSED|ECONNRESET|EAI_AGAIN|getaddrinfo|ERR_CONNECTION/i.test(message)) return 'infra-flake'
  if (/failed to start/i.test(message)) return 'infra-flake'
  if (/Timed out retrying.*cy\.(wait|visit|intercept)/is.test(message)) return 'infra-flake'
  if (/Verification Mismatches|actual interactions do not match|expected header|expected a request/i.test(message)) return 'contract-mismatch'
  if (/Request failed with status code [45]\d\d|\b[45]\d\d\b.*(Internal Server Error|Bad Request|Not Found|Unauthorized|Forbidden)/i.test(message)) return 'http-error'
  if (/Timed out retrying.*cy\.(get|find|contains|should)/is.test(message)) return 'ui-timeout'
  if (/AssertionError|expected .* to (equal|deep equal|include|match|be)|Expected:[\s\S]*But was:/i.test(message)) return 'assertion-failure'
  return 'unclassified'
}

function baseRow(layer, testName, tag) {
  return {
    partitionKey: layer,
    TestName: testName,
    Tag: tag ?? 'untagged',
    RunId: env.runId,
    JobName: env.jobName,
    MatrixIndex: env.matrixIndex,
    CommitSha: env.commitSha,
    Branch: env.branch,
    PRNumber: env.prNumber,
    Actor: env.actor,
    TriggerEvent: env.triggerEvent,
    RecordedAt: new Date().toISOString(),
  }
}

// ---- Cypress source: attempts-*.json (written by cypress/plugins/recordAttempts.ts) ----

function specToLayer(specRelativePath) {
  if (specRelativePath.startsWith('src/components/')) return 'component'
  if (specRelativePath.includes('/e2e/api/')) return 'e2e-api'
  return 'e2e-ui'
}

// Tags aren't exposed on Cypress's own result objects (they only drive
// @cypress/grep's filtering) — extracted here by reading the spec source
// directly and matching each test's title against its own it(...) call.
// A regex heuristic, not a real parse; stated as such.
function extractTagMap(specSourcePath) {
  const map = new Map()
  let text
  try {
    text = readFileSync(specSourcePath, 'utf8')
  } catch {
    return map
  }
  const re = /it\(\s*(['"`])((?:\\.|(?!\1).)*)\1\s*,\s*(?:\{\s*tags:\s*(['"`])(@\w+)\3\s*\}\s*,)?/g
  let m
  while ((m = re.exec(text))) {
    map.set(m[2], m[4] ?? null)
  }
  return map
}

function rowsFromCypressResults(resultsDir) {
  const files = readdirSync(resultsDir).filter((f) => f.startsWith('attempts-') && f.endsWith('.json'))
  const rows = []

  for (const file of files) {
    const record = JSON.parse(readFileSync(join(resultsDir, file), 'utf8'))
    const layer = specToLayer(record.spec)
    const tagMap = extractTagMap(record.spec)

    for (const test of record.tests) {
      // @cypress/grep doesn't remove non-matching tests from a spec file —
      // it marks them Mocha-`pending` internally (e.g. an @regression test
      // living in the same file as an @smoke one, when running e2e-smoke).
      // They never actually ran; recording them as attempts would silently
      // drag pass rate down for tests nothing executed, real bug this
      // pipeline's own first live run surfaced.
      if (test.state === 'pending') continue
      const total = test.attempts.length
      const failureCategory = test.state === 'failed' ? classifyFailure(test.displayError) : null
      const nameHash = shortHash(test.title)

      test.attempts.forEach((attempt, idx) => {
        const attemptIndex = idx + 1
        const isFinal = attemptIndex === total
        rows.push({
          ...baseRow(layer, test.title, tagMap.get(test.title.split(' > ').pop())),
          rowKey: `${env.runId}_${env.jobName}_${env.matrixIndex}_${nameHash}_${attemptIndex}`,
          SpecOrClass: record.spec,
          AttemptIndex: attemptIndex,
          AttemptState: attempt.state,
          AttemptDurationMs: isFinal ? test.duration : null,
          IsFinalAttempt: isFinal,
          FinalOutcome: test.state,
          TotalAttempts: total,
          FailureMessage: attempt.state === 'failed' ? truncate(test.displayError) : null,
          FailureCategory: attempt.state === 'failed' ? failureCategory : null,
          // Real network duration from cy.request()'s own `duration` field,
          // for the handful of SLA-style tests that measure it — distinct
          // from AttemptDurationMs above (test-execution wall-clock).
          // null for every other test, which is most of them.
          ApiEndpoint: test.apiEndpoint ?? null,
          ResponseTimeMs: isFinal ? (test.responseTimeMs ?? null) : null,
        })
      })
    }
  }

  return rows
}

// ---- .NET source: TRX (NUnit, no retries — always exactly one attempt) ----

// Kept in sync with the real [Category("Unit")] attributes added to the
// test source (ItemEnricherTests.cs, ItemServiceTests.cs) — this script's
// own class-name heuristic doesn't read NUnit categories from the TRX, so
// it needs the same class list maintained by hand here.
const BACKEND_UNIT_CLASSES = new Set(['ItemEnricherTests', 'ItemServiceTests'])

// Both real consumer/provider Pact test classes — lumping these into
// 'backend-integration' would blur the exact distinction this dashboard
// otherwise exists to keep, given how much of this round was specifically
// about proving Pact coverage is real and separate from every other layer.
const CONTRACT_PACT_CLASSES = new Set(['IdentityClientPactTests', 'IdentityServiceProviderVerificationTests'])

function classNameToLayer(className) {
  const short = className.split('.').pop()
  if (CONTRACT_PACT_CLASSES.has(short)) return 'contract-pact'
  return BACKEND_UNIT_CLASSES.has(short) ? 'backend-unit' : 'backend-integration'
}

function trxDurationToMs(duration) {
  const m = /^(\d+):(\d{2}):(\d{2})\.(\d+)$/.exec(duration ?? '')
  if (!m) return null
  const [, h, min, s, frac] = m
  return (Number(h) * 3600 + Number(min) * 60 + Number(s)) * 1000 + Number(frac.slice(0, 3).padEnd(3, '0'))
}

function mapOutcome(trxOutcome) {
  if (trxOutcome === 'Passed') return 'passed'
  if (trxOutcome === 'Failed') return 'failed'
  return 'skipped'
}

function rowsFromTrxDir(trxDir) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const files = readdirSync(trxDir).filter((f) => f.endsWith('.trx'))
  const rows = []

  for (const file of files) {
    const xml = parser.parse(readFileSync(join(trxDir, file), 'utf8'))
    const run = xml.TestRun
    const results = [].concat(run?.Results?.UnitTestResult ?? [])
    const definitions = [].concat(run?.TestDefinitions?.UnitTest ?? [])

    const classById = new Map()
    for (const def of definitions) {
      classById.set(def['@_id'], def.TestMethod?.['@_className'] ?? 'Unknown')
    }

    for (const result of results) {
      const className = classById.get(result['@_testId']) ?? 'Unknown'
      const layer = classNameToLayer(className)
      const outcome = mapOutcome(result['@_outcome'])
      const testName = result['@_testName']
      const errorMessage = result.Output?.ErrorInfo?.Message ?? null

      rows.push({
        ...baseRow(layer, testName, null),
        rowKey: `${env.runId}_${env.jobName}_${env.matrixIndex}_${shortHash(className + testName)}_1`,
        SpecOrClass: className,
        AttemptIndex: 1,
        AttemptState: outcome,
        AttemptDurationMs: trxDurationToMs(result['@_duration']),
        IsFinalAttempt: true,
        FinalOutcome: outcome,
        TotalAttempts: 1,
        FailureMessage: outcome === 'failed' ? truncate(errorMessage) : null,
        FailureCategory: outcome === 'failed' ? classifyFailure(errorMessage) : null,
      })
    }
  }

  return rows
}

// ---- Vitest source: --reporter=json output (the frontend's Pact consumer
// tests — real structure confirmed directly against a real run, not
// assumed: testResults[].assertionResults[] with title/status/duration/
// failureMessages, no retries here either so always exactly one attempt ----

function mapVitestStatus(status) {
  if (status === 'passed') return 'passed'
  if (status === 'failed') return 'failed'
  return 'skipped'
}

function rowsFromVitestResults(jsonPath) {
  const report = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const rows = []

  for (const file of report.testResults ?? []) {
    const specPath = relative(process.cwd(), file.name)
    for (const assertion of file.assertionResults ?? []) {
      const outcome = mapVitestStatus(assertion.status)
      const failureMessage = assertion.failureMessages?.[0] ?? null

      rows.push({
        ...baseRow('contract-pact', assertion.fullName, null),
        rowKey: `${env.runId}_${env.jobName}_${env.matrixIndex}_${shortHash(specPath + assertion.fullName)}_1`,
        SpecOrClass: specPath,
        AttemptIndex: 1,
        AttemptState: outcome,
        AttemptDurationMs: assertion.duration ?? null,
        IsFinalAttempt: true,
        FinalOutcome: outcome,
        TotalAttempts: 1,
        FailureMessage: outcome === 'failed' ? truncate(failureMessage) : null,
        FailureCategory: outcome === 'failed' ? classifyFailure(failureMessage) : null,
      })
    }
  }

  return rows
}

// ---- push ----

async function pushRows(rows) {
  if (rows.length === 0) {
    console.log('push-test-metrics: no rows to push')
    return
  }

  const credential = new AzureCliCredential()
  const url = `https://${env.storageAccount}.table.core.windows.net`
  const client = new TableClient(url, 'TestRuns', credential)

  const byPartition = new Map()
  for (const row of rows) {
    const { partitionKey, rowKey, ...rest } = row
    const entity = { partitionKey, rowKey, ...rest }
    if (!byPartition.has(partitionKey)) byPartition.set(partitionKey, [])
    byPartition.get(partitionKey).push(entity)
  }

  for (const [partitionKey, entities] of byPartition) {
    for (let i = 0; i < entities.length; i += 100) {
      const batch = entities.slice(i, i + 100)
      // upsert, not create: a re-run of the same GitHub Actions run_id
      // (e.g. "re-run failed jobs") would otherwise collide on these exact
      // row keys and fail — harmless to overwrite with identical data.
      const actions = batch.map((e) => ['upsert', e])
      await client.submitTransaction(actions)
      console.log(`push-test-metrics: pushed ${batch.length} rows for partition "${partitionKey}"`)
    }
  }
}

async function main() {
  let rows = []
  if (mode === 'cypress') {
    rows = rowsFromCypressResults(arg ?? 'cypress/results')
  } else if (mode === 'dotnet') {
    rows = rowsFromTrxDir(arg ?? 'TestResults')
  } else if (mode === 'vitest') {
    rows = rowsFromVitestResults(arg ?? 'vitest-report.json')
  } else {
    console.error(`push-test-metrics: unknown mode "${mode}" (expected "cypress", "dotnet", or "vitest")`)
    process.exit(0)
  }

  console.log(`push-test-metrics: computed ${rows.length} row(s) from ${mode} source`)
  await pushRows(rows)
}

main().catch((err) => {
  // A GitHub Actions warning annotation, not error/exit-1: this must never
  // fail the real test job it's attached to, but a metrics push failing
  // silently (only visible if someone happens to read this step's log) is
  // exactly the kind of invisible failure this whole pipeline exists to
  // stop happening to actual tests — it shouldn't happen to itself unnoticed.
  console.log(`::warning::push-test-metrics failed, dashboard data will be incomplete for this run: ${err?.message ?? err}`)
  process.exit(0)
})
