describe('Catalog bulk actions (authenticated)', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.loginSession()
    cy.visit('/Items')
  })

  it('checking items shows a running count and a Delete Selected bar', { tags: '@regression' }, () => {
    cy.getBySel('bulk-actions-bar').should('not.exist')

    cy.getBySel('select-item-checkbox').eq(0).click()
    cy.getBySel('bulk-actions-bar').should('be.visible')
    cy.getBySel('selected-count').should('contain.text', '1 selected')

    cy.getBySel('select-item-checkbox').eq(1).click()
    cy.getBySel('selected-count').should('contain.text', '2 selected')
  })

  it('unchecking a box removes it from the selection', { tags: '@regression' }, () => {
    cy.getBySel('select-item-checkbox').eq(0).click()
    cy.getBySel('select-item-checkbox').eq(0).click()
    cy.getBySel('bulk-actions-bar').should('not.exist')
  })

  it('Delete Selected removes exactly the checked items', { tags: '@smoke' }, () => {
    cy.window().then((win) => cy.stub(win, 'confirm').returns(true)).as('confirm')

    cy.getBySel('item-name').eq(0).invoke('text').then((firstName) => {
      cy.getBySel('item-name').eq(1).invoke('text').then((secondName) => {
        cy.getBySel('select-item-checkbox').eq(0).click()
        cy.getBySel('select-item-checkbox').eq(1).click()
        cy.getBySel('delete-selected-btn').click()

        cy.get('@confirm').should('have.been.calledWith', "Delete 2 selected item(s)? This can't be undone.")
        cy.getBySel('toast-notification').should('contain.text', '2 item(s) deleted')
        cy.getBySel('bulk-actions-bar').should('not.exist')
        cy.contains('[data-testid=item-name]', firstName).should('not.exist')
        cy.contains('[data-testid=item-name]', secondName).should('not.exist')
      })
    })
  })

  it('does not delete the selection when the confirm dialog is dismissed', { tags: '@regression' }, () => {
    cy.window().then((win) => cy.stub(win, 'confirm').returns(false))

    cy.getBySel('select-item-checkbox').eq(0).click()
    cy.getBySel('select-item-checkbox').eq(1).click()
    cy.getBySel('delete-selected-btn').click()

    cy.getBySel('selected-count').should('contain.text', '2 selected')
    cy.getBySel('toast-notification').should('not.exist')
  })
})

describe('Catalog bulk actions (anonymous)', () => {
  beforeEach(() => {
    cy.resetDb()
    cy.visit('/Items')
  })

  it('never shows selection checkboxes to anonymous visitors', { tags: '@regression' }, () => {
    cy.getBySel('item-card').should('have.length.greaterThan', 0)
    cy.getBySel('select-item-checkbox').should('not.exist')
  })
})
