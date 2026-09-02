// The catalog's drag-and-drop reorder uses native HTML5 drag events, driven
// here the way Cypress's own official recipe does it (bare .trigger() calls,
// no DataTransfer object) — verified against catalog.js's actual listeners,
// which only read e.target / e.clientX / e.clientY and never touch
// e.dataTransfer, so constructing one would just be unused complexity.
// cy.intercept() spies on the real POST /Items/Reorder call so the test can
// assert exactly what was persisted, without re-implementing the endpoint.
//
// Dragging card[0] and hovering over card[1] is a no-op: card[0] is already
// immediately before card[1] in the DOM, so inserting it "before card[1]"
// again changes nothing. To produce a real, verifiable swap, drag the
// *second* card onto the *first* card's position instead.

describe('Drag-and-drop reorder', () => {
  beforeEach(() => {
    cy.login()
    cy.intercept('POST', '/Items/Reorder').as('reorder')
    cy.visit('/Items')
  })

  it('dragging the second card onto the first swaps their order', () => {
    cy.get('[data-testid=item-card]').then(($cards) => {
      const firstId = Number($cards.eq(0).attr('data-item-id'))
      const secondId = Number($cards.eq(1).attr('data-item-id'))

      cy.wrap($cards.eq(1)).trigger('dragstart')
      cy.get('[data-testid=item-card]').eq(0).trigger('dragover')
      cy.wrap($cards.eq(1)).trigger('dragend')

      cy.wait('@reorder').then(({ request }) => {
        expect(request.body[0]).to.eq(secondId)
        expect(request.body[1]).to.eq(firstId)
      })

      cy.get('[data-testid=item-card]').eq(0).should('have.attr', 'data-item-id', String(secondId))
      cy.get('[data-testid=toast-notification]').should('contain.text', 'order updated')
    })
  })

  it('shows an error toast if persisting the new order fails', () => {
    cy.intercept('POST', '/Items/Reorder', { statusCode: 500 }).as('reorderFailed')

    cy.get('[data-testid=item-card]').then(($cards) => {
      cy.wrap($cards.eq(1)).trigger('dragstart')
      cy.get('[data-testid=item-card]').eq(0).trigger('dragover')
      cy.wrap($cards.eq(1)).trigger('dragend')
    })

    cy.wait('@reorderFailed')
    cy.get('[data-testid=toast-notification]').should('contain.text', 'Could not save the new order')
  })
})
