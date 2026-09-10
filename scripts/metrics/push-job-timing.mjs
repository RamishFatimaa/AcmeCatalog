#!/usr/bin/env node
// Pushes CiJobRuns rows sourced from the GitHub Actions REST API — real
// runner-perspective start/end for every job AND every step, which is what
// lets the dashboard split "boot/health-check dead time" from real test
// execution without touching the existing bash curl loops in ci.yml at all.
// Runs once, after every gating job has finished (`needs: [...]`, `if: always()`).

import { createHash } from 'node:crypto'
import { TableClient } from '@azure/data-tables'
import { AzureCliCredential } from '@azure/identity'

const env = {
  storageAccount: process.env.METRICS_STORAGE_ACCOUNT ?? 'acmecatalogmetrics',
  repo: process.env.GITHUB_REPOSITORY,
  runId: process.env.GITHUB_RUN_ID ?? 'local',
  token: process.env.GITHUB_TOKEN,
  commitSha: process.env.GITHUB_SHA ?? 'unknown',
  branch: process.env.GITHUB_REF_NAME ?? 'unknown',
  triggerEvent: process.env.GITHUB_EVENT_NAME ?? 'unknown',
}

// The health-check boot steps worth splitting out on Page 3 — matched by
// the exact step names used in ci.yml today; a renamed step just silently
// stops appearing here rather than breaking the push.
const TRACKED_STEPS = new Set(['Start identity-service', 'Start catalog-service'])

function shortHash(value) {
  return createHash('sha1').update(value).digest('hex').slice(0, 12)
}

async function fetchJobs() {
  const url = `https://api.github.com/repos/${env.repo}/actions/runs/${env.runId}/jobs?per_page=100`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub jobs API returned ${res.status}`)
  }
  const body = await res.json()
  return body.jobs ?? []
}

function durationSeconds(start, end) {
  if (!start || !end) return null
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
}

function rowsFromJobs(jobs) {
  const rows = []

  for (const job of jobs) {
    // ci.yml's matrix jobs render as "e2e-regression (1)" (a single numeric
    // dimension) but also "e2e-smoke (electron, 1)" (multiple dimensions,
    // joined "browser, containers") — a digit-only capture here matched the
    // first shape but not the second, so every e2e-smoke matrix shard fell
    // through as its own distinct jobName ("e2e-smoke (electron, 1)",
    // "e2e-smoke (electron, 2)", "e2e-smoke (firefox, 1)" as three separate
    // partitions) instead of grouping under one "e2e-smoke" partition with a
    // matrix index — confirmed directly against real CiJobRuns rows, and
    // exactly why the dashboard's per-job trend chart fragmented into
    // near-duplicate series for e2e-smoke instead of one line. Capturing any
    // trailing parenthetical (not just digits) fixes both shapes.
    const match = /^(.*?)(?:\s*\((.+)\))?$/.exec(job.name)
    const jobName = match[1].trim()
    const matrixIndex = match[2] ?? '0'

    rows.push({
      partitionKey: jobName,
      rowKey: `${env.runId}_${matrixIndex}_JOB`,
      RunId: env.runId,
      MatrixIndex: matrixIndex,
      StepName: 'JOB',
      StartedAt: job.started_at,
      CompletedAt: job.completed_at,
      DurationSeconds: durationSeconds(job.started_at, job.completed_at),
      Conclusion: job.conclusion ?? 'unknown',
      Branch: env.branch,
      CommitSha: env.commitSha,
      TriggerEvent: env.triggerEvent,
    })

    for (const step of job.steps ?? []) {
      if (!TRACKED_STEPS.has(step.name)) continue
      rows.push({
        partitionKey: jobName,
        rowKey: `${env.runId}_${matrixIndex}_${shortHash(step.name)}`,
        RunId: env.runId,
        MatrixIndex: matrixIndex,
        StepName: step.name,
        StartedAt: step.started_at,
        CompletedAt: step.completed_at,
        DurationSeconds: durationSeconds(step.started_at, step.completed_at),
        Conclusion: step.conclusion ?? 'unknown',
        Branch: env.branch,
        CommitSha: env.commitSha,
        TriggerEvent: env.triggerEvent,
      })
    }
  }

  return rows
}

async function pushRows(rows) {
  if (rows.length === 0) {
    console.log('push-job-timing: no rows to push')
    return
  }

  const credential = new AzureCliCredential()
  const url = `https://${env.storageAccount}.table.core.windows.net`
  const client = new TableClient(url, 'CiJobRuns', credential)

  const byPartition = new Map()
  for (const row of rows) {
    const { partitionKey, rowKey, ...rest } = row
    if (!byPartition.has(partitionKey)) byPartition.set(partitionKey, [])
    byPartition.get(partitionKey).push({ partitionKey, rowKey, ...rest })
  }

  for (const [partitionKey, entities] of byPartition) {
    const actions = entities.map((e) => ['upsert', e])
    await client.submitTransaction(actions)
    console.log(`push-job-timing: pushed ${entities.length} row(s) for job "${partitionKey}"`)
  }
}

async function main() {
  if (!env.repo || !env.token) {
    console.log('push-job-timing: missing GITHUB_REPOSITORY/GITHUB_TOKEN, skipping (not running in Actions?)')
    return
  }
  const jobs = await fetchJobs()
  const rows = rowsFromJobs(jobs)
  console.log(`push-job-timing: computed ${rows.length} row(s) from ${jobs.length} job(s)`)
  await pushRows(rows)
}

main().catch((err) => {
  console.log(`::warning::push-job-timing failed, dashboard data will be incomplete for this run: ${err?.message ?? err}`)
  process.exit(0)
})
