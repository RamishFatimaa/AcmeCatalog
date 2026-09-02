
Cypress.Commands.add('login', (username = 'testuser', password = 'Test123!') => {
  cy.session([username, password], () => {
    cy.visit('/Account/Login')
    cy.get('[data-testid=login-username-input]').type(username)
    cy.get('[data-testid=login-password-input]').type(password)
    cy.get('[data-testid=login-submit-btn]').click()
    cy.url().should('not.include', '/Account/Login')
  })
})

// ---- API-level helpers: bypass the UI entirely for setup/teardown, using the
// real REST endpoints with a JWT bearer token (api/auth + api/items). ----

Cypress.Commands.add('apiLogin', (username = 'testuser', password = 'Test123!') => {
  return cy.request('POST', '/api/auth/login', { username, password })
    .its('body.token')
})

Cypress.Commands.add('apiCreateItem', (token, overrides = {}) => {
  const item = {
    name: `API Item ${Date.now()}`,
    price: 9.99,
    description: 'Created directly via the REST API for test setup.',
    category: 'Electronics',
    ...overrides,
  }

  return cy.request({
    method: 'POST',
    url: '/api/items',
    headers: { Authorization: `Bearer ${token}` },
    body: item,
  }).its('body')
})

Cypress.Commands.add('apiDeleteItem', (token, id) => {
  return cy.request({
    method: 'DELETE',
    url: `/api/items/${id}`,
    headers: { Authorization: `Bearer ${token}` },
    failOnStatusCode: false,
  })
})