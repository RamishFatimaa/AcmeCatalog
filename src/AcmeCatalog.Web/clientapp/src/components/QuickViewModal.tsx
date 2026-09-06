import { useEffect } from 'react'
import type { Item } from '../types'
import { getBadgeClass } from '../categoryStyle'

interface QuickViewModalProps {
  item: Item | null
  onClose: () => void
}

// Renders the modal chrome with plain conditional classes rather than
// Bootstrap's imperative JS Modal API — keeps this fully React-controlled
// (no DOM manipulation racing React's own renders) while reusing the same
// Bootstrap CSS classes the rest of the app's styling already relies on.
export function QuickViewModal({ item, onClose }: QuickViewModalProps) {
  const isOpen = item !== null

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  return (
    <div
      className={`modal fade ${isOpen ? 'show d-block' : ''}`}
      tabIndex={-1}
      aria-hidden={!isOpen}
      data-testid="quick-view-modal"
      // The dim backdrop is painted here, on the wrapper itself, rather than
      // as a separate .modal-backdrop element — nesting that inside the same
      // stacking context as .modal-dialog (as Bootstrap normally avoids by
      // appending it straight to <body>) made it paint OVER the dialog and
      // swallow clicks meant for the close button, since it had no explicit
      // z-index ordering against a sibling that also lacked one.
      style={isOpen ? { backgroundColor: 'rgba(0,0,0,0.5)' } : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Quick View</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
          </div>
          <div className="modal-body" data-testid="quick-view-body">
            {item && (
              <div className="row g-3">
                <div className="col-5">
                  <iframe
                    title={`${item.name} preview`}
                    src={`/Items/ImagePreview/${item.id}`}
                    className="w-100 border rounded"
                    style={{ aspectRatio: '1 / 1' }}
                    data-testid="quick-view-image-frame"
                  />
                </div>
                <div className="col-7">
                  <span className={`${getBadgeClass(item.category)} mb-2`} data-testid="quick-view-category">
                    {item.category}
                  </span>
                  <h4 data-testid="quick-view-name">{item.name}</h4>
                  <p className="fs-5 fw-bold item-price" data-testid="quick-view-price">
                    {item.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </p>
                  <p data-testid="quick-view-description">{item.description}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
