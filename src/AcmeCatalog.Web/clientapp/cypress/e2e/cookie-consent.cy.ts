// The one real cookie in the app (everything else is localStorage/
// sessionStorage) — Cypress clears cookies between tests automatically
// (test isolation), so each test here starts from a clean slate with no
// explicit teardown needed.

describe('Cookie consent banner', () => {
  it('shows on first visit; Accept sets a real cookie, not localStorage', { tags: '@regression' }, () => {
    cy.visit('/')
    cy.getBySel('cookie-banner').should('be.visible')
    cy.getCookie('acmecatalog_cookie_consent').should('not.exist')

    cy.getBySel('cookie-accept-btn').click()

    cy.getBySel('cookie-banner').should('not.exist')
    cy.getCookie('acmecatalog_cookie_consent').should('have.property', 'value', 'accepted')
    cy.window().its('localStorage').invoke('getItem', 'acmecatalog_cookie_consent').should('be.null')
  })

  it('Decline also dismisses the banner and records the choice', { tags: '@regression' }, () => {
    cy.visit('/')
    cy.getBySel('cookie-decline-btn').click()

    cy.getBySel('cookie-banner').should('not.exist')
    cy.getCookie('acmecatalog_cookie_consent').should('have.property', 'value', 'declined')
  })

  it('does not reappear on a later visit once a choice has been made', { tags: '@regression' }, () => {
    cy.visit('/')
    cy.getBySel('cookie-accept-btn').click()

    cy.visit('/Items')
    cy.getBySel('cookie-banner').should('not.exist')
  })
})
