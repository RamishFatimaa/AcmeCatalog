import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import type { Item } from '../types'
import { getItems, getCategories, deleteItem, reorderItems } from '../api/items'
import { useAuth } from '../auth/AuthContext'
import { ItemCard } from './ItemCard'
import { QuickViewModal } from './QuickViewModal'

const PAGE_SIZE = 4

interface CatalogGridProps {
  onEdit: (item: Item) => void
}

export function CatalogGrid({ onEdit }: CatalogGridProps) {
  const { isAuthenticated, token } = useAuth()

  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [term, setTerm] = useState('')
  const [category, setCategory] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [quickViewItem, setQuickViewItem] = useState<Item | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' } | null>(null)

  const draggingRef = useRef<Item | null>(null)

  const loadItems = useCallback(() => {
    getItems(term || undefined, category || undefined).then(setItems)
  }, [term, category])

  useEffect(() => {
    getCategories().then(setCategories)
  }, [])

  useEffect(() => {
    const handle = setTimeout(loadItems, term ? 300 : 0)
    return () => clearTimeout(handle)
  }, [loadItems])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [term, category])

  useEffect(() => {
    if (!toast) return
    const handle = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(handle)
  }, [toast])

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount])
  const hasFilter = term.length > 0 || category.length > 0
  const hasMore = visibleCount < items.length

  function handleDelete(item: Item) {
    if (!token) return
    if (!window.confirm(`Delete "${item.name}"? This can't be undone.`)) return

    deleteItem(item.id, token)
      .then(() => {
        setToast({ message: `"${item.name}" was deleted.`, type: 'danger' })
        loadItems()
      })
      .catch(() => setToast({ message: 'Could not delete the item.', type: 'danger' }))
  }

  function handleDragStart(item: Item) {
    draggingRef.current = item
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

    const orderedIds = items.map((i) => i.id)
    reorderItems(orderedIds, token)
      .then(() => setToast({ message: 'Catalog order updated.', type: 'success' }))
      .catch(() => setToast({ message: 'Could not save the new order.', type: 'danger' }))
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
            data-testid="category-filter"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="col-md-2">
          <button
            type="button"
            className="btn btn-outline-secondary w-100"
            data-testid="clear-filters-btn"
            onClick={() => { setTerm(''); setCategory('') }}
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="text-muted small mb-3" aria-live="polite" data-testid="filter-status">
        {hasFilter ? `${items.length} item(s) found` : ''}
      </div>

      {items.length === 0 ? (
        <div className="alert alert-info" data-testid="no-results">No items match your filters.</div>
      ) : (
        <div className="row g-4" data-testid="items-container">
          {visibleItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              isAuthenticated={isAuthenticated}
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
