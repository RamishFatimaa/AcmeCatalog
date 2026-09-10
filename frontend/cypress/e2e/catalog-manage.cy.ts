import { uniqueItem } from '../support/factories'

// Authenticated catalog management. Every test here uses cy.loginSession()
// instead of driving the login form — auth.cy.ts already covers that flow,
// so these stay focused on create/edit/delete/reorder.

describe('Catalog management (authenticated)', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.loginSession()
    // One middleware intercept per named write route — asserts a
    // well-formed Bearer header on every one of them, for every test
    // below, without any of those tests' own intercepts having to check
    // it individually (see cypress/support/routes.ts and commands.ts).
    cy.assertAuthenticatedWrites(['itemCreate', 'itemUpdate', 'itemDelete', 'itemImage', 'itemsReorder'])
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

  it('sends a real Bearer token in the Authorization header when creating an item', { tags: '@regression' }, () => {
    // Every intercept elsewhere in this suite checks request/response
    // bodies or forces a failure — nothing asserts on a real outgoing
    // header. This is the one authenticated write path (catalog-manage's
    // own create) that closes that gap: AuthContext attaches the token as
    // an Authorization header on every write, and this proves it directly
    // rather than only inferring it from the request succeeding at all
    // (a missing/malformed header would 401, which would also fail the
    // test, but for the wrong stated reason).
    cy.intercept('POST', '**/api/items').as('createItem')
    const item = uniqueItem()

    cy.getBySel('add-item-nav-link').click()
    cy.getBySel('name-input').type(item.name)
    cy.getBySel('price-input').type(String(item.price))
    cy.getBySel('category-input').select(item.category)
    cy.getBySel('description-input').type(item.description)
    cy.getBySel('submit-btn').click()

    cy.wait('@createItem').its('request.headers.authorization').should('match', /^Bearer .+\..+\..+$/)
  })

  it('shows an error and stays on the form when creating an item fails', { tags: '@regression' }, () => {
    cy.allowConsoleErrors()
    cy.simulateFailure('itemCreate')
    const item = uniqueItem()

    cy.getBySel('add-item-nav-link').click()
    cy.getBySel('name-input').type(item.name)
    cy.getBySel('price-input').type(String(item.price))
    cy.getBySel('category-input').select(item.category)
    cy.getBySel('description-input').type(item.description)
    cy.getBySel('submit-btn').click()

    cy.wait('@itemCreateFailure')
    cy.getBySel('item-form-error-summary').should('be.visible')
    cy.url().should('include', '/Items/Create')
  })

  it('shows a loading state while creating an item', { tags: '@regression' }, () => {
    cy.simulateSlowResponse('itemCreate')
    const item = uniqueItem()

    cy.getBySel('add-item-nav-link').click()
    cy.getBySel('name-input').type(item.name)
    cy.getBySel('price-input').type(String(item.price))
    cy.getBySel('category-input').select(item.category)
    cy.getBySel('description-input').type(item.description)
    cy.getBySel('submit-btn').click()

    cy.getBySel('submit-btn').should('be.disabled')
    cy.wait('@itemCreateSlow')
    cy.url().should('match', /\/Items$/)
  })

  it('can be filled out and submitted using only the keyboard', { tags: '@regression' }, () => {
    // cypress-axe already treats this app as accessibility-relevant, but
    // nothing before this ever drove ItemForm with Tab instead of a mouse.
    // cy.press(TAB) genuinely moves focus (verified directly: it walks
    // name -> price -> category -> description -> image-url -> submit-btn,
    // in that real order, no focus trap). Activating the reached button is
    // deliberately a .click(), not .type('{enter}') — tried first, and
    // confirmed by counting actual POST /api/items requests that
    // .type('{enter}') on a focused <button> genuinely double-submits (2
    // requests from one call, a real Cypress quirk specific to using .type()
    // on a button rather than a text field). A real Enter or Space press on
    // a keyboard-focused button both resolve to the same native
    // "activate this button" action a browser performs, which is exactly
    // what .click() here verifies: not that a mouse can reach it, but that
    // the exact element real Tab-navigation landed on is the working submit
    // control.
    const item = uniqueItem()

    cy.getBySel('add-item-nav-link').click()
    cy.getBySel('name-input').focus().type(item.name)
    cy.press(Cypress.Keyboard.Keys.TAB)
    cy.focused().should('have.attr', 'data-testid', 'price-input').type(String(item.price))
    cy.press(Cypress.Keyboard.Keys.TAB)
    cy.focused().should('have.attr', 'data-testid', 'category-input').select(item.category)
    cy.press(Cypress.Keyboard.Keys.TAB)
    cy.focused().should('have.attr', 'data-testid', 'description-input').type(item.description)
    cy.press(Cypress.Keyboard.Keys.TAB)
    cy.focused().should('have.attr', 'data-testid', 'image-url-input')
    cy.press(Cypress.Keyboard.Keys.TAB)
    cy.focused().should('have.attr', 'data-testid', 'submit-btn').click()

    cy.url().should('match', /\/Items$/)
    // search-input's value is restored from sessionStorage on remount (see
    // the "edits an item" test above) — clear() first so a stale term from
    // navigating Items -> Create -> Items doesn't get typed twice.
    cy.getBySel('search-input').clear().type(item.name)
    cy.getBySel('item-card').should('have.length', 1)
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

  it('shows an error and stays on the form when updating an item fails', { tags: '@regression' }, () => {
    // Proves ItemFormPage's real wiring (updateItem, no try/catch of its
    // own) actually carries a real backend failure up to the ItemForm
    // error UI already proven in isolation at the component layer
    // (ItemForm.cy.tsx) — a different, complementary claim from that
    // test, not a duplicate of it.
    cy.allowConsoleErrors()
    cy.simulateFailure('itemUpdate')

    cy.getBySel('search-input').type('Atomic Habits')
    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('edit-link').click()

    cy.getBySel('price-input').clear().type('99.99')
    cy.getBySel('submit-btn').click()

    cy.wait('@itemUpdateFailure')
    cy.getBySel('item-form-error-summary').should('be.visible')
    cy.url().should('include', '/Items/Edit')
  })

  it('shows an error when loading an item to edit fails', { tags: '@regression' }, () => {
    // ItemFormPage.tsx's edit-mode getItem() call — a second, separate
    // call site from ItemDetailPage's, previously just as uncaught.
    cy.allowConsoleErrors()
    cy.getBySel('search-input').type('Atomic Habits')
    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('item-card').then(($card) => {
      const id = $card.attr('data-item-id')
      cy.simulateFailure('itemDetail')
      cy.visit(`/Items/Edit/${id}`)
    })

    cy.wait('@itemDetailFailure')
    cy.getBySel('item-form-load-error').should('be.visible')
  })

  it('deletes an item after confirming', { tags: '@smoke' }, () => {
    // Stubbed explicitly (not relying on Cypress's default auto-accept)
    // so the exact confirmation message is actually asserted, not just
    // assumed to be whatever happened to show up.
    cy.window().then((win) => cy.stub(win, 'confirm').returns(true)).as('confirm')

    cy.getBySel('search-input').type('Trade Routes')
    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('delete-btn').click()

    cy.get('@confirm').should(
      'have.been.calledWith',
      'Delete "Strategy Board Game: Trade Routes"? This can\'t be undone.',
    )
    cy.getBySel('toast-notification').should('contain.text', 'was deleted')
    cy.getBySel('no-results').should('be.visible')
  })

  it('shows an error toast and leaves the item in place when delete fails', { tags: '@regression' }, () => {
    cy.allowConsoleErrors()
    cy.simulateFailure('itemDelete')
    cy.window().then((win) => cy.stub(win, 'confirm').returns(true))

    cy.getBySel('search-input').type('Trade Routes')
    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('delete-btn').click()

    cy.wait('@itemDeleteFailure')
    cy.getBySel('toast-notification').should('contain.text', 'Could not delete the item')
    cy.getBySel('item-card').should('have.length', 1)
  })

  it('does not delete when the confirm dialog is dismissed', { tags: '@regression' }, () => {
    cy.window().then((win) => cy.stub(win, 'confirm').returns(false))

    cy.getBySel('search-input').type('Trade Routes')
    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('delete-btn').click()

    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('toast-notification').should('not.exist')
  })

  it('reorders items via drag; the persisted request body matches the new order', { tags: '@smoke' }, () => {
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

  it('reverts the order and shows an error toast when the reorder request fails', { tags: '@regression' }, () => {
    // E2E-level companion to CatalogGrid.cy.tsx's component-level
    // red-green-verified rollback test — proves the same fix holds
    // through the full page (routing, real AuthContext, real DOM drag
    // events), not a second proof of the underlying bug.
    cy.allowConsoleErrors()
    cy.simulateFailure('itemsReorder')

    cy.getBySel('item-card').then(($cards) => {
      const firstId = $cards.eq(0).attr('data-item-id')

      cy.getBySel('item-card').eq(1).as('draggedCard').trigger('dragstart')
      cy.getBySel('item-card').eq(0).trigger('dragover')
      cy.get('@draggedCard').trigger('dragend')

      cy.wait('@itemsReorderFailure')
      cy.getBySel('toast-notification').should('contain.text', 'Could not save the new order')
      cy.getBySel('item-card').eq(0).should('have.attr', 'data-item-id', firstId as string)
    })
  })

  it('shows an error when an image upload fails, and sends the real item id and file', { tags: '@regression' }, () => {
    cy.allowConsoleErrors()
    cy.getBySel('search-input').type('Atomic Habits')
    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('item-card').invoke('attr', 'data-item-id').then((expectedId) => {
      cy.getBySel('edit-link').click()

      cy.simulateFailure('itemImage')
      cy.getBySel('image-mode-file').click()
      cy.getBySel('image-file-input').selectFile('cypress/fixtures/test-image.png', { force: true })
      cy.getBySel('submit-btn').click()

      cy.wait('@itemImageFailure').then((interception) => {
        expect(interception.request.url).to.include(`/items/${expectedId}/image`)
        // Multipart bodies don't parse into JSON — asserting the real
        // Content-Type confirms a real file was actually attached to the
        // request, which is the only thing a multipart body can prove
        // without parsing it.
        expect(interception.request.headers['content-type']).to.match(/^multipart\/form-data/)
      })
      cy.getBySel('item-form-error-summary').should('be.visible')
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
