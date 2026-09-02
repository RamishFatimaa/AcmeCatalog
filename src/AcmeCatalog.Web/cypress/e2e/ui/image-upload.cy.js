// The image dropzone on Create/Edit: a real file selected through the hidden
// input should preview instantly (client-side FileReader), and dragging a
// file over the zone should toggle its highlighted state.

describe('Item image upload dropzone', () => {
  beforeEach(() => {
    cy.login()
    cy.visit('/Items/Create')
  })

  it('previews the selected file without a page reload', () => {
    cy.get('[data-testid=image-preview]').should('have.class', 'd-none')

    cy.get('[data-testid=image-file-input]').selectFile('cypress/fixtures/sample-image.png', { force: true })

    cy.get('[data-testid=image-preview]')
      .should('not.have.class', 'd-none')
      .and('have.attr', 'src')
      .and('match', /^data:image\/png;base64,/)
  })

  it('highlights the dropzone while a file is dragged over it', () => {
    // item-form.js's dragenter/dragleave handlers only toggle a CSS class —
    // they never read e.dataTransfer, so a bare trigger is enough here too.
    cy.get('[data-testid=image-dropzone]').should('not.have.class', 'border-primary')

    cy.get('[data-testid=image-dropzone]').trigger('dragenter')
    cy.get('[data-testid=image-dropzone]').should('have.class', 'border-primary')

    cy.get('[data-testid=image-dropzone]').trigger('dragleave')
    cy.get('[data-testid=image-dropzone]').should('not.have.class', 'border-primary')
  })

  it('creating an item with an uploaded image serves it back from /uploads', () => {
    const name = `Upload Test Item ${Date.now()}`

    cy.get('[data-testid=name-input]').type(name)
    cy.get('[data-testid=price-input]').clear().type('12.50')
    cy.get('[data-testid=category-input]').select(1)
    cy.get('[data-testid=description-input]').type('Created with an uploaded image.')
    cy.get('[data-testid=image-file-input]').selectFile('cypress/fixtures/sample-image.png', { force: true })
    cy.get('[data-testid=submit-btn]').click()

    // The catalog only shows the first page by default, and a new item is
    // appended to the end of the sort order — search for it by name instead
    // of assuming it's on page one.
    cy.get('[data-testid=search-input]').type(name)
    cy.contains('[data-testid=item-name]', name)
      .closest('[data-testid=item-card]')
      .find('img')
      .should('have.attr', 'src')
      .and('include', '/uploads/')
  })
})
