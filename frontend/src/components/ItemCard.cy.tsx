import { ItemCard } from './ItemCard'
import type { Item } from '../types'

const sampleItem: Item = {
  id: 1,
  name: 'Wireless Noise-Cancelling Headphones',
  price: 179.99,
  description: 'Over-ear Bluetooth headphones.',
  category: 'Electronics',
  imageUrl: 'https://example.com/headphones.jpg',
  sortOrder: 0,
  dateAdded: '2026-01-01T00:00:00Z',
  createdByDisplayName: 'testuser',
}

const noop = () => {}

describe('<ItemCard />', () => {
  it('renders the item name, price, and category', () => {
    cy.mount(
      <ItemCard
        item={sampleItem}
        layout="grid"
        selected={false}
        onToggleSelect={noop}
        onViewDetail={noop}
        isAuthenticated={false}
        onQuickView={noop}
        onEdit={noop}
        onDelete={noop}
        onDragStart={noop}
        onDragOver={noop}
        onDragEnd={noop}
      />,
    )

    cy.get('[data-testid=item-name]').should('have.text', sampleItem.name)
    cy.get('[data-testid=item-price]').should('have.text', '$179.99')
    cy.get('[data-testid=item-category]').should('have.text', 'Electronics')
  })

  it('shows who added the item', () => {
    cy.mount(
      <ItemCard
        item={sampleItem}
        layout="grid"
        selected={false}
        onToggleSelect={noop}
        onViewDetail={noop}
        isAuthenticated={false}
        onQuickView={noop}
        onEdit={noop}
        onDelete={noop}
        onDragStart={noop}
        onDragOver={noop}
        onDragEnd={noop}
      />,
    )

    cy.get('[data-testid=item-created-by]').should('have.text', 'Added by testuser')
  })

  it('shows "Unknown" when the creator could not be resolved', () => {
    // The real value catalog-service sends when identity-service couldn't
    // resolve the id (down, slow, or the id itself was never matched) —
    // ItemResponse.From's actual fallback, not a placeholder.
    cy.mount(
      <ItemCard
        item={{ ...sampleItem, createdByDisplayName: 'Unknown' }}
        layout="grid"
        selected={false}
        onToggleSelect={noop}
        onViewDetail={noop}
        isAuthenticated={false}
        onQuickView={noop}
        onEdit={noop}
        onDelete={noop}
        onDragStart={noop}
        onDragOver={noop}
        onDragEnd={noop}
      />,
    )

    cy.get('[data-testid=item-created-by]').should('have.text', 'Added by Unknown')
  })

  it('hides authenticated-only controls for anonymous viewers', () => {
    cy.mount(
      <ItemCard
        item={sampleItem}
        layout="grid"
        selected={false}
        onToggleSelect={noop}
        onViewDetail={noop}
        isAuthenticated={false}
        onQuickView={noop}
        onEdit={noop}
        onDelete={noop}
        onDragStart={noop}
        onDragOver={noop}
        onDragEnd={noop}
      />,
    )

    cy.get('[data-testid=quick-view-btn]').should('exist')
    cy.get('[data-testid=edit-link]').should('not.exist')
    cy.get('[data-testid=delete-btn]').should('not.exist')
    cy.get('[data-testid=drag-handle]').should('not.exist')
  })

  it('shows edit/delete/drag controls once authenticated', () => {
    cy.mount(
      <ItemCard
        item={sampleItem}
        layout="grid"
        selected={false}
        onToggleSelect={noop}
        onViewDetail={noop}
        isAuthenticated={true}
        onQuickView={noop}
        onEdit={noop}
        onDelete={noop}
        onDragStart={noop}
        onDragOver={noop}
        onDragEnd={noop}
      />,
    )

    cy.get('[data-testid=edit-link]').should('be.visible')
    cy.get('[data-testid=delete-btn]').should('be.visible')
    cy.get('[data-testid=drag-handle]').should('be.visible')
  })

  it('calls onQuickView with the item when Quick View is clicked', () => {
    const onQuickView = cy.stub().as('onQuickView')
    cy.mount(
      <ItemCard
        item={sampleItem}
        layout="grid"
        selected={false}
        onToggleSelect={noop}
        onViewDetail={noop}
        isAuthenticated={false}
        onQuickView={onQuickView}
        onEdit={noop}
        onDelete={noop}
        onDragStart={noop}
        onDragOver={noop}
        onDragEnd={noop}
      />,
    )

    cy.get('[data-testid=quick-view-btn]').click()
    cy.get('@onQuickView').should('have.been.calledOnceWith', sampleItem)
  })

  it('calls onEdit and onDelete with the item when clicked', () => {
    const onEdit = cy.stub().as('onEdit')
    const onDelete = cy.stub().as('onDelete')
    cy.mount(
      <ItemCard
        item={sampleItem}
        layout="grid"
        selected={false}
        onToggleSelect={noop}
        onViewDetail={noop}
        isAuthenticated={true}
        onQuickView={noop}
        onEdit={onEdit}
        onDelete={onDelete}
        onDragStart={noop}
        onDragOver={noop}
        onDragEnd={noop}
      />,
    )

    cy.get('[data-testid=edit-link]').click()
    cy.get('@onEdit').should('have.been.calledOnceWith', sampleItem)

    cy.get('[data-testid=delete-btn]').click()
    cy.get('@onDelete').should('have.been.calledOnceWith', sampleItem)
  })

  it('does not render an image when the item has none', () => {
    cy.mount(
      <ItemCard
        item={{ ...sampleItem, imageUrl: null }}
        layout="grid"
        selected={false}
        onToggleSelect={noop}
        onViewDetail={noop}
        isAuthenticated={false}
        onQuickView={noop}
        onEdit={noop}
        onDelete={noop}
        onDragStart={noop}
        onDragOver={noop}
        onDragEnd={noop}
      />,
    )

    cy.get('img').should('not.exist')
  })
})
