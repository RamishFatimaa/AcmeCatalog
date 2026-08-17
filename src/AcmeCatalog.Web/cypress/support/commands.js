
Cypress.Commands.add('login', (username, password) => {
  const credentials = username && password
    ? cy.wrap({ username, password })
    : cy.fixture('demo-user')

  credentials.then(({ username, password }) => {
    cy.session([username, password], () => {
      cy.visit('/Account/Login')
      cy.get('[data-testid=login-username-input]').type(username)
      cy.get('[data-testid=login-password-input]').type(password)
      cy.get('[data-testid=login-submit-btn]').click()
      cy.url().should('not.include', '/Account/Login')
    })
  })
})