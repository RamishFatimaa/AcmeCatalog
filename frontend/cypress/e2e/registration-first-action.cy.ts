import { uniqueItem } from '../support/factories'

// Every create/edit test elsewhere in this suite (catalog-manage.cy.ts)
// authenticates via cy.loginSession() as the pre-seeded `testuser` — none of
// them ever prove the sequence a genuinely new user actually experiences:
// register, then immediately act, with the enrichment/authorization path
// exercised by a user identity-service has never seen before this test run.
// This is that one real, full journey, driven through the UI end to end.

describe('Fresh registration -> immediate first action', () => {
  beforeEach(() => {
    cy.resetDb()
  })

  it('a brand-new user can register, create, see their own name attributed, edit, delete, and log out', { tags: '@regression' }, () => {
    const username = `cy-fresh-user-${Date.now()}`
    const item = uniqueItem()

    cy.visit('/Account/Register')
    cy.getBySel('register-username-input').type(username)
    cy.getBySel('register-email-input').type(`${username}@example.com`)
    cy.getBySel('register-password-input').type('Test123!')
    cy.getBySel('register-confirm-password-input').type('Test123!')
    cy.getBySel('register-submit-btn').click()

    cy.url().should('include', '/Items')
    cy.getBySel('account-nav-link').should('contain.text', username)

    cy.getBySel('add-item-nav-link').click()
    cy.getBySel('name-input').type(item.name)
    cy.getBySel('price-input').type(String(item.price))
    cy.getBySel('category-input').select(item.category)
    cy.getBySel('description-input').type(item.description)
    cy.getBySel('submit-btn').click()

    cy.url().should('match', /\/Items$/)
    cy.getBySel('search-input').type(item.name)
    cy.getBySel('item-card').should('have.length', 1)
    // The real point of this test: createdByDisplayName must resolve to the
    // username that just registered, not "testuser" (nothing else ever
    // creates as anyone else) and not "Unknown" (the enrichment fallback
    // when identity-service can't resolve the id — proving the brand-new
    // user's id round-trips through the real inter-service lookup, not just
    // an id that happened to already exist in identity-service's seed data).
    cy.getBySel('item-created-by').should('contain.text', `Added by ${username}`)

    cy.getBySel('edit-link').click()
    cy.getBySel('price-input').clear().type('55.55')
    cy.getBySel('submit-btn').click()

    cy.url().should('match', /\/Items$/)
    cy.getBySel('search-input').clear().type(item.name)
    cy.getBySel('item-price').should('contain.text', '$55.55')

    cy.window().then((win) => cy.stub(win, 'confirm').returns(true))
    cy.getBySel('delete-btn').click()
    cy.getBySel('toast-notification').should('contain.text', 'was deleted')
    cy.getBySel('no-results').should('be.visible')

    cy.getBySel('logout-btn').click()
    cy.getBySel('login-nav-link').should('be.visible')
    cy.window().its('localStorage').invoke('getItem', 'acmecatalog.auth').should('be.null')
  })
})
