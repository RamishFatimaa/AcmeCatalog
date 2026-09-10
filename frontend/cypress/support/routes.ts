// Single source of truth for every real endpoint this suite intercepts,
// across both real services and both test layers (component + e2e).
// hostname/port come from the same env vars cypress.config.ts already
// defines, so a matcher can never silently point at the wrong service —
// and because they're set, a `path` entry only has to be exact within
// that one service, no `**` origin-wildcard prefix needed. The two
// numeric-id endpoints that share a method with another real route
// (`PUT /api/items/:id` vs `PUT /api/items/reorder`) use a regex `url`
// instead of `path`, so they can't collide regardless of declaration
// order — see the plan's route-matching section for why.

import type { RouteMatcherOptions } from 'cypress/types/net-stubbing'

const identity = new URL(Cypress.env('identityServiceUrl'))
const catalog = new URL(Cypress.env('catalogServiceUrl'))

function svc(u: URL): { hostname: string; port: number } {
  return { hostname: u.hostname, port: Number(u.port) }
}

export const API_ROUTES = {
  authLogin: { ...svc(identity), method: 'POST', path: '/api/auth/login' },
  authRegister: { ...svc(identity), method: 'POST', path: '/api/auth/register' },
  authMe: { ...svc(identity), method: 'GET', path: '/api/auth/me' },

  // pathname, not path — GetItems() always sends search/sort/filter as a
  // query string, and RouteMatcher's `path` includes the query string in
  // what it matches (per Cypress's own docs), so an exact `path` here
  // would only match a bare '/api/items' with no query at all. `pathname`
  // is explicitly query-independent, matching every real call this makes.
  itemsList: { ...svc(catalog), method: 'GET', pathname: '/api/items' },
  itemCategories: { ...svc(catalog), method: 'GET', path: '/api/items/categories' },
  itemDetail: { ...svc(catalog), method: 'GET', url: /\/api\/items\/\d+$/ },
  itemCreate: { ...svc(catalog), method: 'POST', path: '/api/items' },
  itemUpdate: { ...svc(catalog), method: 'PUT', url: /\/api\/items\/\d+$/ },
  itemDelete: { ...svc(catalog), method: 'DELETE', url: /\/api\/items\/\d+$/ },
  itemsReorder: { ...svc(catalog), method: 'PUT', path: '/api/items/reorder' },
  itemImage: { ...svc(catalog), method: 'POST', url: /\/api\/items\/\d+\/image$/ },
} as const satisfies Record<string, RouteMatcherOptions>

export type RouteName = keyof typeof API_ROUTES
