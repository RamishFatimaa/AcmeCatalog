import { defineConfig } from 'vitest/config'

// Deliberately its own config, not a `test` block bolted onto vite.config.ts —
// mirrors cypress.config.ts sitting apart from it for the same reason: this
// runs in Node against pact/, never bundled into the app, and shouldn't share
// a compiler context with either the app build or the Cypress spec suite.
// Scoped to pact/ only so a future real unit-test file elsewhere can't be
// picked up by accident before there's a deliberate decision to widen this.
export default defineConfig({
  test: {
    include: ['pact/**/*.pact.test.ts'],
    environment: 'node',
  },
})
