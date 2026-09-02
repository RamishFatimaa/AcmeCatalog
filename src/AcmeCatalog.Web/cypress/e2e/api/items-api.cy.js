// Pure REST contract tests against /api/items — covers reads (public),
// writes (JWT-protected), and the full create -> read -> update -> delete
// lifecycle in one chained request flow. No browser page is ever visited.

describe('Items API — reads (anonymous)', () => {
  it('GET /api/items returns the full catalog', () => {
    cy.request('/api/items').then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body).to.be.an('array').with.length.greaterThan(0)
    })
  })

  it('GET /api/items?term= filters by name/description', () => {
    cy.request('/api/items?term=Headphones').then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body.length).to.be.greaterThan(0)
      response.body.forEach((item) => {
        const haystack = `${item.name} ${item.description}`.toLowerCase()
        expect(haystack).to.include('headphones')
      })
    })
  })

  it('GET /api/items/{id} returns a single item', () => {
    cy.request('/api/items').then(({ body: items }) => {
      const target = items[0]
      cy.request(`/api/items/${target.id}`).then((response) => {
        expect(response.status).to.eq(200)
        expect(response.body.id).to.eq(target.id)
        expect(response.body.name).to.eq(target.name)
      })
    })
  })

  it('GET /api/items/{id} returns 404 with a ProblemDetails body for a missing item', () => {
    cy.request({ url: '/api/items/999999', failOnStatusCode: false }).then((response) => {
      expect(response.status).to.eq(404)
      expect(response.body.title).to.eq('Item not found')
    })
  })

  it('GET /api/items/categories returns the known category list', () => {
    cy.request('/api/items/categories').then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body).to.include.members(['Electronics', 'Books'])
    })
  })
})

describe('Items API — writes require a JWT', () => {
  it('POST without a token is rejected with 401', () => {
    cy.request({
      method: 'POST',
      url: '/api/items',
      failOnStatusCode: false,
      body: { name: 'x', price: 1, description: 'x', category: 'Electronics' },
    }).its('status').should('eq', 401)
  })

  it('PUT without a token is rejected with 401', () => {
    cy.request({
      method: 'PUT',
      url: '/api/items/1',
      failOnStatusCode: false,
      body: { id: 1, name: 'x', price: 1, description: 'x', category: 'Electronics' },
    }).its('status').should('eq', 401)
  })

  it('DELETE without a token is rejected with 401', () => {
    cy.request({ method: 'DELETE', url: '/api/items/1', failOnStatusCode: false })
      .its('status').should('eq', 401)
  })
})

describe('Items API — authenticated CRUD lifecycle', () => {
  let token

  before(() => {
    cy.apiLogin().then((t) => { token = t })
  })

  it('validates required fields and returns 400 on an empty payload', () => {
    cy.request({
      method: 'POST',
      url: '/api/items',
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
      body: {},
    }).its('status').should('eq', 400)
  })

  it('creates, reads, updates, and deletes an item end to end', () => {
    const name = `API CRUD Item ${Date.now()}`

    cy.request({
      method: 'POST',
      url: '/api/items',
      headers: { Authorization: `Bearer ${token}` },
      body: { name, price: 9.99, description: 'created by the API CRUD test', category: 'Electronics' },
    }).then((createResponse) => {
      expect(createResponse.status).to.eq(201)
      expect(createResponse.headers).to.have.property('location')
      const id = createResponse.body.id

      cy.request(`/api/items/${id}`).its('body.name').should('eq', name)

      cy.request({
        method: 'PUT',
        url: `/api/items/${id}`,
        headers: { Authorization: `Bearer ${token}` },
        body: { id, name, price: 19.99, description: 'updated by the API CRUD test', category: 'Electronics' },
      }).its('status').should('eq', 204)

      cy.request(`/api/items/${id}`).its('body.price').should('eq', 19.99)

      cy.request({
        method: 'DELETE',
        url: `/api/items/${id}`,
        headers: { Authorization: `Bearer ${token}` },
      }).its('status').should('eq', 204)

      cy.request({ url: `/api/items/${id}`, failOnStatusCode: false })
        .its('status').should('eq', 404)
    })
  })

  it('rejects an update where the route id and body id do not match, with 400', () => {
    cy.request({
      method: 'PUT',
      url: '/api/items/1',
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
      body: { id: 999999, name: 'x', price: 1, description: 'x', category: 'Electronics' },
    }).its('status').should('eq', 400)
  })

  it('returns 404 updating an item that does not exist', () => {
    cy.request({
      method: 'PUT',
      url: '/api/items/999999',
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
      body: { id: 999999, name: 'x', price: 1, description: 'x', category: 'Electronics' },
    }).its('status').should('eq', 404)
  })

  it('returns 404 deleting an item that does not exist', () => {
    cy.request({
      method: 'DELETE',
      url: '/api/items/999999',
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    }).its('status').should('eq', 404)
  })
})
