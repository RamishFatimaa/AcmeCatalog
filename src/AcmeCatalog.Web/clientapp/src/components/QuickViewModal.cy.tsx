import { QuickViewModal } from './QuickViewModal'
import type { Item } from '../types'

const sampleItem: Item = {
  id: 3,
  name: 'Atomic Habits',
  price: 16.99,
  description: 'A guide to building good habits.',
  category: 'Books',
  imageUrl: 'https://example.com/book.jpg',
  sortOrder: 0,
  dateAdded: '2026-01-01T00:00:00Z',
}

describe('<QuickViewModal />', () => {
  it('renders nothing visible when item is null', () => {
    cy.mount(<QuickViewModal item={null} onClose={cy.stub()} />)
    cy.get('[data-testid=quick-view-modal]').should('not.have.class', 'show')
    cy.get('[data-testid=quick-view-name]').should('not.exist')
  })

  it('shows the item name, price, category, and description when open', () => {
    cy.mount(<QuickViewModal item={sampleItem} onClose={cy.stub()} />)

    cy.get('[data-testid=quick-view-modal]').should('have.class', 'show')
    cy.get('[data-testid=quick-view-name]').should('have.text', sampleItem.name)
    cy.get('[data-testid=quick-view-price]').should('have.text', '$16.99')
    cy.get('[data-testid=quick-view-category]').should('contain.text', 'Books')
    cy.get('[data-testid=quick-view-description]').should('have.text', sampleItem.description)
  })

  it('points the iframe at this item\'s ImagePreview route', () => {
    cy.mount(<QuickViewModal item={sampleItem} onClose={cy.stub()} />)

    cy.get('[data-testid=quick-view-image-frame]')
      .should('have.attr', 'src', `/Items/ImagePreview/${sampleItem.id}`)
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = cy.stub().as('onClose')
    cy.mount(<QuickViewModal item={sampleItem} onClose={onClose} />)

    cy.get('.btn-close').click()
    cy.get('@onClose').should('have.been.calledOnce')
  })

  it('calls onClose when clicking the backdrop, but not when clicking inside the dialog', () => {
    const onClose = cy.stub().as('onClose')
    cy.mount(<QuickViewModal item={sampleItem} onClose={onClose} />)

    cy.get('[data-testid=quick-view-name]').click()
    cy.get('@onClose').should('not.have.been.called')

    cy.get('[data-testid=quick-view-modal]').click(5, 5)
    cy.get('@onClose').should('have.been.calledOnce')
  })
})
