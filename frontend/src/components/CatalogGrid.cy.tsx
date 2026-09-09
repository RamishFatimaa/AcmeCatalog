import { MemoryRouter } from 'react-router-dom'
import { CatalogGrid } from './CatalogGrid'
import { AuthProvider } from '../auth/AuthContext'
import type { Item } from '../types'

// CatalogGrid is the largest, most stateful component in the app (search
// debounce, sort, price-range filter, view-mode + localStorage, pagination,
// bulk-select, drag-reorder) and previously had zero component-level test —
// every one of these behaviors was only ever proven by full E2E specs
// needing both backend services running. Stubs the same api/items.ts calls
// catalog-browse.cy.ts already stubs at the E2E layer, just without a full
// cy.visit(); AuthProvider/MemoryRouter are here because the component
// itself calls useAuth() and useNavigate().

const noop = () => {}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    name: 'Item',
    price: 10,
    description: 'A description.',
    category: 'Electronics',
    imageUrl: null,
    sortOrder: 0,
    dateAdded: '2026-01-01T00:00:00Z',
    createdByDisplayName: 'testuser',
    ...overrides,
  }
}

const sixItems: Item[] = [
  makeItem({ id: 1, name: 'Alpha Widget', price: 10, sortOrder: 0 }),
  makeItem({ id: 2, name: 'Bravo Gadget', price: 20, sortOrder: 1 }),
  makeItem({ id: 3, name: 'Charlie Tool', price: 30, sortOrder: 2 }),
  makeItem({ id: 4, name: 'Delta Device', price: 40, sortOrder: 3 }),
  makeItem({ id: 5, name: 'Echo Machine', price: 50, sortOrder: 4 }),
  makeItem({ id: 6, name: 'Foxtrot Gizmo', price: 60, sortOrder: 5 }),
]

const categories = ['Electronics', 'Books']

