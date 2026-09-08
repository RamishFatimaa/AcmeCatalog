describe('Catalog sorting', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.visit('/Items')
    cy.getBySel('load-more-btn').click() // all 10 items visible, so sort order is fully checkable
  })

  it('sorts by name and by price', { tags: '@smoke' }, () => {
    cy.getBySel('sort-name').click()
    // Ordinal/binary collation (SQLite's default) sorts digits before
    // letters, so "4K Streaming Media Stick" is first, not "Atomic Habits".
    cy.getBySel('item-name').first().should('contain.text', '4K Streaming Media Stick')

    cy.getBySel('sort-price').click()
    cy.getBySel('item-price').first().should('contain.text', '$16.99')
  })

  it('sorts by newest without erroring', { tags: '@regression' }, () => {
    cy.intercept('GET', '/api/items*').as('sorted')
    cy.getBySel('sort-newest').click()
    cy.wait('@sorted').its('response.statusCode').should('eq', 200)
  })
})

describe('Catalog price range filter', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.visit('/Items')
    cy.getBySel('load-more-btn').click()
  })

  it('filters by dragging the min/max range sliders', { tags: '@regression' }, () => {
    // Native range inputs can't be dragged reliably by mouse coordinates in
    // Cypress. invoke('val', ...) alone isn't enough either: it sets the DOM
    // value directly, bypassing the setter React patches onto the element to
    // track real changes, so React's onChange never fires. Setting the value
    // through that same native prototype setter (then dispatching a real
    // 'input' event) is what actually reaches React's handler.
    const setNativeValue = (selector: string, value: number) => {
      cy.getBySel(selector).then(($el) => {
        const input = $el[0] as HTMLInputElement
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
        nativeSetter.call(input, String(value))
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }

    setNativeValue('price-min-input', 30)
    setNativeValue('price-max-input', 100)

    // Not `cy.wait()`-ing on a single intercepted request here: setting min
    // then max is two separate state updates, and with no search term the
    // debounce delay is 0ms (see CatalogGrid's `term ? 300 : 0`), so both
    // can fire their own fetch. Waiting on "a" matching request risked
    // catching the intermediate one — min=30 with max still the old 300 —
    // which is exactly what a real CI failure surfaced (179.99 asserted
    // "within 30..100"). `.each()` doesn't retry the way `.should()` does —
    // tried that first, it just fails immediately every time instead of
    // occasionally, since it runs its callback once against whatever's
    // already in the DOM rather than polling. `.should(callback)` is the
    // actual Cypress idiom for "keep re-querying and re-checking until this
    // holds" — it retries the query it's chained to, not just the
    // assertion, so it naturally waits out however many fetches land before
    // the DOM reflects the final min=30/max=100 state.
    cy.getBySel('filter-status').should('be.visible')
    cy.getBySel('item-price').should(($els) => {
      const values = [...$els].map((el) => Number(el.textContent!.replace(/[^0-9.]/g, '')))
      values.forEach((value) => expect(value).to.be.within(30, 100))
    })
  })
})

describe('Catalog view preference', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.visit('/Items')
  })

  it('remembers grid/list view in localStorage across a reload', { tags: '@regression' }, () => {
    cy.getBySel('view-list-btn').click()
    cy.getBySel('items-container').should('have.class', 'flex-column')
    cy.window().its('localStorage').invoke('getItem', 'acmecatalog.viewMode').should('eq', 'list')

    cy.reload()
    cy.getBySel('items-container').should('have.class', 'flex-column')
  })
})

describe('Search term session persistence', () => {
  beforeEach(() => {
    cy.resetDb()
  })

  it('restores the last search within the tab session, but a cleared session starts blank', { tags: '@regression' }, () => {
    cy.visit('/Items')
    cy.getBySel('search-input').type('Headphones')
    cy.getBySel('search-input').should('have.value', 'Headphones')

    // Simulates navigating away and back within the same tab — sessionStorage
    // survives this; it would NOT survive opening a brand new tab.
    cy.visit('/')
    cy.visit('/Items')
    cy.getBySel('search-input').should('have.value', 'Headphones')

    cy.window().then((win) => win.sessionStorage.clear())
    cy.visit('/Items')
    cy.getBySel('search-input').should('have.value', '')
  })
})
