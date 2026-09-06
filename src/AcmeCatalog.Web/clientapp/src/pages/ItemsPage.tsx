import { useNavigate } from 'react-router-dom'
import { CatalogGrid } from '../components/CatalogGrid'
import { ITEMS_EXPORT_URL } from '../api/items'
import type { Item } from '../types'

export function ItemsPage() {
  const navigate = useNavigate()

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <div className="section-eyebrow">The full catalog</div>
          <h1 className="mb-1">Browse &amp; manage items</h1>
          <p className="text-muted mb-0">Search, filter by category, or drag cards to reorder the whole collection.</p>
        </div>
        <a className="btn btn-outline-primary" data-testid="export-csv-btn" href={ITEMS_EXPORT_URL} download>
          Export CSV
        </a>
      </div>

      <CatalogGrid onEdit={(item: Item) => navigate(`/Items/Edit/${item.id}`)} />
    </div>
  )
}
