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
// Anything not matched stays "unclassified" for manual/dashboard-side triage.
function classifyFailure(message) {
  if (!message) return null
  if (/ECONNREFUSED|ECONNRESET|EAI_AGAIN|getaddrinfo|ERR_CONNECTION/i.test(message)) return 'infra-flake'
  if (/failed to start/i.test(message)) return 'infra-flake'
  if (/Timed out retrying.*cy\.(wait|visit|get|intercept)/is.test(message)) return 'infra-flake'
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
        })
      })
    }
  }

  return rows
}

// ---- .NET source: TRX (NUnit, no retries — always exactly one attempt) ----

const BACKEND_UNIT_CLASSES = new Set(['ItemEnricherTests'])

function classNameToLayer(className) {
  const short = className.split('.').pop()
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
  } else {
    console.error(`push-test-metrics: unknown mode "${mode}" (expected "cypress" or "dotnet")`)
    process.exit(0)
  }

  console.log(`push-test-metrics: computed ${rows.length} row(s) from ${mode} source`)
  await pushRows(rows)
}

main().catch((err) => {
  console.error('push-test-metrics: non-fatal error, CI job continues:', err?.message ?? err)
  process.exit(0)
})
