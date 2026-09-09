// Anonymous browsing: search, filter, pagination, Quick View, and the one
// stubbed-failure test in the suite (real backend has no way to produce a
// network error on demand, so this is exactly what cy.intercept() stubbing
// is for).

describe('Catalog browsing (anonymous)', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.intercept('GET', '/api/items*').as('itemsRequest')
    cy.visit('/Items')
    cy.wait('@itemsRequest') // the load that fires on mount
  })

  it('renders the seeded catalog, paginated 4 at a time', { tags: '@smoke' }, () => {
    cy.getBySel('item-card').should('have.length', 4)
    cy.getBySel('load-more-btn').should('be.visible')
  })

  it('live search narrows results to matching items', { tags: '@regression' }, () => {
    cy.getBySel('search-input').type('Headphones')
    cy.wait('@itemsRequest')

    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('item-name').should('contain.text', 'Headphones')
    cy.getBySel('filter-status').should('contain.text', '1 item(s) found')
  })

  it('filters by category', { tags: '@regression' }, () => {
    cy.getBySel('category-filter').select('Books')
    cy.wait('@itemsRequest')

    cy.getBySel('item-card').should('have.length', 2)
    cy.getBySel('item-category').each(($el) => {
      expect($el.text()).to.eq('Books')
    })
  })

  it('shows a no-results state for a search with no matches', { tags: '@regression' }, () => {
    cy.getBySel('search-input').type('no-such-item-zzz')
    cy.wait('@itemsRequest')

    cy.getBySel('no-results').should('be.visible')
    cy.getBySel('item-card').should('not.exist')
  })

  it('shows a graceful error if the catalog fails to load', { tags: '@regression' }, () => {
    // The forced network error itself surfaces as a real console error (the
    // browser logging the failed fetch) — expected here, not a regression.
    cy.allowConsoleErrors()
    cy.intercept('GET', '/api/items*', { forceNetworkError: true }).as('itemsFailure')

    cy.getBySel('category-filter').select('Books')
    cy.wait('@itemsFailure')

    cy.getBySel('catalog-error').should('be.visible')
    cy.getBySel('item-card').should('not.exist')
  })

  it('renders a stubbed "Unknown" creator without crashing', { tags: '@regression' }, () => {
    // catalog-service is the only thing that ever calls identity-service for
    // this — the browser never does — so the one degraded state actually
    // observable from here is data already resolved to "Unknown" in the
    // items response, not a network failure to intercept. Stubbing the
    // real contract value (ItemResponse.From's own fallback) is what proves
    // the frontend renders it, since nothing else in this suite ever
    // exercises a value other than a real seeded username.
    cy.intercept('GET', '/api/items*', {
      body: [
        {
          id: 999,
          name: 'Orphaned Gadget',
          price: 9.99,
          description: 'An item whose creator could not be resolved.',
          category: 'Electronics',
          imageUrl: null,
          sortOrder: 0,
          dateAdded: '2026-01-01T00:00:00Z',
          createdByDisplayName: 'Unknown',
        },
      ],
    }).as('unknownCreator')

    cy.getBySel('search-input').type('Orphaned')
    cy.wait('@unknownCreator')

    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('item-created-by').should('have.text', 'Added by Unknown')
  })

  it('shows a loading indicator while the catalog fetch is in flight', { tags: '@regression' }, () => {
    // Nothing in the app is normally slow enough to observe a loading state.
    // A bare `{ delay }` response object would stub an empty response instead
    // of the real data — req.continue() lets the real request through and
    // only delays *that* response, so the actual filtered items still arrive.
    cy.intercept('GET', '/api/items*', (req) => {
      req.continue((res) => {
        res.setDelay(1000)
      })
    }).as('slowItems')

    cy.getBySel('category-filter').select('Books')
    cy.getBySel('catalog-loading').should('be.visible')
    cy.wait('@slowItems')
    cy.getBySel('catalog-loading').should('not.exist')
  })

  it('Load More appends the next page until the catalog is exhausted', { tags: '@regression' }, () => {
    cy.getBySel('load-more-btn').click()
    cy.getBySel('item-card').should('have.length', 8)
    cy.getBySel('load-more-btn').should('be.visible')

    cy.getBySel('load-more-btn').click()
    cy.getBySel('item-card').should('have.length', 10)
    cy.getBySel('load-more-btn').should('not.exist')
  })

  it('Quick View opens and shows the selected item’s details', { tags: '@smoke' }, () => {
    cy.getBySel('item-name').first().invoke('text').then((name) => {
      cy.getBySel('quick-view-btn').first().click()

      cy.getBySel('quick-view-modal').should('be.visible')
      cy.getBySel('quick-view-name').should('contain.text', name)
      cy.getBySel('quick-view-image-frame').should('be.visible')
    })
  })

  it('Quick View closes on the close button and on a backdrop click', { tags: '@regression' }, () => {
    cy.getBySel('quick-view-btn').first().click()
    cy.getBySel('quick-view-modal').should('be.visible')
    cy.get('.btn-close').click()
    cy.getBySel('quick-view-modal').should('not.be.visible')

    cy.getBySel('quick-view-btn').first().click()
    cy.getBySel('quick-view-modal').should('be.visible').click('topLeft')
    cy.getBySel('quick-view-modal').should('not.be.visible')
  })

  it('Quick View also closes on the Escape key', { tags: '@regression' }, () => {
    cy.getBySel('quick-view-btn').first().click()
    cy.getBySel('quick-view-modal').should('be.visible')

    // cy.press() dispatches a real native keydown, unlike cy.type('{esc}')
    // which simulates one — the app's Escape handler listens on `document`,
    // so it needs an event that actually reaches it that way.
    cy.press(Cypress.Keyboard.Keys.ESC)
    cy.getBySel('quick-view-modal').should('not.be.visible')
  })
})
