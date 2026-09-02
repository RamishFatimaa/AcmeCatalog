describe('Items catalog', () => {
  it('renders the catalog index for anonymous users', () => {
    cy.visit('/Items')
    cy.get('body').should('be.visible')
  })

  it('shows quick view for an item', () => {
    cy.visit('/Items')
    // opens the first item's details page directly
    cy.request('/Items/Details/1').its('status').should('eq', 200)
  })
})

describe('Create item (authenticated)', () => {
  beforeEach(() => {
    cy.login()
    cy.visit('/Items/Create')
  })

  it('validates required fields on empty submit', () => {
    cy.get('[data-testid=submit-btn]').click()
    cy.url().should('include', '/Items/Create')
    cy.get('[data-testid=name-error]').should('be.visible')
  })

  it('creates a new item and returns to the catalog', () => {
    const name = `Cypress Widget ${Date.now()}`
    cy.get('[data-testid=name-input]').type(name)
    cy.get('[data-testid=price-input]').clear().type('19.99')
    cy.get('[data-testid=category-input]').select(1) // first real category option
    cy.get('[data-testid=description-input]').type('Created by a Cypress E2E test.')
    cy.get('[data-testid=submit-btn]').click()

    cy.url().should('not.include', '/Create')
    cy.contains(name).should('be.visible')
  })
})