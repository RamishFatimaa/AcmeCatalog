// Edit and Delete flows. Test items are created and torn down through the
// API (see commands.js) rather than the UI, so these specs don't depend on
// pagination and don't leave permanent rows behind if a test fails midway.

describe('Edit item', () => {
  let token
  let itemId
  const originalName = `Edit Target ${Date.now()}`

  before(() => {
    cy.apiLogin().then((t) => {
      token = t
      cy.apiCreateItem(token, { name: originalName }).then((item) => { itemId = item.id })
    })
  })

  after(() => {
    cy.apiDeleteItem(token, itemId)
  })

  beforeEach(() => {
    cy.login()
    cy.visit(`/Items/Edit/${itemId}`)
  })

  it('pre-fills the form with the item\'s current values', () => {
    cy.get('[data-testid=name-input]').should('have.value', originalName)
    cy.get('[data-testid=price-input]').should('have.value', '9.99')
  })

  it('validates required fields before submitting', () => {
    cy.get('[data-testid=name-input]').clear()
    cy.get('[data-testid=submit-btn]').click()
    cy.get('[data-testid=name-error]').should('be.visible')
  })

  it('saves changes and shows a confirmation toast', () => {
    const updatedName = `${originalName} (edited)`
    cy.get('[data-testid=name-input]').clear().type(updatedName)
    cy.get('[data-testid=price-input]').clear().type('24.99')
    cy.get('[data-testid=submit-btn]').click()

    cy.url().should('include', '/Items')
    cy.url().should('not.include', '/Edit')
    cy.get('[data-testid=toast-notification]').should('contain.text', 'was updated')

    cy.request(`/api/items/${itemId}`).then((response) => {
      expect(response.body.name).to.eq(updatedName)
      expect(response.body.price).to.eq(24.99)
    })
  })
})

describe('Delete item', () => {
  let token

  beforeEach(() => {
    cy.login()
  })

  it('confirms via the modal before deleting, and shows a toast after', () => {
    const name = `Delete Target ${Date.now()}`

    cy.apiLogin().then((t) => {
      token = t
      return cy.apiCreateItem(token, { name })
    }).then(() => {
      cy.visit('/Items')
      cy.get('[data-testid=search-input]').type(name)
      cy.contains('[data-testid=item-name]', name).should('be.visible')

      cy.contains('[data-testid=item-card]', name)
        .find('[data-testid=delete-btn]')
        .click()

      cy.get('[data-testid=delete-modal]').should('be.visible')
      cy.get('[data-testid=delete-item-name]').should('contain.text', name)

      cy.get('[data-testid=confirm-delete-btn]').click()

      cy.get('[data-testid=toast-notification]').should('contain.text', 'was deleted')
      cy.contains('[data-testid=item-name]', name).should('not.exist')
    })
  })
})
