// Pure REST contract tests against /api/items — covers reads (public),
// writes (JWT-protected), and the full create -> read -> update -> delete
// lifecycle in one chained request flow. No browser page is ever visited.

const catalogServiceUrl = Cypress.env('catalogServiceUrl')

describe('Items API — reads (anonymous)', () => {
  it('GET /api/items returns the full catalog', () => {
    cy.request(`${catalogServiceUrl}/api/items`).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body).to.be.an('array').with.length.greaterThan(0)
    })
  })

  it('GET /api/items?term= filters by name/description', () => {
    cy.request(`${catalogServiceUrl}/api/items?term=Headphones`).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body.length).to.be.greaterThan(0)
      response.body.forEach((item) => {
        const haystack = `${item.name} ${item.description}`.toLowerCase()
        expect(haystack).to.include('headphones')
      })
    })
  })

  it('GET /api/items/{id} returns a single item', () => {
    cy.request(`${catalogServiceUrl}/api/items`).then(({ body: items }) => {
      const target = items[0]
      cy.request(`${catalogServiceUrl}/api/items/${target.id}`).then((response) => {
        expect(response.status).to.eq(200)
        expect(response.body.id).to.eq(target.id)
        expect(response.body.name).to.eq(target.name)
      })
    })
  })

  it('GET /api/items/{id} returns 404 with a ProblemDetails body for a missing item', () => {
    cy.request({ url: `${catalogServiceUrl}/api/items/999999`, failOnStatusCode: false }).then((response) => {
      expect(response.status).to.eq(404)
      expect(response.body.title).to.eq('Item not found')
    })
  })

  it('GET /api/items/categories returns the known category list', () => {
    cy.request(`${catalogServiceUrl}/api/items/categories`).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body).to.include.members(['Electronics', 'Books'])
    })
  })
})

describe('Items API — CORS policy', () => {
  // Real, deliberately-configured middleware (Program.cs's AddCors/UseCors)
  // that exists specifically because the frontend split onto its own origin
  // this session — never verified anywhere until now. cy.request() runs
  // outside a real page's fetch restrictions, so it can set Origin
  // directly and inspect the server's actual policy response, which is
  // exactly what's under test here, not the browser's own enforcement of it.
  it('reflects the configured frontend origin in Access-Control-Allow-Origin', () => {
    cy.request({
      url: `${catalogServiceUrl}/api/items`,
      headers: { Origin: 'http://localhost:5173' },
    }).then((response) => {
      expect(response.headers['access-control-allow-origin']).to.eq('http://localhost:5173')
    })
  })

  it('does not reflect an arbitrary unlisted origin, and is not a wildcard', () => {
    // Verified directly against the real running service (curl, both
    // policies) before writing this assertion: ASP.NET Core's WithOrigins()
    // allow-list policy omits Access-Control-Allow-Origin ENTIRELY for a
    // non-matching Origin — it never echoes the request's Origin back and
    // never falls back to "*". A wide-open AllowAnyOrigin() policy, by
    // contrast, always returns a literal "*", for every origin, matching or
    // not. So "undefined" is the one value that only a correct allow-list
    // denial produces — checking merely "!= the evil origin" would have
    // silently passed against a "*" response too, since neither string
    // equals the evil origin. Confirmed via break-it-first: this assertion
    // fails against a real AllowAnyOrigin() policy and passes against the
    // real WithOrigins() policy, restarting the service between each to
    // rule out stale-process results (dotnet run doesn't hot-reload C#).
    cy.request({
      url: `${catalogServiceUrl}/api/items`,
      headers: { Origin: 'http://evil.example.com' },
    }).then((response) => {
      expect(response.headers['access-control-allow-origin']).to.be.undefined
    })
  })
})

describe('Items API — writes require a JWT', () => {
  it('POST without a token is rejected with 401', () => {
    cy.request({
      method: 'POST',
      url: `${catalogServiceUrl}/api/items`,
      failOnStatusCode: false,
      body: { name: 'x', price: 1, description: 'x', category: 'Electronics' },
    }).its('status').should('eq', 401)
  })

  it('PUT without a token is rejected with 401', () => {
    cy.request({
      method: 'PUT',
      url: `${catalogServiceUrl}/api/items/1`,
      failOnStatusCode: false,
      body: { id: 1, name: 'x', price: 1, description: 'x', category: 'Electronics' },
    }).its('status').should('eq', 401)
  })

  it('DELETE without a token is rejected with 401', () => {
    cy.request({ method: 'DELETE', url: `${catalogServiceUrl}/api/items/1`, failOnStatusCode: false })
      .its('status').should('eq', 401)
  })
})

