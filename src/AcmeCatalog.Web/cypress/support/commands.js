// API-level helpers — the whole suite is API-only now (see cypress/e2e/api/),
// so these use the real REST endpoints directly with a JWT bearer token
// rather than driving a UI login form.

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