describe('Authentication', () => {
  it('rejects invalid credentials', () => {
    cy.visit('/Account/Login')
    cy.get('[data-testid=login-username-input]').type('wronguser')
    cy.get('[data-testid=login-password-input]').type('WrongPass1!')
    cy.get('[data-testid=login-submit-btn]').click()
    cy.get('[data-testid=login-error-summary]').should('be.visible')
    cy.url().should('include', '/Account/Login')
  })

  it('logs in with demo credentials and redirects away', () => {
    cy.fixture('demo-user').then(({ username, password }) => {
      cy.visit('/Account/Login')
      cy.get('[data-testid=login-username-input]').type(username)
      cy.get('[data-testid=login-password-input]').type(password)
      cy.get('[data-testid=login-submit-btn]').click()
      cy.url().should('not.include', '/Account/Login')
    })
  })

  it('sends anonymous users to login when hitting a protected page', () => {
    cy.visit('/Items/Create')
    cy.url().should('include', '/Account/Login')
  })
})