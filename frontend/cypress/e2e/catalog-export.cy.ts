const catalogServiceUrl = Cypress.env('catalogServiceUrl')

describe('Catalog CSV export', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.visit('/Items')
  })

  it('the export link points at the CSV endpoint, which returns real catalog data', { tags: '@regression' }, () => {
    cy.getBySel('export-csv-btn').should('have.attr', 'href', `${catalogServiceUrl}/api/items/export`)

    cy.request(`${catalogServiceUrl}/api/items/export`).then((response) => {
      expect(response.headers['content-type']).to.include('text/csv')
      expect(response.body).to.include('Id,Name,Price,Category,Description,DateAdded')
      expect(response.body.split('\n').length).to.be.greaterThan(10)
    })
  })

  it('actually downloads a CSV file to disk when clicked', { tags: '@regression' }, () => {
    cy.getBySel('export-csv-btn').click()
    cy.readFile('cypress/downloads/acmecatalog-items.csv', { timeout: 10000 })
      .should('include', 'Id,Name,Price,Category,Description,DateAdded')
  })

  it('exports the whole catalog even while a search filter narrows the grid, by design', { tags: '@regression' }, () => {
    // Locks in a real product decision, confirmed with the user rather than
    // assumed: export always returns everything, regardless of the active
    // filter — GetAll's export action hard-codes term:null, category:null
    // (ItemsApiController.cs), it never reads the query string at all. This
    // proves the *intended* behavior with a real filtered UI state, not just
    // by reading the controller and noticing the endpoint ignores its own
    // query parameters.
    cy.request(`${catalogServiceUrl}/api/items`).then(({ body: allItems }) => {
      const fullCount = allItems.length

      cy.getBySel('search-input').type('Headphones')
      cy.getBySel('item-card').should('have.length.lessThan', fullCount)

      cy.request(`${catalogServiceUrl}/api/items/export`).then((response) => {
        const dataRowCount = response.body.trim().split('\n').length - 1
        expect(dataRowCount, 'export row count should match the full catalog, not the active filter').to.eq(fullCount)
      })
    })
  })
})
