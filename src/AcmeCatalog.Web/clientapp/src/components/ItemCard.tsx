import type { Item } from '../types'
import { getBadgeClass } from '../categoryStyle'

interface ItemCardProps {
  item: Item
  isAuthenticated: boolean
  onQuickView: (item: Item) => void
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
  onDragStart: (item: Item) => void
  onDragOver: (item: Item, event: React.DragEvent) => void
  onDragEnd: () => void
}

export function ItemCard({
  item,
  isAuthenticated,
  onQuickView,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
}: ItemCardProps) {
  return (
    <div
      className="col-sm-6 col-lg-3 item-card-col"
      data-item-id={item.id}
      draggable="true"
      data-testid="item-card"
      onDragStart={() => onDragStart(item)}
      onDragOver={(e) => onDragOver(item, e)}
      onDragEnd={onDragEnd}
    >
      <div className="card h-100 shadow-sm">
        {isAuthenticated && (
          <div className="drag-handle" title="Drag to reorder" data-testid="drag-handle">
            ⠿
          </div>
        )}
        {item.imageUrl && (
          <img src={item.imageUrl} className="card-img-top" alt={item.name} loading="lazy" />
        )}
        <div className="card-body d-flex flex-column">
          <span className={`${getBadgeClass(item.category)} align-self-start mb-2`} data-testid="item-category">
            {item.category}
          </span>
          <h5 className="card-title" data-testid="item-name">{item.name}</h5>
          <p className="card-text fw-bold item-price" data-testid="item-price">
            {item.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
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
      </div>
    </div>
  )
}
