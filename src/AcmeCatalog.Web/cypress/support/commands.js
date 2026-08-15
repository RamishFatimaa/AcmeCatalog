
Cypress.Commands.add('login', (username = 'testuser', password = 'Test123!') => {
  cy.session([username, password], () => {
    cy.visit('/Account/Login')
    cy.get('[data-testid=login-username-input]').type(username)
    cy.get('[data-testid=login-password-input]').type(password)
    cy.get('[data-testid=login-submit-btn]').click()
    cy.url().should('not.include', '/Account/Login')
  })
})