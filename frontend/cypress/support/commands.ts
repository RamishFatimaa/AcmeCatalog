import type { LoginResponse } from '../../src/types'
import { API_ROUTES, type RouteName } from './routes'
import type { RouteHandler } from 'cypress/types/net-stubbing'

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

// Interception helpers built on the API_ROUTES registry (routes.ts) — one
// named matcher per real endpoint, so every spec that needs to spy on,
// stub, delay, or assert-auth-on a request goes through the same source
// of truth instead of hand-typing a glob that could drift from another
// spec's (or component test's) version of the same route.

// Plain spy/stub — category A/B (assertion) or D (data-substitution) from
// the interception classification, depending on whether `handler` is given.
Cypress.Commands.add('interceptRoute', (name: RouteName, handler?: RouteHandler) => {
  return cy.intercept(API_ROUTES[name], handler).as(name)
})

// Category C — failure injection. Defaults to a network error; pass
// { statusCode: 500 } (etc.) for a real-status failure instead.
Cypress.Commands.add('simulateFailure', (name: RouteName, opts: Record<string, unknown> = { forceNetworkError: true }) => {
  return cy.intercept(API_ROUTES[name], opts).as(`${name}Failure`)
})

// Category E — latency injection. req.continue() lets the real request
// (and real response body) through; only the response is delayed, so a
// loading-state test still sees the real data once it resolves.
Cypress.Commands.add('simulateSlowResponse', (name: RouteName, delayMs = 1000) => {
  return cy
    .intercept(API_ROUTES[name], (req) => {
      req.continue((res) => {
        res.setDelay(delayMs)
      })
    })
    .as(`${name}Slow`)
})

// One middleware intercept per named route — reads the Authorization
// header on every matching request and asserts its shape, without ever
// replying, so it coexists with whatever stub/spy that test's own
// intercept already registered for the same route (see the plan's
// route-matching section for why this has to be middleware, not a
// second regular intercept). Call once per authenticated describe block;
// not global — see routes.ts's header comment for where this is and
// isn't wired in.
Cypress.Commands.add('assertAuthenticatedWrites', (names: RouteName[]) => {
  names.forEach((name) => {
    cy.intercept({ ...API_ROUTES[name], middleware: true }, (req) => {
      expect(req.headers.authorization, `${name} Authorization header`).to.match(/^Bearer .+\..+\..+$/)
    })
  })
})
