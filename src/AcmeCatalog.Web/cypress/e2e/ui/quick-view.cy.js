// The trickiest UI combo in the app: a Bootstrap modal, AJAX-loaded content,
// and a same-origin iframe nested inside that content. Uses cy.intercept()
// so the test waits on the actual network call instead of a guessed delay.

describe('Quick View modal', () => {
  let itemId
  let itemName

  before(() => {
    cy.request('/api/items').then(({ body: items }) => {
      itemId = items[0].id
      itemName = items[0].name
    })
  })

  beforeEach(() => {
    cy.intercept('GET', '/Items/QuickView/*').as('quickView')
    cy.visit('/Items')
  })

  it('opens on click, loads its content over AJAX, and shows the right item', () => {
    cy.get('[data-testid=quick-view-btn]').first().click()

    cy.get('[data-testid=quick-view-modal]').should('be.visible')

    cy.wait('@quickView').its('response.statusCode').should('eq', 200)

    cy.get('[data-testid=quick-view-name]').should('be.visible').and('not.be.empty')
    cy.get('[data-testid=quick-view-price]').should('be.visible')
    cy.get('[data-testid=quick-view-description]').should('be.visible')
  })

  it('embeds a same-origin iframe pointed at the right ImagePreview route', () => {
    cy.get('[data-testid=quick-view-btn]').first().click()
    cy.wait('@quickView')

    cy.get('[data-testid=quick-view-image-frame]')
      .should('have.attr', 'src')
      .and('include', `/Items/ImagePreview/${itemId}`)

    // Same-origin iframe: contentDocument gives the real Document, but it's
    // a raw DOM node, not a Cypress subject. .then(cy.wrap) re-wraps it so
    // .find() and jQuery-style assertions work as normal from here on.
    cy.get('[data-testid=quick-view-image-frame]')
      .its('0.contentDocument.body', { timeout: 10000 })
      .should('not.be.undefined')
      .then(cy.wrap)
      .find('#preview-image')
      .should('be.visible')
      .and('have.attr', 'alt', itemName)
  })

  it('shows a graceful error if the QuickView request fails', () => {
    // catalog.js's fetch().catch() only fires on a real network failure —
    // fetch() does NOT reject on HTTP error statuses like 500, so a stubbed
    // 500 would just render that error response's body, not the fallback
    // message. forceNetworkError actually rejects the fetch promise.
    cy.intercept('GET', '/Items/QuickView/*', { forceNetworkError: true }).as('quickViewError')
    cy.get('[data-testid=quick-view-btn]').first().click()
    cy.wait('@quickViewError')

    cy.get('[data-testid=quick-view-body]').should('contain.text', 'Could not load item')
  })
})
