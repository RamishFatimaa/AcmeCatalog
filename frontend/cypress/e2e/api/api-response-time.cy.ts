// The metrics dashboard's "duration" is test-execution wall-clock (setup,
// assertions, everything a retry re-runs) — genuinely different from how
// long the real HTTP response took, and a regression in one can hide
// inside the other's noise. Nothing before this asserted or recorded real
// API response time. cy.request()'s resolved response object exposes a
// real `duration` field in milliseconds (verified directly this session —
// cy.intercept()'s interception object exposes no timing field at all, so
// it can't be used for this). Thresholds below are set with real headroom
// above measured local baselines (curl, 5 runs each): GET /api/items
// ~1-10ms (in-process SQLite, a handful of seeded rows), POST
// /api/auth/login ~36-49ms (ASP.NET Identity's PBKDF2 password hashing is
// deliberately slow, CPU-bound, and the dominant cost). Generous enough to
// absorb CI-runner variance without being flaky; tight enough to still
// catch a real regression (an N+1 query, an accidental synchronous block,
// a hash-cost misconfiguration).

const catalogServiceUrl = Cypress.env('catalogServiceUrl')
const identityServiceUrl = Cypress.env('identityServiceUrl')

describe('API response time — SLA-style assertions', () => {
  it('GET /api/items responds within 1000ms', function () {
    cy.request(`${catalogServiceUrl}/api/items`).then((response) => {
      cy.task('recordApiResponseTime', {
        testTitle: this.test!.titlePath().join(' > '),
        endpoint: 'GET /api/items',
        responseTimeMs: response.duration,
      })
      expect(response.duration, `GET /api/items took ${response.duration}ms`).to.be.lessThan(1000)
    })
  })

  it('POST /api/auth/login responds within 2000ms', function () {
    cy.request('POST', `${identityServiceUrl}/api/auth/login`, { username: 'testuser', password: 'Test123!' }).then((response) => {
      cy.task('recordApiResponseTime', {
        testTitle: this.test!.titlePath().join(' > '),
        endpoint: 'POST /api/auth/login',
        responseTimeMs: response.duration,
      })
      expect(response.duration, `POST /api/auth/login took ${response.duration}ms`).to.be.lessThan(2000)
    })
  })
})
