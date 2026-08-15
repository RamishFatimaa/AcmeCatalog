describe('AcmeCatalog', () => {
  it('loads the home page', () => {
    cy.visit('/')
    cy.get('body').should('be.visible')
  })
})