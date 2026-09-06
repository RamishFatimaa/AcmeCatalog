import { uniqueItem } from '../support/factories'

// Authenticated catalog management. Every test here uses cy.loginSession()
// instead of driving the login form — auth.cy.ts already covers that flow,
// so these stay focused on create/edit/delete/reorder.

describe('Catalog management (authenticated)', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.loginSession()
    cy.visit('/Items')
  })

  it('creates an item, which then appears in the catalog', { tags: '@smoke' }, () => {
    const item = uniqueItem()

    cy.getBySel('add-item-nav-link').click()
    cy.getBySel('name-input').type(item.name)
    cy.getBySel('price-input').type(String(item.price))
    cy.getBySel('category-input').select(item.category)
    cy.getBySel('description-input').type(item.description)
    cy.getBySel('submit-btn').click()

    cy.url().should('match', /\/Items$/)
    cy.getBySel('search-input').type(item.name)
    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('item-name').should('contain.text', item.name)
  })

  it('blocks submission with validation errors and stays on the form', { tags: '@regression' }, () => {
    cy.fixture('invalid-item.json').then((invalid) => {
      cy.getBySel('add-item-nav-link').click()
      cy.getBySel('price-input').type(String(invalid.price))
      cy.getBySel('submit-btn').click()
    })

    cy.getBySel('name-error').should('be.visible')
    cy.getBySel('price-error').should('contain.text', 'positive number')
    cy.getBySel('category-error').should('be.visible')
    cy.getBySel('description-error').should('be.visible')
    cy.url().should('include', '/Items/Create')
  })

  it('edits an item and the change persists', { tags: '@smoke' }, () => {
    cy.getBySel('search-input').type('Atomic Habits')
    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('edit-link').click()

    cy.getBySel('price-input').clear().type('99.99')
    cy.getBySel('submit-btn').click()

    cy.url().should('match', /\/Items$/)
    // The search term was already "Atomic Habits" before this navigation and
    // is restored from sessionStorage on remount (see catalog-filters.cy.ts) —
    // clear() first so this doesn't type it twice.
    cy.getBySel('search-input').clear().type('Atomic Habits')
    cy.getBySel('item-price').should('contain.text', '$99.99')
  })

  it('deletes an item after confirming', { tags: '@smoke' }, () => {
    cy.getBySel('search-input').type('Trade Routes')
    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('delete-btn').click()

    cy.getBySel('toast-notification').should('contain.text', 'was deleted')
    cy.getBySel('no-results').should('be.visible')
  })

  it('reorders items via drag; the persisted request body matches the new order', { tags: '@regression' }, () => {
    cy.intercept('PUT', '/api/items/reorder').as('reorder')

    cy.getBySel('item-card').then(($cards) => {
      const firstId = Number($cards.eq(0).attr('data-item-id'))
      const secondId = Number($cards.eq(1).attr('data-item-id'))

      // Dragging card[1] onto card[0]'s position swaps them — see
      // CatalogGrid.handleDragOver, which reinserts the dragged item at the
      // target's index.
      cy.getBySel('item-card').eq(1).as('draggedCard').trigger('dragstart')
      cy.getBySel('item-card').eq(0).trigger('dragover')
      cy.get('@draggedCard').trigger('dragend')

      cy.wait('@reorder').its('request.body').then((orderedIds: number[]) => {
        expect(orderedIds.slice(0, 2)).to.deep.eq([secondId, firstId])
      })

      cy.getBySel('item-card').eq(0).should('have.attr', 'data-item-id', String(secondId))
      cy.getBySel('toast-notification').should('contain.text', 'Catalog order updated')
    })
  })
})

describe('Catalog management (anonymous)', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.visit('/Items')
  })

  it('never shows Edit, Delete, or drag controls to anonymous visitors', { tags: '@regression' }, () => {
    cy.getBySel('item-card').should('have.length.greaterThan', 0)
    cy.getBySel('edit-link').should('not.exist')
    cy.getBySel('delete-btn').should('not.exist')
    cy.getBySel('drag-handle').should('not.exist')
  })
})
