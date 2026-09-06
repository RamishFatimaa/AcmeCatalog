describe('Home page', () => {
  beforeEach(() => {
    cy.resetDb()
  })

  it('shows stats computed from the real catalog, not placeholders', { tags: '@smoke' }, () => {
    cy.visit('/')

    cy.getBySel('stat-item-count').should('contain.text', '10')
    cy.getBySel('stat-category-count').should('contain.text', '5')
    cy.getBySel('stat-latest-item').should('not.contain.text', '—')
  })

  it('changes the hero CTA depending on auth state', { tags: '@regression' }, () => {
    cy.visit('/')
    cy.contains('a', 'Create a free account').should('be.visible')

    cy.loginSession()
    cy.visit('/')
    cy.contains('a', '+ Add an Item').should('be.visible')
  })
})