function mountGrid(auth?: { token: string; username: string }) {
  if (auth) {
    window.localStorage.setItem(
      'acmecatalog.auth',
      JSON.stringify({ ...auth, expiresAtUtc: new Date(Date.now() + 3600_000).toISOString() }),
    )
  } else {
    window.localStorage.removeItem('acmecatalog.auth')
  }

  cy.mount(
    <MemoryRouter>
      <AuthProvider>
        <CatalogGrid onEdit={noop} />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function stubItems(items: Item[]) {
  // Registered first so the more specific /categories intercept below
  // (registered second, so it wins for matching requests) takes precedence
  // for category requests while everything else falls through to this one.
  cy.intercept('GET', '**/api/items*', { body: items }).as('itemsRequest')
  cy.intercept('GET', '**/api/items/categories', { body: categories }).as('categoriesRequest')
}

describe('<CatalogGrid /> (anonymous)', () => {
  beforeEach(() => {
    window.localStorage.removeItem('acmecatalog.auth')
  })

  it('renders items and categories from the real API calls it makes', () => {
    stubItems(sixItems)
    mountGrid()

    cy.wait('@itemsRequest')
    cy.wait('@categoriesRequest')
    cy.get('[data-testid=item-card]').should('have.length', 4) // PAGE_SIZE
    cy.get('[data-testid=category-filter] option').should('have.length', categories.length + 1) // + "All Categories"
  })

  it('debounces search input, coalescing a full word into one request', () => {
    // Real timing on purpose, not a faked clock: cy.type()'s ~10ms/keystroke
    // is what actually exercises the cancel-and-reschedule behavior — each
    // keystroke's cleanup (`clearTimeout`) cancels the previous keystroke's
    // pending fetch before it can fire, so only the last one ever lands. A
    // broken (near-zero) debounce would let several keystrokes' timers fire
    // before the next character arrives, producing one request per
    // keystroke instead of one for the whole word — verified by temporarily
    // breaking the debounce locally and confirming this test then fails.
    stubItems(sixItems)
    mountGrid()
    cy.wait('@itemsRequest') // the initial (term='', 0ms debounce) load

    cy.get('[data-testid=search-input]').type('Widget')
    cy.wait('@itemsRequest').its('request.url').should('include', 'term=Widget')
    cy.get('@itemsRequest.all').should('have.length', 2)
  })

  it('refetches immediately (no debounce) when a sort option is chosen', () => {
    stubItems(sixItems)
    mountGrid()
    cy.wait('@itemsRequest')

    cy.get('[data-testid=sort-price]').click()
    cy.wait('@itemsRequest').its('request.url').should('include', 'sort=price')
  })

  it('filters by dragging the price-range sliders', () => {
    stubItems(sixItems)
    mountGrid()
    cy.wait('@itemsRequest')

    const setNativeValue = (selector: string, value: number) => {
      cy.get(`[data-testid=${selector}]`).then(($el) => {
        const input = $el[0] as HTMLInputElement
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
        nativeSetter.call(input, String(value))
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }

    setNativeValue('price-min-input', 15)
    cy.wait('@itemsRequest').its('request.url').should('include', 'minPrice=15')
    setNativeValue('price-max-input', 45)
    cy.wait('@itemsRequest').its('request.url').should('include', 'maxPrice=45')
  })

  it('switches view mode and persists the choice to localStorage', () => {
    stubItems(sixItems)
    mountGrid()
    cy.wait('@itemsRequest')

    cy.get('[data-testid=items-container]').should('not.have.class', 'flex-column')
    cy.get('[data-testid=view-list-btn]').click()
    cy.get('[data-testid=items-container]').should('have.class', 'flex-column')
    cy.window().its('localStorage').invoke('getItem', 'acmecatalog.viewMode').should('eq', 'list')
  })

  it('shows a graceful error when the catalog fails to load', () => {
    cy.intercept('GET', '**/api/items*', { forceNetworkError: true }).as('itemsFailure')
    cy.intercept('GET', '**/api/items/categories', { body: categories })
    mountGrid()

    cy.wait('@itemsFailure')
    cy.get('[data-testid=catalog-error]').should('be.visible')
    cy.get('[data-testid=item-card]').should('not.exist')
  })

  it('Load More reveals the next page from the already-fetched list', () => {
    stubItems(sixItems)
    mountGrid()
    cy.wait('@itemsRequest')

    cy.get('[data-testid=item-card]').should('have.length', 4)
    cy.get('[data-testid=load-more-btn]').click()
    cy.get('[data-testid=item-card]').should('have.length', 6)
    cy.get('[data-testid=load-more-btn]').should('not.exist')
  })
})

describe('<CatalogGrid /> (authenticated)', () => {
  beforeEach(() => {
    stubItems(sixItems)
  })

  it('selecting items shows the bulk bar; Delete Selected removes exactly the checked items', () => {
    cy.window().then((win) => cy.stub(win, 'confirm').returns(true)).as('confirm')
    cy.intercept('DELETE', '**/api/items/1', {}).as('delete1')
    cy.intercept('DELETE', '**/api/items/2', {}).as('delete2')
    mountGrid({ token: 'fake-token', username: 'testuser' })
    cy.wait('@itemsRequest')

    cy.get('[data-testid=select-item-checkbox]').eq(0).click()
    cy.get('[data-testid=select-item-checkbox]').eq(1).click()
    cy.get('[data-testid=bulk-actions-bar]').should('be.visible')
    cy.get('[data-testid=selected-count]').should('have.text', '2 selected')

    stubItems(sixItems.slice(2)) // re-stub the reload that follows deletion
    cy.get('[data-testid=delete-selected-btn]').click()

    cy.get('@confirm').should('have.been.calledWith', "Delete 2 selected item(s)? This can't be undone.")
    cy.wait('@delete1')
    cy.wait('@delete2')
    cy.get('[data-testid=toast-notification]').should('contain.text', '2 item(s) deleted')
    cy.get('[data-testid=bulk-actions-bar]').should('not.exist')
  })

  it('reorders items via drag; the PUT body matches the new order', () => {
    cy.intercept('PUT', '**/api/items/reorder', {}).as('reorder')
    mountGrid({ token: 'fake-token', username: 'testuser' })
    cy.wait('@itemsRequest')

    cy.get('[data-testid=item-card]').eq(1).as('draggedCard').trigger('dragstart')
    cy.get('[data-testid=item-card]').eq(0).trigger('dragover')
    cy.get('@draggedCard').trigger('dragend')

    cy.wait('@reorder').its('request.body').then((orderedIds: number[]) => {
      expect(orderedIds.slice(0, 2)).to.deep.eq([2, 1])
    })
    cy.get('[data-testid=toast-notification]').should('contain.text', 'Catalog order updated')
  })
})
