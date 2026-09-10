import * as fs from 'fs'
import * as path from 'path'

// AttemptDurationMs (from Cypress's own t.duration below) is test-execution
// wall-clock — setup, rendering, every assertion, everything a retry
// re-runs. It is not the same measurement as how long the real HTTP
// response took, and a regression in one can hide inside the other's
// noise. Only cy.request()'s resolved response object exposes real network
// timing (verified directly against a running service this session —
// cy.intercept()'s interception object exposes no timing field at all), so
// a handful of SLA-style tests (api-response-time.cy.ts) call
// cy.task('recordApiResponseTime', ...) with that real duration. Tasks are
// the only channel from spec code back to this Node-side plugin — Cypress's
// own results.tests[] shape below is fixed and not extensible from a
// running test. Keyed by test title and cleared per spec so unrelated
// specs sharing this one long-lived plugin process never cross-contaminate.
const responseTimesByTestTitle = new Map<string, { endpoint: string; responseTimeMs: number }>()

export function recordAttempts(on: Cypress.PluginEvents) {
  on('task', {
    recordApiResponseTime({ testTitle, endpoint, responseTimeMs }: { testTitle: string; endpoint: string; responseTimeMs: number }) {
      responseTimesByTestTitle.set(testTitle, { endpoint, responseTimeMs })
      return null
    },
  })

  on('after:spec', (spec, results) => {
    if (!results) return

    const outDir = path.join('cypress', 'results')
    fs.mkdirSync(outDir, { recursive: true })

    // attempts[].duration doesn't exist in this Cypress version — only the
    // test-level total does — so per-attempt duration is only ever known
    // for the final attempt; earlier attempts get null rather than a
    // fabricated number. Likewise displayError is test-level only, not
    // per-attempt, so every failed attempt shares the same message.
    const record = {
      spec: spec.relative,
      tests: (results.tests ?? []).map((t) => {
        const title = t.title.join(' > ')
        const responseTime = responseTimesByTestTitle.get(title) ?? null
        return {
          title,
          state: t.state,
          duration: t.duration,
          displayError: t.displayError ?? null,
          attempts: (t.attempts ?? []).map((a) => ({ state: a.state })),
          apiEndpoint: responseTime?.endpoint ?? null,
          responseTimeMs: responseTime?.responseTimeMs ?? null,
        }
      }),
    }
    responseTimesByTestTitle.clear()

    const safeName = spec.relative.replace(/[\\/]/g, '__')
    fs.writeFileSync(path.join(outDir, `attempts-${safeName}.json`), JSON.stringify(record))
  })
}
