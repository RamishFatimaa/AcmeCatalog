// auth.cy.ts deliberately drives login against the real identity-service —
// these specs cover the failure modes that can't be produced by a real,
// healthy backend on demand (a 500, a dropped connection, a slow response),
// which is exactly what cy.intercept()-as-stub is for. Kept in a separate
// file so it's obvious at a glance which specs need identity-service running
// at all versus which stub around it entirely.

describe('Login resilience against a failing identity-service', () => {
  beforeEach(() => {
    cy.visit('/Account/Login')
  })

  it('shows a generic error, not "incorrect password", when identity-service 500s', { tags: '@regression' }, () => {
    // Regression test for a real bug: LoginForm used to treat every ApiError
    // as bad credentials, so a real outage told the user their password was
    // wrong. Only catchable by actually stubbing a 500 — the real backend
    // never produces one for a login attempt.
    cy.allowConsoleErrors()
    cy.intercept('POST', '/api/auth/login', { statusCode: 500, body: {} }).as('loginFailure')

    cy.getBySel('login-username-input').type('testuser')
    cy.getBySel('login-password-input').type('Test123!')
    cy.getBySel('login-submit-btn').click()

    cy.wait('@loginFailure')
    cy.getBySel('login-error-summary').should('be.visible').and('not.contain.text', 'incorrect')
    cy.url().should('include', '/Account/Login')
  })

  it('shows a generic error and re-enables the form on a network failure', { tags: '@regression' }, () => {
    cy.allowConsoleErrors()
    cy.intercept('POST', '/api/auth/login', { forceNetworkError: true }).as('loginNetworkFailure')

    cy.getBySel('login-username-input').type('testuser')
    cy.getBySel('login-password-input').type('Test123!')
    cy.getBySel('login-submit-btn').click()

    cy.wait('@loginNetworkFailure')
    cy.getBySel('login-error-summary').should('be.visible')
    cy.getBySel('login-submit-btn').should('not.be.disabled')
  })

  it('disables the submit button while a login request is pending', { tags: '@regression' }, () => {
    // Nothing against the real backend is slow enough to observe this state.
    cy.intercept('POST', '/api/auth/login', (req) => {
      req.continue((res) => {
        res.setDelay(1000)
      })
    }).as('slowLogin')

    cy.getBySel('login-username-input').type('testuser')
    cy.getBySel('login-password-input').type('Test123!')
    cy.getBySel('login-submit-btn').click()

    cy.getBySel('login-submit-btn').should('be.disabled')
    cy.wait('@slowLogin')
    cy.url().should('include', '/Items')
  })
})