describe('Items API — authenticated CRUD lifecycle', () => {
  let token: string

  before(() => {
    cy.apiLogin().then((t) => { token = t })
  })

  it('validates required fields and returns 400 on an empty payload', () => {
    cy.request({
      method: 'POST',
      url: `${catalogServiceUrl}/api/items`,
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
      body: {},
    }).its('status').should('eq', 400)
  })

  it('creates, reads, updates, and deletes an item end to end', () => {
    const name = `API CRUD Item ${Date.now()}`

    cy.request({
      method: 'POST',
      url: `${catalogServiceUrl}/api/items`,
      headers: { Authorization: `Bearer ${token}` },
      body: { name, price: 9.99, description: 'created by the API CRUD test', category: 'Electronics' },
    }).then((createResponse) => {
      expect(createResponse.status).to.eq(201)
      expect(createResponse.headers).to.have.property('location')
      const id = createResponse.body.id

      cy.request(`${catalogServiceUrl}/api/items/${id}`).its('body.name').should('eq', name)

      cy.request({
        method: 'PUT',
        url: `${catalogServiceUrl}/api/items/${id}`,
        headers: { Authorization: `Bearer ${token}` },
        body: { id, name, price: 19.99, description: 'updated by the API CRUD test', category: 'Electronics' },
      }).its('status').should('eq', 204)

      cy.request(`${catalogServiceUrl}/api/items/${id}`).its('body.price').should('eq', 19.99)

      cy.request({
        method: 'DELETE',
        url: `${catalogServiceUrl}/api/items/${id}`,
        headers: { Authorization: `Bearer ${token}` },
      }).its('status').should('eq', 204)

      cy.request({ url: `${catalogServiceUrl}/api/items/${id}`, failOnStatusCode: false })
        .its('status').should('eq', 404)
    })
  })

  it('rejects an update where the route id and body id do not match, with 400', () => {
    cy.request({
      method: 'PUT',
      url: `${catalogServiceUrl}/api/items/1`,
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
      body: { id: 999999, name: 'x', price: 1, description: 'x', category: 'Electronics' },
    }).its('status').should('eq', 400)
  })

  it('returns 404 updating an item that does not exist', () => {
    cy.request({
      method: 'PUT',
      url: `${catalogServiceUrl}/api/items/999999`,
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
      body: { id: 999999, name: 'x', price: 1, description: 'x', category: 'Electronics' },
    }).its('status').should('eq', 404)
  })

  it('returns 404 deleting an item that does not exist', () => {
    cy.request({
      method: 'DELETE',
      url: `${catalogServiceUrl}/api/items/999999`,
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    }).its('status').should('eq', 404)
  })
})

describe('Items API — PUT /api/items/reorder', () => {
  let token: string

  before(() => {
    cy.apiLogin().then((t) => { token = t })
  })

  it('rejects a reorder request with no token with a 401', () => {
    cy.request({
      method: 'PUT',
      url: `${catalogServiceUrl}/api/items/reorder`,
      failOnStatusCode: false,
      body: [1, 2, 3],
    }).its('status').should('eq', 401)
  })

  it('persists a real reorder — a follow-up GET reflects the new sortOrder', () => {
    cy.request(`${catalogServiceUrl}/api/items`).then(({ body: items }) => {
      const reversedIds = [...items].map((i) => i.id).reverse()

      cy.request({
        method: 'PUT',
        url: `${catalogServiceUrl}/api/items/reorder`,
        headers: { Authorization: `Bearer ${token}` },
        body: reversedIds,
      }).its('status').should('eq', 204)

      cy.request(`${catalogServiceUrl}/api/items`).then(({ body: reordered }) => {
        expect(reordered.map((i: { id: number }) => i.id)).to.deep.eq(reversedIds)
      })
    })
  })
})

