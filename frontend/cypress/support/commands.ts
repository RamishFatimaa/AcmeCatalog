import type { LoginResponse } from '../../src/types'

// API-level helpers — auth-api.cy.ts/items-api.cy.ts are API-only (no UI),
// and every authenticated E2E spec uses these to set up state instead of
// driving the login form, so tests stay focused on the behavior they're
// actually verifying.

Cypress.Commands.add('apiLogin', (username = 'testuser', password = 'Test123!') => {
  return cy
    .request<LoginResponse>('POST', `${Cypress.env('identityServiceUrl')}/api/auth/login`, { username, password })
    .its('body.token')
})

Cypress.Commands.add('apiCreateItem', (token: string, overrides = {}) => {
  const item = {
    name: `API Item ${Date.now()}`,
    price: 9.99,
    description: 'Created directly via the REST API for test setup.',
    category: 'Electronics',
    ...overrides,
  }

  return cy
    .request({
      method: 'POST',
      url: `${Cypress.env('catalogServiceUrl')}/api/items`,
      headers: { Authorization: `Bearer ${token}` },
      body: item,
    })
    .its('body')
})

Cypress.Commands.add('apiDeleteItem', (token: string, id: number) => {
  return cy.request({
    method: 'DELETE',
    url: `${Cypress.env('catalogServiceUrl')}/api/items/${id}`,
    headers: { Authorization: `Bearer ${token}` },
    failOnStatusCode: false,
  })
})

// Selector helpers — every interactive element in the app carries a
// data-testid, so these are the one way UI-driving specs find elements.
Cypress.Commands.add('getBySel', (selector: string, ...args) => {
  return cy.get(`[data-testid=${selector}]`, ...args)
})

Cypress.Commands.add('getBySelLike', (selector: string, ...args) => {
  return cy.get(`[data-testid*=${selector}]`, ...args)
})

// The .NET equivalent of Real World App's cy.task('db:seed') — restores the
// catalog to its seeded state via TestApiController (Development-only).
Cypress.Commands.add('resetDb', () => {
  return cy.request('POST', `${Cypress.env('catalogServiceUrl')}/api/test/reset`)
})

// Wraps a login request in cy.session() so repeated logins within (and
// across) a spec file are cached instead of re-requested. Goes straight to
// the API (rather than reusing apiLogin, which only returns the token) so
// it can write the exact shape AuthContext.tsx's readStoredAuth() expects
// under its acmecatalog.auth localStorage key, including expiresAtUtc.
//
// Sets localStorage via cy.visit's onBeforeLoad — not a bare
// window.localStorage.setItem() before any visit — so the write lands on
// the app's real origin (before any cy.visit, the AUT is on about:blank,
// a different origin cy.session wouldn't snapshot) and lands before
// AuthContext's initial render reads it, avoiding an unauthenticated flash.
Cypress.Commands.add('loginSession', (username = 'testuser', password = 'Test123!') => {
  cy.session([username, password], () => {
    cy.request<LoginResponse>('POST', `${Cypress.env('identityServiceUrl')}/api/auth/login`, { username, password }).then(({ body }) => {
      cy.visit('/', {
        onBeforeLoad: (win) => win.localStorage.setItem('acmecatalog.auth', JSON.stringify(body)),
      })
    })
  })
})
