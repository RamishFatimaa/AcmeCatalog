import { describe, it, expect } from 'vitest'
import { Pact as PactV4, MatchersV3 } from '@pact-foundation/pact'
import { apiRequest } from '../src/api/client'
import type { LoginResponse } from '../src/types'

// The frontend's own consumer contract, the counterpart to
// IdentityClientPactTests.cs (tests/CatalogService.Tests) on the .NET side —
// this is what makes the "browser -> identity-service" relationship real
// Pact coverage instead of just API-contract/E2E coverage, closing the gap
// named in the Test Playbook's §9.5.6.
//
// login()/register()/getMe() (src/api/auth.ts) are one-line wrappers with
// zero logic of their own beyond calling apiRequest(baseUrl, path, opts) —
// apiRequest is the real code that builds headers and calls fetch(). This
// calls apiRequest directly with the mock server's URL rather than through
// login(), which hardcodes IDENTITY_SERVICE_URL from Vite's import.meta.env
// (not reliably available under a standalone Vitest config). Same real
// code either way; only the base-URL argument differs between this and
// production, which is exactly what's supposed to differ in a test.
describe('frontend -> identity-service: POST /api/auth/login', () => {
  it('sends real credentials and handles the real success response shape', async () => {
    const pact = new PactV4({
      consumer: 'frontend',
      provider: 'identity-service',
      dir: '../pacts',
    })

    await pact
      .addInteraction()
      .given('a user with valid login credentials exists', { username: 'pact-login-user', password: 'Test123!' })
      .uponReceiving('a login request with valid credentials')
      .withRequest('POST', '/api/auth/login', (builder) => {
        builder.headers({ 'Content-Type': 'application/json' })
        builder.jsonBody({ username: 'pact-login-user', password: 'Test123!' })
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ 'Content-Type': 'application/json' })
        builder.jsonBody({
          token: MatchersV3.regex(/^.+\..+\..+$/, 'header.payload.signature'),
          // A strict datetime() pattern guessed wrong here initially —
          // the real response has fractional-second precision
          // ('2026-09-10T21:58:46.193071Z'), confirmed by the provider
          // verifier's own real mismatch, not assumed up front. A regex
          // is the honest match: real precision without hardcoding a
          // digit count that could drift.
          expiresAtUtc: MatchersV3.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, '2026-01-01T00:00:00.000000Z'),
          username: 'pact-login-user',
        })
      })
      .executeTest(async (mockServer) => {
        const result = await apiRequest<LoginResponse>(mockServer.url, '/auth/login', {
          method: 'POST',
          body: { username: 'pact-login-user', password: 'Test123!' },
        })

        expect(result.username).toBe('pact-login-user')
        expect(result.token).toMatch(/^.+\..+\..+$/)
      })
  })
})
