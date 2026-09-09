import { useState } from 'react'
import type { Item } from '../types'
import { getBadgeClass } from '../categoryStyle'

interface ItemCardProps {
  item: Item
  layout: 'grid' | 'list'
  isAuthenticated: boolean
  selected: boolean
  onToggleSelect: (item: Item, checked: boolean) => void
  onViewDetail: (item: Item) => void
  onQuickView: (item: Item) => void
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
  onDragStart: (item: Item) => void
  onDragOver: (item: Item, event: React.DragEvent) => void
  onDragEnd: () => void
}

export function ItemCard({
  item,
  layout,
  isAuthenticated,
  selected,
  onToggleSelect,
  onViewDetail,
  onQuickView,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
}: ItemCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setContextMenuOpen(true)
  }

  function runContextAction(action: () => void) {
    setContextMenuOpen(false)
    action()
  }

  return (
    <div
      className={layout === 'grid' ? 'col-sm-6 col-lg-3 item-card-col' : 'w-100 item-card-col'}
      data-item-id={item.id}
      draggable="true"
      data-testid="item-card"
      onDragStart={() => onDragStart(item)}
      onDragOver={(e) => onDragOver(item, e)}
      onDragEnd={onDragEnd}
      onContextMenu={handleContextMenu}
    >
      <div className={`card h-100 shadow-sm position-relative ${layout === 'list' ? 'flex-row' : ''}`}>
        {isAuthenticated && (
          <div className="drag-handle" title="Drag to reorder" data-testid="drag-handle">
            ⠿
          </div>
        )}
        {isAuthenticated && (
          <div className="form-check select-item-check">
            <input
              type="checkbox"
              className="form-check-input"
              aria-label={`Select ${item.name}`}
              data-testid="select-item-checkbox"
              checked={selected}
              onChange={(e) => onToggleSelect(item, e.target.checked)}
            />
          </div>
        )}
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            className="card-img-top"
            alt={item.name}
            loading="lazy"
            onDoubleClick={() => onQuickView(item)}
          />
        )}
        <div className="card-body d-flex flex-column">
          <span className={`${getBadgeClass(item.category)} align-self-start mb-2`} data-testid="item-category">
            {item.category}
          </span>
          <h5 className="card-title" data-testid="item-name">
            <button
              type="button"
              className="btn btn-link text-reset text-decoration-none p-0 text-start fw-bold fs-5"
              data-testid="item-detail-link"
              onClick={() => onViewDetail(item)}
            >
              {item.name}
            </button>
          </h5>
          <p
            className="card-text fw-bold item-price position-relative d-inline-block"
            data-testid="item-price"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {item.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            {showTooltip && item.price >= 50 && (
              <span className="price-tooltip" data-testid="price-tooltip" role="tooltip">
                Free shipping on this item
              </span>
            )}
          </p>
          <p className="card-text text-muted small mb-2" data-testid="item-created-by">
            Added by {item.createdByDisplayName}
          </p>
          <div className="mt-auto d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              data-item-id={item.id}
              data-testid="quick-view-btn"
              onClick={() => onQuickView(item)}
            >
              Quick View
            </button>
            {isAuthenticated && (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  data-testid="edit-link"
                  onClick={() => onEdit(item)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  data-item-id={item.id}
                  data-item-name={item.name}
                  data-testid="delete-btn"
                  onClick={() => onDelete(item)}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        {contextMenuOpen && (
          <div className="context-menu" data-testid="context-menu">
            <button type="button" className="dropdown-item" data-testid="context-quick-view" onClick={() => runContextAction(() => onQuickView(item))}>
              Quick View
            </button>
            {isAuthenticated && (
              <>
                <button type="button" className="dropdown-item" data-testid="context-edit" onClick={() => runContextAction(() => onEdit(item))}>
                  Edit
                </button>
                <button type="button" className="dropdown-item text-danger" data-testid="context-delete" onClick={() => runContextAction(() => onDelete(item))}>
                  Delete
                </button>
              </>
            )}
            <button type="button" className="dropdown-item text-muted" data-testid="context-close" onClick={() => setContextMenuOpen(false)}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
