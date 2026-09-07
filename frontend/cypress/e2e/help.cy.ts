describe('Help page', () => {
  beforeEach(() => {
    cy.visit('/Home/Help')
  })

  it('renders the embedded static help iframe', { tags: '@regression' }, () => {
    cy.get('#help-frame').should('be.visible').and('have.attr', 'src', '/help-content.html')
  })

  it('opens one FAQ at a time in the accordion', { tags: '@regression' }, () => {
    cy.contains('.accordion-button', 'Does reordering items persist?')
      .should('have.attr', 'aria-expanded', 'true')

    cy.contains('.accordion-button', 'What image formats can I upload?').click()

    cy.contains('.accordion-button', 'What image formats can I upload?')
      .should('have.attr', 'aria-expanded', 'true')
    cy.contains('.accordion-button', 'Does reordering items persist?')
      .should('have.attr', 'aria-expanded', 'false')
  })
})
