import type { Item, LoginResponse } from '../../src/types'

declare global {
  namespace Cypress {
    interface Chainable {
      /** Logs in via POST /api/auth/login and yields the bearer token. */
      apiLogin(username?: string, password?: string): Chainable<string>

      /** Creates an item via POST /api/items and yields the created item. */
      apiCreateItem(token: string, overrides?: Partial<Item>): Chainable<Item>

      /** Deletes an item via DELETE /api/items/{id}. Never fails the test on a non-2xx status. */
      apiDeleteItem(token: string, id: number): Chainable<Cypress.Response<unknown>>

      /** cy.get(`[data-testid=selector]`) */
      getBySel(selector: string, options?: Partial<Cypress.Loggable & Cypress.Timeoutable & Cypress.Withinable & Cypress.Shadow>): Chainable<JQuery<HTMLElement>>

      /** cy.get(`[data-testid*=selector]`) — matches a data-testid containing selector. */
      getBySelLike(selector: string, options?: Partial<Cypress.Loggable & Cypress.Timeoutable & Cypress.Withinable & Cypress.Shadow>): Chainable<JQuery<HTMLElement>>

      /** Resets the catalog to its seeded state via POST /api/test/reset (Development-only). */
      resetDb(): Chainable<Cypress.Response<unknown>>

      /** Logs in as `username` and caches the resulting auth session via cy.session(). */
      loginSession(username?: string, password?: string): Chainable<void>

      /** Opts the current test out of the global "no console.error" check (support/e2e.ts). */
      allowConsoleErrors(): Chainable<void>
    }
  }
}

export type { Item, LoginResponse }
