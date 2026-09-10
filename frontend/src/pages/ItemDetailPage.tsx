import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getItem } from '../api/items'
import { getBadgeClass } from '../categoryStyle'
import { StarRatingWidget } from '../components/StarRatingWidget'
import type { Item } from '../types'

type Tab = 'description' | 'specs'

function ratingKey(id: string) {
  return `acmecatalog.rating.${id}`
}

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [item, setItem] = useState<Item | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<Tab>('description')
  // Client-only, localStorage-backed — this widget exists to give a real
  // Shadow DOM element something to do, not to be a full rating system with
  // its own backend model.
  const [rating, setRating] = useState(() => (id ? Number(localStorage.getItem(ratingKey(id))) || 0 : 0))

  useEffect(() => {
    if (!id) return
    getItem(Number(id))
      .then(setItem)
      .catch(() => setError(true))
  }, [id])

  function handleRatingChange(value: number) {
    setRating(value)
    if (id) localStorage.setItem(ratingKey(id), String(value))
  }

  if (error) {
    return (
      <div className="alert alert-danger" data-testid="item-detail-error">
        Could not load this item.{' '}
        <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => navigate('/Items')}>
          Back to catalog
        </button>
      </div>
    )
  }

  if (!item) return null

  return (
    <div data-testid="item-detail-page">
      <button type="button" className="btn btn-link ps-0 mb-3" onClick={() => navigate('/Items')}>
        &larr; Back to catalog
      </button>

      <div className="row g-4">
        <div className="col-md-5">
          {item.imageUrl && <img src={item.imageUrl} className="w-100 rounded-4 border" alt={item.name} />}
        </div>
        <div className="col-md-7">
          <span className={`${getBadgeClass(item.category)} mb-2`}>{item.category}</span>
          <h1 data-testid="detail-name">{item.name}</h1>
          <p className="fs-4 fw-bold item-price" data-testid="detail-price">
            {item.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>

          <div className="mb-4">
            <div className="small text-muted mb-1">Rate this item</div>
            <StarRatingWidget rating={rating} onChange={handleRatingChange} />
          </div>

          <ul className="nav nav-tabs">
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link ${tab === 'description' ? 'active' : ''}`}
                data-testid="tab-description"
                aria-selected={tab === 'description'}
                onClick={() => setTab('description')}
              >
                Description
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link ${tab === 'specs' ? 'active' : ''}`}
                data-testid="tab-specs"
                aria-selected={tab === 'specs'}
                onClick={() => setTab('specs')}
              >
                Specs
              </button>
            </li>
          </ul>
          <div className="border border-top-0 rounded-bottom-4 p-3" data-testid="tab-panel">
            {tab === 'description' ? (
              <p className="mb-0" data-testid="detail-description">{item.description}</p>
            ) : (
              <dl className="row mb-0" data-testid="detail-specs">
                <dt className="col-4">Category</dt>
                <dd className="col-8">{item.category}</dd>
                <dt className="col-4">Added</dt>
                <dd className="col-8">{new Date(item.dateAdded).toLocaleDateString()}</dd>
                <dt className="col-4">Item ID</dt>
                <dd className="col-8">#{item.id}</dd>
              </dl>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