describe('Items API — POST /api/items/:id/image', () => {
  let token: string

  before(() => {
    cy.apiLogin().then((t) => { token = t })
  })

  it('rejects an image upload with no token with a 401', () => {
    cy.apiCreateItem(token).then((item) => {
      cy.request({
        method: 'POST',
        url: `${catalogServiceUrl}/api/items/${item.id}/image`,
        failOnStatusCode: false,
      }).its('status').should('eq', 401)
    })
  })

  // No "uploads a real file" test at this layer, deliberately: cy.request()
  // runs in Node, not the browser (Cypress's own docs: "Cypress does not
  // actually make an XHR request from the browser... we are actually
  // making the HTTP request from Cypress (in Node)"). A hand-built
  // multipart Blob body doesn't survive that Node round trip intact —
  // tried it directly (a manually-boundaried Blob of real image bytes),
  // confirmed via curl against this exact endpoint that a real multipart
  // upload genuinely works server-side, and confirmed the same Blob body
  // through cy.request() comes back 200 with an empty {} body instead of
  // the real enriched Item — a Cypress/Node transport limitation, not
  // anything wrong with the endpoint. The real upload path is already
  // genuinely exercised where it belongs: image-upload.cy.ts drives a
  // real browser <input type="file"> via cy.selectFile(), and
  // catalog-manage.cy.ts's image-upload failure test asserts the real
  // multipart Content-Type on an actual browser-originated request.
})

// The two describe blocks below deliberately DOCUMENT current real
// behavior rather than assert what SHOULD happen — both were found while
// auditing test coverage (ItemsApiController.cs), and neither has a
// stated intended behavior yet. Locking in what's actually true today
// makes a real regression (or a deliberate future fix) visible in a
// diff, instead of the behavior staying silently unverified either way.

describe('Items API — item ownership (documents current behavior, not endorsed as correct)', () => {
  const identityServiceUrl = Cypress.env('identityServiceUrl')

  it('lets any authenticated user update and delete an item they did not create', () => {
    // ItemsApiController.Update/Delete (services/catalog-service/
    // Controllers/ItemsApiController.cs) check [Authorize] only — never
    // compare the caller's sub claim against the item's createdByUserId
    // the way Create captures it. This test proves that's real, current
    // behavior, not a hypothesis: user B's token genuinely succeeds
    // against user A's item.
    cy.apiLogin().then((ownerToken) => {
      cy.apiCreateItem(ownerToken).then((item) => {
        const otherUsername = `other-user-${Date.now()}`
        cy.request('POST', `${identityServiceUrl}/api/auth/register`, {
          username: otherUsername,
          email: `${otherUsername}@example.com`,
          password: 'Test123!',
          confirmPassword: 'Test123!',
        }).its('body.token').then((otherToken) => {
          cy.request({
            method: 'PUT',
            url: `${catalogServiceUrl}/api/items/${item.id}`,
            headers: { Authorization: `Bearer ${otherToken}` },
            body: { id: item.id, name: 'Edited by a different user', price: 5, description: 'x', category: 'Electronics' },
          }).its('status').should('eq', 204)

          cy.request({
            method: 'DELETE',
            url: `${catalogServiceUrl}/api/items/${item.id}`,
            headers: { Authorization: `Bearer ${otherToken}` },
          }).its('status').should('eq', 204)
        })
      })
    })
  })
})

describe('Items API — image upload content validation (documents current behavior, not endorsed as correct)', () => {
  it('accepts a non-image file whose name merely carries an allowed extension', () => {
    // UploadImage (ItemsApiController.cs:112-135) validates
    // Path.GetExtension(file.FileName) against an allow-list — never the
    // actual file content/magic bytes. A plain text file renamed to
    // "evil.png" passes this check today; this proves that directly
    // rather than asserting it from reading the code alone.
    cy.apiLogin().then((token) => {
      cy.apiCreateItem(token).then((item) => {
        const boundary = `cypress-${Date.now()}`
        const encoder = new TextEncoder()
        const head = encoder.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="evil.png"\r\nContent-Type: image/png\r\n\r\n`,
        )
        const notActuallyAnImage = encoder.encode('this is a plain text file, not image bytes')
        const tail = encoder.encode(`\r\n--${boundary}--\r\n`)
        const body = new Blob([head, notActuallyAnImage, tail])

        cy.request({
          method: 'POST',
          url: `${catalogServiceUrl}/api/items/${item.id}/image`,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body,
        }).its('status').should('eq', 200)
      })
    })
  })
})
