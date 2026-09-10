// The metrics dashboard's "duration" is test-execution wall-clock (setup,
// assertions, everything a retry re-runs) — genuinely different from how
// long the real HTTP response took, and a regression in one can hide
// inside the other's noise. cy.request()'s resolved response object
// exposes a real `duration` field in milliseconds (verified directly this
// session — cy.intercept()'s interception object exposes no timing field
// at all, so it can't be used for this).
//
// Two endpoints (GET /api/items, POST /api/auth/login) were the original
// coverage here; the SLA dashboard page surfacing only those two prompted
// extending this to the rest of the real API-contract surface already
// covered functionally by auth-api.cy.ts/items-api.cy.ts. Thresholds below
// are set with real headroom above measured local baselines (curl, 3-5
// runs each, this session): plain reads (GET items/:id, categories,
// /auth/me) ~1-8ms; writes (POST/PUT/DELETE items) ~2-26ms — in-process
// SQLite, a handful of seeded rows either way; password-hashing endpoints
// (login, register) ~36-49ms, since ASP.NET Identity's PBKDF2 hashing is
// deliberately slow and CPU-bound, the dominant cost on both. Generous
// enough to absorb CI-runner variance without being flaky; tight enough to
// still catch a real regression (an N+1 query, an accidental synchronous
// block, a hash-cost misconfiguration).

const catalogServiceUrl = Cypress.env('catalogServiceUrl')
const identityServiceUrl = Cypress.env('identityServiceUrl')

function recordAndAssert(testTitlePath: string, endpoint: string, responseTimeMs: number, thresholdMs: number) {
  cy.task('recordApiResponseTime', { testTitle: testTitlePath, endpoint, responseTimeMs })
  expect(responseTimeMs, `${endpoint} took ${responseTimeMs}ms`).to.be.lessThan(thresholdMs)
}

describe('API response time — SLA-style assertions', () => {
  it('GET /api/items responds within 1000ms', function () {
    cy.request(`${catalogServiceUrl}/api/items`).then((response) => {
      recordAndAssert(this.test!.titlePath().join(' > '), 'GET /api/items', response.duration, 1000)
    })
  })

  it('GET /api/items/{id} responds within 1000ms', function () {
    cy.request(`${catalogServiceUrl}/api/items`).then(({ body: items }) => {
      cy.request(`${catalogServiceUrl}/api/items/${items[0].id}`).then((response) => {
        recordAndAssert(this.test!.titlePath().join(' > '), 'GET /api/items/{id}', response.duration, 1000)
      })
    })
  })

  it('GET /api/items/categories responds within 1000ms', function () {
    cy.request(`${catalogServiceUrl}/api/items/categories`).then((response) => {
      recordAndAssert(this.test!.titlePath().join(' > '), 'GET /api/items/categories', response.duration, 1000)
    })
  })

  it('POST /api/auth/login responds within 2000ms', function () {
    cy.request('POST', `${identityServiceUrl}/api/auth/login`, { username: 'testuser', password: 'Test123!' }).then((response) => {
      recordAndAssert(this.test!.titlePath().join(' > '), 'POST /api/auth/login', response.duration, 2000)
    })
  })

  it('POST /api/auth/register responds within 2000ms', function () {
    const username = `sla-timing-${Date.now()}`
    cy.request('POST', `${identityServiceUrl}/api/auth/register`, {
      username,
      email: `${username}@example.com`,
      password: 'Test123!',
      confirmPassword: 'Test123!',
    }).then((response) => {
      recordAndAssert(this.test!.titlePath().join(' > '), 'POST /api/auth/register', response.duration, 2000)
    })
  })

  it('GET /api/auth/me responds within 1000ms', function () {
    cy.apiLogin().then((token) => {
      cy.request({ url: `${identityServiceUrl}/api/auth/me`, headers: { Authorization: `Bearer ${token}` } }).then((response) => {
        recordAndAssert(this.test!.titlePath().join(' > '), 'GET /api/auth/me', response.duration, 1000)
      })
    })
  })

  // recordApiResponseTime (cypress/plugins/recordAttempts.ts) keys its map
  // by test title alone — calling it more than once inside a single it()
  // would silently overwrite everything but the last call, discarding the
  // earlier endpoints' timings. One it() per endpoint, matching every other
  // test in this file, avoids that entirely rather than working around it.
  describe('POST/PUT/DELETE /api/items', () => {
    let token: string
    let itemId: number

    before(() => {
      cy.apiLogin().then((t) => { token = t })
    })

    it('POST /api/items responds within 1000ms', function () {
      cy.request({
        method: 'POST',
        url: `${catalogServiceUrl}/api/items`,
        headers: { Authorization: `Bearer ${token}` },
        body: { name: `SLA timing item ${Date.now()}`, price: 9.99, description: 'sla timing check', category: 'Electronics' },
      }).then((response) => {
        itemId = response.body.id
        recordAndAssert(this.test!.titlePath().join(' > '), 'POST /api/items', response.duration, 1000)
      })
    })

    it('PUT /api/items/{id} responds within 1000ms', function () {
      cy.request({
        method: 'PUT',
        url: `${catalogServiceUrl}/api/items/${itemId}`,
        headers: { Authorization: `Bearer ${token}` },
        body: { id: itemId, name: 'SLA timing item updated', price: 19.99, description: 'sla timing check updated', category: 'Electronics' },
      }).then((response) => {
        recordAndAssert(this.test!.titlePath().join(' > '), 'PUT /api/items/{id}', response.duration, 1000)
      })
    })

    it('DELETE /api/items/{id} responds within 1000ms', function () {
      cy.request({
        method: 'DELETE',
        url: `${catalogServiceUrl}/api/items/${itemId}`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((response) => {
        recordAndAssert(this.test!.titlePath().join(' > '), 'DELETE /api/items/{id}', response.duration, 1000)
      })
    })
  })
})
