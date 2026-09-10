// Pure REST contract tests against POST /api/auth/login — no browser UI at
// all, so these run in milliseconds and exercise the exact same endpoint the
// login page's form (and every other authenticated request) depends on.

const identityServiceUrl = Cypress.env('identityServiceUrl')

describe('Auth API — POST /api/auth/login', () => {
  it('returns a bearer token and expiry for valid credentials', () => {
    cy.request('POST', `${identityServiceUrl}/api/auth/login`, { username: 'testuser', password: 'Test123!' })
      .then((response) => {
        expect(response.status).to.eq(200)
        expect(response.body).to.have.property('token').that.is.a('string').and.not.empty
        expect(response.body).to.have.property('expiresAtUtc')
        expect(response.body.username).to.eq('testuser')
      })
  })

  it('rejects an unknown username with 401 and a ProblemDetails body', () => {
    cy.request({
      method: 'POST',
      url: `${identityServiceUrl}/api/auth/login`,
      body: { username: 'no-such-user', password: 'whatever' },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401)
      expect(response.body.title).to.eq('Invalid credentials')
    })
  })

  it('rejects a wrong password with 401', () => {
    cy.request({
      method: 'POST',
      url: `${identityServiceUrl}/api/auth/login`,
      body: { username: 'testuser', password: 'WrongPassword1!' },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401)
    })
  })

  it('returns a 400 validation problem when username/password are missing', () => {
    cy.request({
      method: 'POST',
      url: `${identityServiceUrl}/api/auth/login`,
      body: { username: '', password: '' },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400)
    })
  })

  it('never returns the JWT signing key or any other server secret in the response', () => {
    cy.request('POST', `${identityServiceUrl}/api/auth/login`, { username: 'testuser', password: 'Test123!' })
      .its('body')
      .then((body) => {
        const serialized = JSON.stringify(body).toLowerCase()
        expect(serialized).not.to.include('signingkey')
        expect(serialized).not.to.include('secret')
      })
  })
})

describe('Auth API — POST /api/auth/register', () => {
  it('creates an account and returns a real bearer token, same shape as login', () => {
    const username = `api-register-${Date.now()}`

    cy.request('POST', `${identityServiceUrl}/api/auth/register`, {
      username,
      email: `${username}@example.com`,
      password: 'Test123!',
      confirmPassword: 'Test123!',
    }).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body).to.have.property('token').that.is.a('string').and.not.empty
      expect(response.body).to.have.property('expiresAtUtc')
      expect(response.body.username).to.eq(username)
    })
  })

  it('rejects a username that already exists with a 400 validation problem', () => {
    cy.request({
      method: 'POST',
      url: `${identityServiceUrl}/api/auth/register`,
      body: { username: 'testuser', email: 'dup@example.com', password: 'Test123!', confirmPassword: 'Test123!' },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400)
    })
  })

  it('rejects mismatched password/confirmPassword with a 400 validation problem', () => {
    // RegisterRequest's ConfirmPassword carries a real server-side
    // [Compare(nameof(Password))] attribute — this isn't only caught by
    // the frontend form, the API enforces it independently.
    cy.request({
      method: 'POST',
      url: `${identityServiceUrl}/api/auth/register`,
      body: {
        username: `api-register-${Date.now()}`,
        email: 'mismatch@example.com',
        password: 'Test123!',
        confirmPassword: 'Different123!',
      },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400)
    })
  })

  it('returns a 400 validation problem on an empty payload', () => {
    cy.request({
      method: 'POST',
      url: `${identityServiceUrl}/api/auth/register`,
      body: {},
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400)
    })
  })
})

describe('Auth API — GET /api/auth/me', () => {
  it('returns the authenticated user for a valid bearer token', () => {
    cy.apiLogin().then((token) => {
      cy.request({
        url: `${identityServiceUrl}/api/auth/me`,
        headers: { Authorization: `Bearer ${token}` },
      }).then((response) => {
        expect(response.status).to.eq(200)
        expect(response.body.username).to.eq('testuser')
        expect(response.body).to.have.property('email').that.is.a('string').and.not.empty
      })
    })
  })

  it('rejects a request with no token with a 401', () => {
    cy.request({
      url: `${identityServiceUrl}/api/auth/me`,
      failOnStatusCode: false,
    }).its('status').should('eq', 401)
  })
})
