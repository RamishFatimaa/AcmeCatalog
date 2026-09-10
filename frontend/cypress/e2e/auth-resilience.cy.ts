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

  it('recovers cleanly on a second attempt after the first login request failed', { tags: '@regression' }, () => {
    // Mirrors, at the Cypress layer, the same fail-then-succeed sequencing
    // IdentityClientResilienceTests.cs already proves against a real
    // resilience pipeline server-side — never done here before. There's no
    // frontend auto-retry to test (there isn't one); what this proves is
    // simpler and just as real: after a transient failure, the form doesn't
    // get stuck in a broken state — clicking submit again with the same,
    // still-valid credentials genuinely succeeds. One cy.intercept() with a
    // closure-scoped counter, not two separate intercepts, since Cypress
    // would otherwise just have the second intercept silently replace the
    // first for every subsequent matching request rather than sequencing them.
    cy.allowConsoleErrors()
    let attempt = 0
    cy.intercept('POST', '/api/auth/login', (req) => {
      attempt += 1
      if (attempt === 1) {
        req.reply({ statusCode: 500, body: {} })
      } else {
        req.continue()
      }
    }).as('login')

    cy.getBySel('login-username-input').type('testuser')
    cy.getBySel('login-password-input').type('Test123!')
    cy.getBySel('login-submit-btn').click()

    cy.wait('@login')
    cy.getBySel('login-error-summary').should('be.visible')
    cy.getBySel('login-submit-btn').should('not.be.disabled')

    cy.getBySel('login-submit-btn').click()
    cy.wait('@login')
    cy.url().should('include', '/Items')
    cy.getBySel('account-nav-link').should('contain.text', 'testuser')
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

  it('sends the real username and password in the login request body', { tags: '@regression' }, () => {
    // Every other test in this file checks the response side (what the UI
    // does with a failure); nothing checks the request side — that the
    // exact credentials typed are what actually gets sent. A plain spy
    // (interceptRoute, no handler) lets the real backend answer normally.
    cy.interceptRoute('authLogin')

    cy.getBySel('login-username-input').type('testuser')
    cy.getBySel('login-password-input').type('Test123!')
    cy.getBySel('login-submit-btn').click()

    cy.wait('@authLogin').its('request.body').should('deep.equal', {
      username: 'testuser',
      password: 'Test123!',
    })
  })
})

describe('Registration resilience against a failing identity-service', () => {
  beforeEach(() => {
    cy.visit('/Account/Register')
  })

  function fillRegisterForm(username: string) {
    cy.getBySel('register-username-input').type(username)
    cy.getBySel('register-email-input').type(`${username}@example.com`)
    cy.getBySel('register-password-input').type('Test123!')
    cy.getBySel('register-confirm-password-input').type('Test123!')
  }

  it('shows a generic error, not a validation message, when identity-service 500s', { tags: '@regression' }, () => {
    // Mirrors login's own 500 test — RegisterForm.handleSubmit already
    // handles this branch correctly (verified directly in its source: a
    // non-ApiError, or an ApiError with no field-shaped .problem.errors,
    // falls to the generic 'Could not create the account.' message) —
    // this is a pure test gap, not an app bug, unlike ItemForm's.
    cy.allowConsoleErrors()
    cy.simulateFailure('authRegister', { statusCode: 500, body: {} })

    fillRegisterForm(`resilience${Date.now()}`)
    cy.getBySel('register-submit-btn').click()

    cy.wait('@authRegisterFailure')
    cy.getBySel('register-error-summary').should('be.visible').and('contain.text', 'Could not create the account')
  })

  it('shows a generic error and re-enables the form on a network failure', { tags: '@regression' }, () => {
    cy.allowConsoleErrors()
    cy.simulateFailure('authRegister')

    fillRegisterForm(`resilience${Date.now()}`)
    cy.getBySel('register-submit-btn').click()

    cy.wait('@authRegisterFailure')
    cy.getBySel('register-error-summary').should('be.visible')
    cy.getBySel('register-submit-btn').should('not.be.disabled')
  })

  it('disables the submit button while a registration request is pending', { tags: '@regression' }, () => {
    cy.simulateSlowResponse('authRegister')

    fillRegisterForm(`resilience${Date.now()}`)
    cy.getBySel('register-submit-btn').click()

    cy.getBySel('register-submit-btn').should('be.disabled')
    cy.wait('@authRegisterSlow')
    cy.url().should('include', '/Items')
  })

  it('sends the real username, email, and password in the register request body', { tags: '@regression' }, () => {
    cy.interceptRoute('authRegister')
    const username = `resilience${Date.now()}`

    fillRegisterForm(username)
    cy.getBySel('register-submit-btn').click()

    cy.wait('@authRegister').its('request.body').should('deep.equal', {
      username,
      email: `${username}@example.com`,
      password: 'Test123!',
      confirmPassword: 'Test123!',
    })
  })
})
