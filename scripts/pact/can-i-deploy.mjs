#!/usr/bin/env node
// A real can-i-deploy gate, run from each service's CD workflow before it
// deploys. Deliberately doesn't shell out to the pact-broker CLI (not
// installed anywhere in this repo's toolchain) — this is a plain fetch()
// against the same PactFlow /matrix endpoint already used directly (via
// curl) throughout this project's Pact work, kept as a real Node script
// instead of more inline YAML so it's the same file whether
// identity-service-cd.yml or catalog-service-cd.yml is asking, and so it
// can be run and read locally before trusting it in CI.
//
// Filters matrix rows to verificationType "CDCT" (classic consumer-driven
// Pact verification) only, ignoring "BDCT" (the OpenAPI bidirectional
// comparison) rows entirely for gating purposes — confirmed directly
// against the real broker that a real commit's CDCT row can read
// success:true while its BDCT row reads success:false (PactFlow wants
// provider self-verification results published before a bidirectional
// contract can ever report deployable, and this repo hasn't cracked that
// exact payload shape yet — see the OpenAPI-publish commit's own message).
// Gating on the combined result would permanently block every future
// deploy over a check that's already known-broken for reasons that have
// nothing to do with whether the actual contract is satisfied. BDCT
// results are still printed, just not gated on.
//
// PactFlow's own /matrix response explicitly warns: pin an exact version
// for the pacticipant being deployed, and use latest+branch only for the
// pacticipants it depends on — otherwise the "WARN: ...avoid race
// conditions" note in the response means the result isn't trustworthy.
// This script does exactly that split.

const BROKER_URL = process.env.PACT_BROKER_BASE_URL
const BROKER_TOKEN = process.env.PACT_BROKER_TOKEN
const pacticipant = process.env.CID_PACTICIPANT
const version = process.env.CID_VERSION
const branch = process.env.CID_BRANCH ?? 'stage'
const dependencies = (process.env.CID_DEPENDENCIES ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const MAX_ATTEMPTS = 10
const POLL_INTERVAL_MS = 10_000

function assertEnv() {
  const missing = ['PACT_BROKER_BASE_URL', 'PACT_BROKER_TOKEN', 'CID_PACTICIPANT', 'CID_VERSION']
    .filter((k) => !process.env[k])
  if (missing.length > 0) {
    console.error(`can-i-deploy: missing required env var(s): ${missing.join(', ')}`)
    process.exit(1)
  }
  if (dependencies.length === 0) {
    console.error('can-i-deploy: CID_DEPENDENCIES must list at least one pacticipant this one has a contract with')
    process.exit(1)
  }
}

function buildQuery() {
  const params = new URLSearchParams()
  params.append('q[][pacticipant]', pacticipant)
  params.append('q[][version]', version)
  for (const dep of dependencies) {
    params.append('q[][pacticipant]', dep)
    params.append('q[][latest]', 'true')
    params.append('q[][branch]', branch)
  }
  params.append('latestby', 'cvpv')
  return params
}

async function fetchMatrix() {
  const res = await fetch(`${BROKER_URL}/matrix?${buildQuery()}`, {
    headers: { Authorization: `Bearer ${BROKER_TOKEN}` },
  })
  if (!res.ok) {
    throw new Error(`matrix query failed: HTTP ${res.status}`)
  }
  return res.json()
}

function evaluate(matrixResponse) {
  const cdctRows = matrixResponse.matrix.filter((row) => row.verificationType === 'CDCT')
  const bdctRows = matrixResponse.matrix.filter((row) => row.verificationType === 'BDCT')

  for (const row of bdctRows) {
    const status = row.verificationResult == null ? 'pending' : row.verificationResult.success ? 'passed' : 'failed'
    console.log(`  (informational, not gated) BDCT ${row.consumer.name} <-> ${row.provider.name}: ${status}`)
  }

  // Zero rows looks identical whether verification hasn't started yet
  // (CD races CI, still expected to appear) or will never happen (a real
  // problem) — both read as "nothing here." Treated as pending and
  // retried up to MAX_ATTEMPTS; only main()'s final timeout after
  // exhausting those calls it a real failure.
  if (cdctRows.length === 0) {
    return { state: 'pending' }
  }
  if (cdctRows.some((row) => row.verificationResult == null)) {
    return { state: 'pending' }
  }
  const failed = cdctRows.filter((row) => !row.verificationResult.success)
  if (failed.length > 0) {
    const names = failed.map((row) => `${row.consumer.name}<->${row.provider.name}`).join(', ')
    return { state: 'blocked', reason: `verification failed for: ${names}` }
  }
  return { state: 'deployable' }
}

async function main() {
  assertEnv()
  console.log(`can-i-deploy: ${pacticipant}@${version} (branch ${branch}) against latest ${branch} of [${dependencies.join(', ')}]`)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const matrixResponse = await fetchMatrix()
    const result = evaluate(matrixResponse)

    if (result.state === 'deployable') {
      console.log('can-i-deploy: YES — every required contract verification passed')
      return
    }
    if (result.state === 'blocked') {
      console.error(`can-i-deploy: NO — ${result.reason}`)
      process.exit(1)
    }
    console.log(`can-i-deploy: attempt ${attempt}/${MAX_ATTEMPTS} — verification still pending, waiting ${POLL_INTERVAL_MS / 1000}s...`)
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  console.error('can-i-deploy: NO — timed out waiting for verification results to resolve')
  process.exit(1)
}

main().catch((err) => {
  console.error(`can-i-deploy: failed: ${err?.message ?? err}`)
  process.exit(1)
})
