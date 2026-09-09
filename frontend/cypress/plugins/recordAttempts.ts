import * as fs from 'fs'
import * as path from 'path'

// mocha-junit-reporter (cypress.config.ts's `reporter`) only ever writes the
// *final* outcome per test — with retries.runMode:1, a test that fails then
// passes on retry produces a clean, silent green in that XML, with zero
// trace it was ever unstable. Cypress's own after:spec results carry the
// full per-attempt breakdown (results.tests[].attempts[]) that JUnit
// discards; this writes it to a separate JSON per spec so the metrics
// pipeline can see retries at all, which nothing else in this repo does.
export function recordAttempts(on: Cypress.PluginEvents) {
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
      tests: (results.tests ?? []).map((t) => ({
        title: t.title.join(' > '),
        state: t.state,
        duration: t.duration,
        displayError: t.displayError ?? null,
        attempts: (t.attempts ?? []).map((a) => ({ state: a.state })),
      })),
    }

    const safeName = spec.relative.replace(/[\\/]/g, '__')
    fs.writeFileSync(path.join(outDir, `attempts-${safeName}.json`), JSON.stringify(record))
  })
}
