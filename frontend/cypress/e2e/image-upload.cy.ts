describe('Image upload (restores the file-upload feature dropped in the React migration)', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.loginSession()
    cy.visit('/Items')
  })

  it('is not offered when creating a new item (no id to attach a file to yet)', { tags: '@regression' }, () => {
    cy.getBySel('add-item-nav-link').click()
    cy.getBySel('image-mode-file').should('not.exist')
    cy.getBySel('image-url-input').should('be.visible')
  })

  it('uploads a real file and replaces the item image', { tags: '@smoke' }, () => {
    cy.getBySel('search-input').type('Atomic Habits')
    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('edit-link').click()

    cy.getBySel('image-mode-file').click()
    cy.getBySel('image-file-input').selectFile('cypress/fixtures/test-image.png', { force: true })
    cy.getBySel('submit-btn').click()

    cy.url().should('match', /\/Items$/)
    // The search term is restored from sessionStorage on remount (it was
    // already "Atomic Habits" before this navigation) — clear() first so
    // this doesn't type it twice.
    cy.getBySel('search-input').clear().type('Atomic Habits')
    cy.getBySel('item-card').should('have.length', 1)
      .find('img')
      .should('have.attr', 'src')
      .and('include', '/uploads/')
  })

  it('only accepts image file types', { tags: '@regression' }, () => {
    cy.getBySel('search-input').type('Atomic Habits')
    cy.getBySel('item-card').should('have.length', 1)
    cy.getBySel('edit-link').click()

    cy.getBySel('image-mode-file').click()
    cy.getBySel('image-file-input')
      .should('have.attr', 'accept')
      .and('include', 'image/png')
  })
})
