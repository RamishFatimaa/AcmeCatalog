import { ItemForm } from './ItemForm'
import type { Item } from '../types'

const sampleItem: Item = {
  id: 7,
  name: 'Trail Running Shoes',
  price: 89.0,
  description: 'Lightweight trail shoes.',
  category: 'Sporting Goods',
  imageUrl: null,
  sortOrder: 0,
  dateAdded: '2026-01-01T00:00:00Z',
  createdByDisplayName: 'testuser',
}

describe('<ItemForm /> — create mode', () => {
  it('starts with all fields empty', () => {
    cy.mount(<ItemForm onSubmit={cy.stub().resolves()} onCancel={cy.stub()} />)

    cy.get('[data-testid=name-input]').should('have.value', '')
    cy.get('[data-testid=price-input]').should('have.value', '')
    cy.get('[data-testid=category-input]').should('have.value', '')
    cy.get('[data-testid=submit-btn]').should('have.text', 'Save Item')
  })

  it('blocks submission and shows every field error when nothing is filled in', () => {
    const onSubmit = cy.stub().as('onSubmit')
    cy.mount(<ItemForm onSubmit={onSubmit} onCancel={cy.stub()} />)

    cy.get('[data-testid=submit-btn]').click()

    cy.get('[data-testid=name-error]').should('be.visible')
    cy.get('[data-testid=price-error]').should('be.visible')
    cy.get('[data-testid=category-error]').should('be.visible')
    cy.get('[data-testid=description-error]').should('be.visible')
    cy.get('@onSubmit').should('not.have.been.called')
  })

  it('rejects a zero or negative price', () => {
    cy.mount(<ItemForm onSubmit={cy.stub().resolves()} onCancel={cy.stub()} />)

    cy.get('[data-testid=name-input]').type('Something')
    cy.get('[data-testid=price-input]').type('0')
    cy.get('[data-testid=category-input]').select('Electronics')
    cy.get('[data-testid=description-input]').type('A description.')
    cy.get('[data-testid=submit-btn]').click()

    cy.get('[data-testid=price-error]').should('contain.text', 'positive')
  })

  it('submits trimmed, typed values when the form is valid', () => {
    const onSubmit = cy.stub().resolves().as('onSubmit')
    cy.mount(<ItemForm onSubmit={onSubmit} onCancel={cy.stub()} />)

    cy.get('[data-testid=name-input]').type('  New Gadget  ')
    cy.get('[data-testid=price-input]').type('24.99')
    cy.get('[data-testid=category-input]').select('Electronics')
    cy.get('[data-testid=description-input]').type('  A great gadget.  ')
    cy.get('[data-testid=submit-btn]').click()

    cy.get('@onSubmit').should('have.been.calledOnceWith', {
      name: 'New Gadget',
      price: 24.99,
      category: 'Electronics',
      description: 'A great gadget.',
      imageUrl: null,
    })
  })

  it('disables the submit button while a submission is pending, blocking a duplicate call', () => {
    // Real defense in ItemForm.tsx (disabled={submitting}), never exercised
    // before — a rapid double-click here is exactly how a duplicate item
    // gets created in production. onSubmit is held pending deliberately so
    // the second click lands while submitting is still true.
    let resolveSubmit: (() => void) | undefined
    const onSubmit = cy
      .stub()
      .as('onSubmit')
      .callsFake(() => new Promise<void>((resolve) => { resolveSubmit = resolve }))
    cy.mount(<ItemForm onSubmit={onSubmit} onCancel={cy.stub()} />)

    cy.get('[data-testid=name-input]').type('Something')
    cy.get('[data-testid=price-input]').type('10')
    cy.get('[data-testid=category-input]').select('Electronics')
    cy.get('[data-testid=description-input]').type('A description.')

    cy.get('[data-testid=submit-btn]').click()
    cy.get('[data-testid=submit-btn]').should('be.disabled')
    cy.get('[data-testid=submit-btn]').click({ force: true })

    cy.get('@onSubmit').should('have.been.calledOnce')
    cy.then(() => resolveSubmit?.())
  })

  it('clears a field error as soon as the field is fixed and resubmitted', () => {
    cy.mount(<ItemForm onSubmit={cy.stub().resolves()} onCancel={cy.stub()} />)

    cy.get('[data-testid=submit-btn]').click()
    cy.get('[data-testid=name-error]').should('be.visible')

    cy.get('[data-testid=name-input]').type('Now filled in')
    cy.get('[data-testid=price-input]').type('10')
    cy.get('[data-testid=category-input]').select('Books')
    cy.get('[data-testid=description-input]').type('Description text.')
    cy.get('[data-testid=submit-btn]').click()

    cy.get('[data-testid=name-error]').should('not.exist')
  })

  it('calls onCancel when Cancel is clicked, without submitting', () => {
    const onCancel = cy.stub().as('onCancel')
    const onSubmit = cy.stub().as('onSubmit')
    cy.mount(<ItemForm onSubmit={onSubmit} onCancel={onCancel} />)

    cy.contains('button', 'Cancel').click()
    cy.get('@onCancel').should('have.been.calledOnce')
    cy.get('@onSubmit').should('not.have.been.called')
  })

  it('shows a generic error and stays usable when onSubmit rejects with a non-validation error', () => {
    // The real bug this proves the fix for: ItemForm's catch only ever
    // handled ApiError's validation shape (err.problem?.errors) — a plain
    // network failure or 500 (ItemFormPage's real createItem/updateItem/
    // uploadItemImage all throw exactly this shape) was rethrown with no
    // catch anywhere above it, an unhandled promise rejection instead of
    // a shown message. onSubmit is a prop here (no network call inside
    // ItemForm itself, see routes.ts's header comment on why this proof
    // lives at the component layer, not behind a cy.intercept()), so a
    // plain rejecting stub reproduces the exact shape ItemFormPage's real
    // wiring would throw.
    const onSubmit = cy.stub().rejects(new Error('network error')).as('onSubmit')
    cy.mount(<ItemForm onSubmit={onSubmit} onCancel={cy.stub()} />)

    cy.get('[data-testid=name-input]').type('Something')
    cy.get('[data-testid=price-input]').type('10')
    cy.get('[data-testid=category-input]').select('Electronics')
    cy.get('[data-testid=description-input]').type('A description.')
    cy.get('[data-testid=submit-btn]').click()

    cy.get('[data-testid=item-form-error-summary]').should(
      'contain.text',
      'Something went wrong saving this item.',
    )
    // Not left disabled forever, and the entered values weren't wiped —
    // the form is still genuinely usable for a retry.
    cy.get('[data-testid=submit-btn]').should('not.be.disabled')
    cy.get('[data-testid=name-input]').should('have.value', 'Something')
  })
})

describe('<ItemForm /> — edit mode', () => {
  it('pre-fills every field from the initial item', () => {
    cy.mount(<ItemForm initial={sampleItem} onSubmit={cy.stub().resolves()} onCancel={cy.stub()} />)

    cy.get('[data-testid=name-input]').should('have.value', sampleItem.name)
    cy.get('[data-testid=price-input]').should('have.value', String(sampleItem.price))
    cy.get('[data-testid=category-input]').should('have.value', sampleItem.category)
    cy.get('[data-testid=description-input]').should('have.value', sampleItem.description)
    cy.get('[data-testid=submit-btn]').should('have.text', 'Save Changes')
  })
})
