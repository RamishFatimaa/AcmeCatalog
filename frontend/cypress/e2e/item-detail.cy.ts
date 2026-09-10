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

  it('renders exactly what a stubbed GET /api/items/:id response returns, not real backend data', { tags: '@regression' }, () => {
    // Every other intercept in this suite stubs a failure/delay or spies on
    // an outgoing request — nothing stubs a real success response body and
    // proves the page renders exactly that data. { fixture } does both at
    // once: response control, and a payload with values (id 999001,
    // "fixture-user") that can't coincidentally match anything DbSeeder
    // ever seeds, so a passing assertion here can only mean the stub was
    // actually used, not that it happened to line up with real data.
    cy.intercept('GET', `${catalogServiceUrl}/api/items/999001`, { fixture: 'item-detail-response.json' }).as('getStubbedItem')

    cy.visit('/Items/999001')
    cy.wait('@getStubbedItem')

    cy.getBySel('detail-name').should('have.text', 'Stubbed Response Fixture Item')
    cy.getBySel('detail-price').should('contain.text', '$777.77')
    cy.getBySel('detail-description').should('have.text', 'This exact description only ever comes from the fixture-stubbed response, never from a real backend call.')
  })

  it('shows an error, not a blank page, when the item fails to load', { tags: '@regression' }, () => {
    cy.allowConsoleErrors()
    cy.simulateFailure('itemDetail')

    cy.visit('/Items/999001')

    cy.wait('@itemDetailFailure')
    cy.getBySel('item-detail-error').should('be.visible')
  })
})
