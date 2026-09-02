// Live search, category filtering, and Load More pagination — all AJAX,
// no full page reload. cy.intercept()/cy.wait() replace guessed delays with
// waiting on the exact request the page itself is making.

describe('Catalog search, filter, and pagination', () => {
  beforeEach(() => {
    cy.intercept('GET', '/Items/Filter*').as('filter')
    cy.visit('/Items')
  })

  it('live search narrows results as you type, debounced', () => {
    cy.get('[data-testid=search-input]').type('Headphones')
    cy.wait('@filter')

    cy.get('[data-testid=filter-status]').should('contain.text', 'item(s) found')

    // Query the nested testid directly rather than caching card handles from
    // an earlier cy.get() and calling .find() on them inside .each() — the
    // AJAX re-render (container.innerHTML = ...) can land between those two
    // steps and detach the cached elements. Querying fresh lets Cypress's
    // built-in retry ride out that race instead of failing on a stale node.
    cy.get('[data-testid=item-name]').should('have.length.greaterThan', 0)
    cy.get('[data-testid=item-name]').each(($name) => {
      expect($name.text()).to.match(/headphones/i)
    })
  })

  it('filtering by category shows only that category', () => {
    cy.get('[data-testid=category-filter]').select('Books')
    cy.wait('@filter')

    cy.get('[data-testid=item-category]').should('have.length.greaterThan', 0)
    cy.get('[data-testid=item-category]').each(($category) => {
      expect($category.text()).to.include('Books')
    })
  })

  it('shows a no-results message for a search with no matches', () => {
    cy.get('[data-testid=search-input]').type('zzz-does-not-exist-zzz')
    cy.wait('@filter')
    cy.get('[data-testid=no-results]').should('be.visible')
  })

  it('clear filters resets back to the unfiltered catalog', () => {
    cy.get('[data-testid=search-input]').type('Headphones')
    cy.wait('@filter')
    cy.get('[data-testid=clear-filters-btn]').click()

    cy.get('[data-testid=search-input]').should('have.value', '')
    cy.get('[data-testid=filter-status]').should('be.empty')
  })

  it('Load More appends the next page without reloading', () => {
    cy.intercept('GET', '/Items/LoadMore*').as('loadMore')

    cy.get('[data-testid=item-card]').its('length').then((initialCount) => {
      cy.get('[data-testid=load-more-btn]').click()
      cy.wait('@loadMore')
      cy.get('[data-testid=item-card]').should('have.length.greaterThan', initialCount)
    })
  })
})
