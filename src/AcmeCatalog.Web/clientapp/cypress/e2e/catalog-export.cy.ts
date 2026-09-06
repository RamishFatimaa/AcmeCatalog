describe('Catalog CSV export', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.visit('/Items')
  })

  it('the export link points at the CSV endpoint, which returns real catalog data', { tags: '@smoke' }, () => {
    cy.getBySel('export-csv-btn').should('have.attr', 'href', '/api/items/export')

    cy.request('/api/items/export').then((response) => {
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
})
