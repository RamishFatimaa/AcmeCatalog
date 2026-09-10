// Both services generate a real OpenAPI document via Swashbuckle
// (AddSwaggerGen) — nothing before this spec ever validated a live
// response against it, so a response silently drifting from its own
// documented contract would only ever be caught by manually reading the
// two side by side. This fetches each service's actual
// /swagger/v1/swagger.json at test time (never a hand-copied schema) and
// validates real, live responses against it.

import { compileOpenApiSchemaValidator } from '../../support/openApiSchema'

const catalogServiceUrl = Cypress.env('catalogServiceUrl')
const identityServiceUrl = Cypress.env('identityServiceUrl')

describe('OpenAPI schema validation — catalog-service', () => {
  it('GET /api/items returns items matching the live ItemResponse schema', () => {
    cy.request(`${catalogServiceUrl}/swagger/v1/swagger.json`).then(({ body: openApiDocument }) => {
      const validate = compileOpenApiSchemaValidator(openApiDocument, 'ItemResponse')

      cy.request(`${catalogServiceUrl}/api/items`).then(({ body: items }) => {
        expect(items).to.be.an('array').with.length.greaterThan(0)
        items.forEach((item: unknown) => {
          const valid = validate(item)
          expect(valid, JSON.stringify(validate.errors)).to.be.true
        })
      })
    })
  })

  it('rejects a response shape that violates the live schema (proves the validator is real, not a rubber stamp)', () => {
    // The DTO and its generated schema are compiled from the same C# type
    // in this codebase, so they can't drift from each other by editing the
    // DTO — the compiler enforces that coupling. What this can and should
    // prove instead is that the validator itself genuinely enforces the
    // live document's constraints, not just returns true unconditionally.
    cy.request(`${catalogServiceUrl}/swagger/v1/swagger.json`).then(({ body: openApiDocument }) => {
      const validate = compileOpenApiSchemaValidator(openApiDocument, 'ItemResponse')

      const validItem = {
        id: 1,
        name: 'x',
        price: 9.99,
        description: 'x',
        category: 'Electronics',
        imageUrl: null,
        sortOrder: 0,
        dateAdded: new Date().toISOString(),
        createdByDisplayName: 'testuser',
      }
      expect(validate(validItem), JSON.stringify(validate.errors)).to.be.true

      expect(validate({ ...validItem, price: 'nine ninety nine' }), 'wrong type on price').to.be.false
      expect(validate({ ...validItem, name: null }), 'null on a non-nullable field').to.be.false
      expect(validate({ ...validItem, extraUndocumentedField: 'surprise' }), 'additionalProperties: false should reject an extra field').to.be.false
      const { name: _omitted, ...missingRequired } = validItem
      expect(validate(missingRequired), 'missing a documented property entirely still matches — OpenAPI only marks fields required via a separate "required" array, and ItemResponse declares none, so this is a real, current gap, not a test bug').to.be.true
    })
  })
})

describe('OpenAPI schema validation — identity-service', () => {
  it('POST /api/auth/login returns a body matching the live LoginResponse schema', () => {
    cy.request(`${identityServiceUrl}/swagger/v1/swagger.json`).then(({ body: openApiDocument }) => {
      const validate = compileOpenApiSchemaValidator(openApiDocument, 'LoginResponse')

      cy.request('POST', `${identityServiceUrl}/api/auth/login`, { username: 'testuser', password: 'Test123!' }).then(({ body }) => {
        const valid = validate(body)
        expect(valid, JSON.stringify(validate.errors)).to.be.true
      })
    })
  })
})
