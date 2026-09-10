import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Item } from '../types'
import { getItems, getCategories, deleteItem, reorderItems } from '../api/items'
import { useAuth } from '../auth/AuthContext'
import { ItemCard } from './ItemCard'
import { QuickViewModal } from './QuickViewModal'

const PAGE_SIZE = 4
const PRICE_SLIDER_MIN = 0
const PRICE_SLIDER_MAX = 300
const SEARCH_SESSION_KEY = 'acmecatalog.searchTerm'
const VIEW_MODE_KEY = 'acmecatalog.viewMode'

type SortOption = 'default' | 'name' | 'price' | 'newest'
type ViewMode = 'grid' | 'list'

interface CatalogGridProps {
  onEdit: (item: Item) => void
}

export function CatalogGrid({ onEdit }: CatalogGridProps) {
  const { isAuthenticated, token } = useAuth()
  const navigate = useNavigate()

  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<string[]>([])
  // Restored from sessionStorage (not localStorage): survives navigating away
  // from /Items and back within the same tab, but a fresh tab starts blank —
  // that's the whole point of sessionStorage over localStorage here.
  const [term, setTerm] = useState(() => sessionStorage.getItem(SEARCH_SESSION_KEY) ?? '')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<SortOption>('default')
  const [minPrice, setMinPrice] = useState(PRICE_SLIDER_MIN)
  const [maxPrice, setMaxPrice] = useState(PRICE_SLIDER_MAX)
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as ViewMode | null) ?? 'grid',
  )
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [quickViewItem, setQuickViewItem] = useState<Item | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [categoriesError, setCategoriesError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const draggingRef = useRef<Item | null>(null)
  const preDragOrderRef = useRef<Item[] | null>(null)

  const priceFilterActive = minPrice > PRICE_SLIDER_MIN || maxPrice < PRICE_SLIDER_MAX

  const loadItems = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    getItems({
      term: term || undefined,
      category: category || undefined,
      sort: sort === 'default' ? undefined : sort,
      minPrice: priceFilterActive ? minPrice : undefined,
      maxPrice: priceFilterActive ? maxPrice : undefined,
    })
      .then(setItems)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [term, category, sort, minPrice, maxPrice, priceFilterActive])

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategoriesError(true))
  }, [])

  useEffect(() => {
    const handle = setTimeout(loadItems, term ? 300 : 0)
    return () => clearTimeout(handle)
  }, [loadItems])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
    setSelectedIds(new Set())
  }, [term, category, sort, minPrice, maxPrice])

  useEffect(() => {
    sessionStorage.setItem(SEARCH_SESSION_KEY, term)
  }, [term])

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    if (!toast) return
    const handle = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(handle)
  }, [toast])

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount])
  const hasFilter = term.length > 0 || category.length > 0 || priceFilterActive
  const hasMore = visibleCount < items.length

  function handleDelete(item: Item) {
    if (!token) return
    if (!window.confirm(`Delete "${item.name}"? This can't be undone.`)) return

    deleteItem(item.id, token)
      .then(() => {
        setToast({ message: `"${item.name}" was deleted.`, type: 'danger' })
        setSelectedIds((current) => {
          const next = new Set(current)
          next.delete(item.id)
          return next
        })
        loadItems()
      })
      .catch(() => setToast({ message: 'Could not delete the item.', type: 'danger' }))
  }

  function toggleSelected(item: Item, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(item.id)
      } else {
        next.delete(item.id)
      }
      return next
    })
  }

  function handleDeleteSelected() {
    if (!token || selectedIds.size === 0) return
    const count = selectedIds.size
    if (!window.confirm(`Delete ${count} selected item(s)? This can't be undone.`)) return

    Promise.all([...selectedIds].map((id) => deleteItem(id, token)))
      .then(() => {
        setToast({ message: `${count} item(s) deleted.`, type: 'danger' })
        setSelectedIds(new Set())
        loadItems()
      })
      .catch(() => {
        // Promise.all rejects on the first failure, but any deletes that
        // already succeeded really did happen server-side — reload so the
        // grid reflects that partial reality instead of showing stale,
        // already-deleted items alongside a generic failure toast.
        setToast({ message: 'Could not delete the selected items.', type: 'danger' })
        loadItems()
      })
  }

  function handleDragStart(item: Item) {
    draggingRef.current = item
    // Snapshot the order as it stood before any drag-driven reordering —
    // handleDragOver below mutates `items` optimistically as the drag
    // moves, so by the time handleDragEnd's request fails, `items` is
    // already the (possibly wrong) new order and can't be used to
    // recover the old one.
    preDragOrderRef.current = items
  }

  function handleDragOver(target: Item, event: React.DragEvent) {
    event.preventDefault()
    const dragging = draggingRef.current
    if (!dragging || dragging.id === target.id) return

    setItems((current) => {
      const next = current.filter((i) => i.id !== dragging.id)
      const targetIndex = next.findIndex((i) => i.id === target.id)
      next.splice(targetIndex, 0, dragging)
      return next
    })
  }

  function handleDragEnd() {
    draggingRef.current = null
    if (!token) return

    const preDragOrder = preDragOrderRef.current
    const orderedIds = items.map((i) => i.id)
    reorderItems(orderedIds, token)
      .then(() => setToast({ message: 'Catalog order updated.', type: 'success' }))
      .catch(() => {
        if (preDragOrder) setItems(preDragOrder)
        setToast({ message: 'Could not save the new order.', type: 'danger' })
      })
  }

  return (
    <div>
      <div className="row g-3 align-items-end mb-3">
        <div className="col-md-6">
          <input
            type="text"
            className="form-control"
            placeholder="Search by name or description..."
            autoComplete="off"
            data-testid="search-input"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <div className="col-md-4">
          <select
            className="form-select"
            aria-label="Filter by category"
            data-testid="category-filter"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {categoriesError && (
            <div className="text-danger small mt-1" data-testid="categories-error">
              Could not load categories.
            </div>
          )}
        </div>
        <div className="col-md-2">
          <button
            type="button"
            className="btn btn-outline-secondary w-100"
            data-testid="clear-filters-btn"
            onClick={() => {
              setTerm('')
              setCategory('')
              setSort('default')
              setMinPrice(PRICE_SLIDER_MIN)
              setMaxPrice(PRICE_SLIDER_MAX)
            }}
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="catalog-toolbar row g-4 mb-3 p-3">
        <div className="col-md-4">
          <div className="form-label small fw-semibold mb-2">Sort by</div>
          <div className="d-flex flex-column gap-1" data-testid="sort-options" role="radiogroup" aria-label="Sort by">
            {(['default', 'name', 'price', 'newest'] as const).map((option) => (
              <div className="form-check" key={option}>
                <input
                  type="radio"
                  className="form-check-input"
                  id={`sort-${option}`}
                  name="sort"
                  data-testid={`sort-${option}`}
                  checked={sort === option}
                  onChange={() => setSort(option)}
                />
                <label className="form-check-label" htmlFor={`sort-${option}`}>
                  {option === 'default' ? 'Manual order' : option === 'newest' ? 'Newest first' : `${option[0].toUpperCase()}${option.slice(1)}`}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="col-md-5">
          <div className="form-label small fw-semibold mb-2">
            Price range: ${minPrice} &ndash; ${maxPrice}
          </div>
          <div className="mb-2">
            <label className="form-label small text-muted mb-0" htmlFor="price-min-input">Min</label>
            <input
              type="range"
              className="form-range"
              id="price-min-input"
              data-testid="price-min-input"
              min={PRICE_SLIDER_MIN}
              max={PRICE_SLIDER_MAX}
              step={5}
              value={minPrice}
              onChange={(e) => setMinPrice(Math.min(Number(e.target.value), maxPrice))}
            />
          </div>
          <div>
            <label className="form-label small text-muted mb-0" htmlFor="price-max-input">Max</label>
            <input
              type="range"
              className="form-range"
              id="price-max-input"
              data-testid="price-max-input"
              min={PRICE_SLIDER_MIN}
              max={PRICE_SLIDER_MAX}
              step={5}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Math.max(Number(e.target.value), minPrice))}
            />
          </div>
        </div>

        <div className="col-md-3">
          <div className="form-label small fw-semibold mb-2">View</div>
          <div className="btn-group w-100" role="group" aria-label="Grid or list view">
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline-primary'}`}
              data-testid="view-grid-btn"
              aria-pressed={viewMode === 'grid'}
              onClick={() => setViewMode('grid')}
            >
              Grid
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-primary'}`}
              data-testid="view-list-btn"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
          </div>
        </div>
      </div>

      <div className="d-flex align-items-center gap-3 mb-3">
        {!loadError && hasFilter && (
          <div className="text-muted small" aria-live="polite" data-testid="filter-status">
            {items.length} item(s) found
          </div>
        )}
        {loading && (
          <div className="text-muted small" data-testid="catalog-loading">
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            Loading&hellip;
          </div>
        )}
      </div>

      {isAuthenticated && selectedIds.size > 0 && (
        <div
          className="alert alert-secondary d-flex justify-content-between align-items-center"
          data-testid="bulk-actions-bar"
        >
          <span data-testid="selected-count">{selectedIds.size} selected</span>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            data-testid="delete-selected-btn"
            onClick={handleDeleteSelected}
          >
            Delete Selected
          </button>
        </div>
      )}

      {loadError ? (
        <div className="alert alert-danger" data-testid="catalog-error">
          Could not load the catalog. Please try again.
        </div>
      ) : items.length === 0 ? (
        <div className="alert alert-info" data-testid="no-results">No items match your filters.</div>
      ) : (
        <div className={viewMode === 'grid' ? 'row g-4' : 'd-flex flex-column gap-3'} data-testid="items-container">
          {visibleItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              layout={viewMode}
              isAuthenticated={isAuthenticated}
              selected={selectedIds.has(item.id)}
              onToggleSelect={toggleSelected}
              onViewDetail={(i) => navigate(`/Items/${i.id}`)}
              onQuickView={setQuickViewItem}
              onEdit={onEdit}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="text-center mt-4">
          <button
            type="button"
            className="btn btn-outline-primary"
            data-testid="load-more-btn"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Load More
          </button>
        </div>
      )}

      <QuickViewModal item={quickViewItem} onClose={() => setQuickViewItem(null)} />

      {toast && (
        <div className="toast-container position-fixed bottom-0 end-0 p-3">
          <div className={`toast show align-items-center text-bg-${toast.type} border-0`} data-testid="toast-notification">
            <div className="d-flex">
              <div className="toast-body">{toast.message}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
