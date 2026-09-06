// Pure REST contract tests against POST /api/auth/login — no browser UI at
// all, so these run in milliseconds and exercise the exact same endpoint the
// login page's form (and every other authenticated request) depends on.

describe('Auth API — POST /api/auth/login', () => {
  it('returns a bearer token and expiry for valid credentials', () => {
    cy.request('POST', '/api/auth/login', { username: 'testuser', password: 'Test123!' })
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
      url: '/api/auth/login',
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
      url: '/api/auth/login',
      body: { username: 'testuser', password: 'WrongPassword1!' },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401)
    })
  })

  it('returns a 400 validation problem when username/password are missing', () => {
    cy.request({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: '', password: '' },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(400)
    })
  })

  it('never returns the JWT signing key or any other server secret in the response', () => {
    cy.request('POST', '/api/auth/login', { username: 'testuser', password: 'Test123!' })
      .its('body')
      .then((body) => {
        const serialized = JSON.stringify(body).toLowerCase()
        expect(serialized).not.to.include('signingkey')
        expect(serialized).not.to.include('secret')
      })
  })
})
