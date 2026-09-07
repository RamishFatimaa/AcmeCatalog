// Drives the real Login/Register forms end to end — the one place in the
// suite that exercises the UI login flow directly, since every other
// authenticated spec uses cy.loginSession() to bypass it (see catalog-manage.cy.ts).

describe('Authentication', () => {
  beforeEach(() => {
    cy.resetDb()
  })

  it('registers a new account and is auto-logged in, landing on the catalog', { tags: '@smoke' }, () => {
    const username = `cy-user-${Date.now()}`

    cy.visit('/Account/Register')
    cy.getBySel('register-username-input').type(username)
    cy.getBySel('register-email-input').type(`${username}@example.com`)
    cy.getBySel('register-password-input').type('Test123!')
    cy.getBySel('register-confirm-password-input').type('Test123!')
    cy.getBySel('register-submit-btn').click()

    cy.url().should('include', '/Items')
    cy.getBySel('account-nav-link').should('contain.text', username)
  })

  it('rejects registration with a username that already exists', { tags: '@regression' }, () => {
    cy.visit('/Account/Register')
    cy.getBySel('register-username-input').type('testuser')
    cy.getBySel('register-email-input').type('another@example.com')
    cy.getBySel('register-password-input').type('Test123!')
    cy.getBySel('register-confirm-password-input').type('Test123!')
    cy.getBySel('register-submit-btn').click()

    cy.getBySel('register-error-summary').should('be.visible')
    cy.url().should('include', '/Account/Register')
  })

  it('rejects registration when the passwords do not match', { tags: '@regression' }, () => {
    cy.visit('/Account/Register')
    cy.getBySel('register-username-input').type(`cy-user-${Date.now()}`)
    cy.getBySel('register-email-input').type('mismatch@example.com')
    cy.getBySel('register-password-input').type('Test123!')
    cy.getBySel('register-confirm-password-input').type('Different123!')
    cy.getBySel('register-submit-btn').click()

    cy.getBySel('register-error-summary').should('contain.text', 'Passwords do not match')
  })

  it('logs in with valid credentials and lands on the catalog', { tags: '@smoke' }, () => {
    cy.visit('/Account/Login')
    cy.getBySel('login-username-input').type('testuser')
    cy.getBySel('login-password-input').type('Test123!')
    cy.getBySel('login-submit-btn').click()

    cy.url().should('include', '/Items')
    cy.getBySel('account-nav-link').should('contain.text', 'testuser')
  })

  it('rejects invalid credentials with an inline error, staying on the login page', { tags: '@regression' }, () => {
    cy.visit('/Account/Login')
    cy.getBySel('login-username-input').type('testuser')
    cy.getBySel('login-password-input').type('WrongPassword1!')
    cy.getBySel('login-submit-btn').click()

    cy.getBySel('login-error-summary').should('contain.text', 'Username or password is incorrect')
    cy.url().should('include', '/Account/Login')
  })

  it('logs out and clears the session, hiding authenticated nav links', { tags: '@smoke' }, () => {
    cy.loginSession()
    cy.visit('/Items')

    cy.getBySel('logout-btn').click()

    cy.getBySel('login-nav-link').should('be.visible')
    cy.getBySel('account-nav-link').should('not.exist')
    cy.window().its('localStorage').invoke('getItem', 'acmecatalog.auth').should('be.null')
  })

  it('redirects anonymous visitors away from /Account/Profile to the login page', { tags: '@regression' }, () => {
    cy.visit('/Account/Profile')
    cy.url().should('include', '/Account/Login')
  })
})
