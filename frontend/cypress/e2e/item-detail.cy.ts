const catalogServiceUrl = Cypress.env('catalogServiceUrl')

describe('Item detail page', () => {
  beforeEach(() => {
    cy.resetDb()
  })

  it('shows Description and Specs tabs', { tags: '@smoke' }, () => {
    cy.visit('/Items')
    cy.getBySel('item-detail-link').first().click()

    cy.getBySel('item-detail-page').should('be.visible')
    cy.getBySel('detail-description').should('be.visible')

    cy.getBySel('tab-specs').click()
    cy.getBySel('detail-specs').should('be.visible')
    cy.getBySel('detail-description').should('not.exist')
  })

  it('rates the item via the shadow-DOM star rating widget, and the rating survives a reload', { tags: '@regression' }, () => {
    cy.request(`${catalogServiceUrl}/api/items`).its('body.0.id').then((id) => {
      cy.visit(`/Items/${id}`)

      cy.getBySel('star-rating').shadow().find('button').eq(2).click()
      cy.getBySel('star-rating').shadow().find('button.filled').should('have.length', 3)

      cy.reload()
      cy.getBySel('star-rating').shadow().find('button.filled').should('have.length', 3)
    })
  })

  it('double-clicking an item image opens Quick View', { tags: '@regression' }, () => {
    cy.visit('/Items')
    cy.get('[data-testid=item-card] img').first().dblclick()
    cy.getBySel('quick-view-modal').should('be.visible')
  })

  it('right-clicking an item card opens a context menu leading to Quick View', { tags: '@regression' }, () => {
    cy.visit('/Items')
    cy.getBySel('item-card').first().rightclick()
    cy.getBySel('context-menu').should('be.visible')

    cy.getBySel('context-quick-view').click()
    cy.getBySel('quick-view-modal').should('be.visible')
    cy.getBySel('context-menu').should('not.exist')
  })

  it('shows a free-shipping tooltip on hover for items $50 and over', { tags: '@regression' }, () => {
    cy.visit('/Items')
    cy.getBySel('item-price').contains('$179.99').trigger('mouseover')
    cy.getBySel('price-tooltip').should('be.visible').and('contain.text', 'Free shipping')
  })
})
