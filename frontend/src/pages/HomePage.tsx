import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getItems, getCategories } from '../api/items'

interface Stats {
  itemCount: number
  categoryCount: number
  latestItemName: string | null
}

export function HomePage() {
  const { isAuthenticated } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    Promise.all([getItems(), getCategories()]).then(([items, categories]) => {
      const latest = [...items].sort(
        (a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime(),
      )[0]
      setStats({
        itemCount: items.length,
        categoryCount: categories.length,
        latestItemName: latest?.name ?? null,
      })
    })
  }, [])

  return (
    <>
      <section className="hero" data-testid="hero-section">
        <div className="hero-eyebrow">Catalog management, done right</div>
        <h1>Keep your catalog organized, searchable, and always up to date.</h1>
        <p className="lead mb-4">
          AcmeCatalog gives small teams a fast, no-fuss way to manage product inventory &mdash;
          add items, organize by category, reorder with a drag, and find anything in seconds.
        </p>
        <div className="d-flex flex-wrap gap-2">
          <Link className="btn btn-accent btn-lg" to="/Items" id="browse-catalog-btn">Browse Catalog</Link>
          {isAuthenticated ? (
            <Link className="btn btn-outline-light btn-lg" to="/Items/Create">+ Add an Item</Link>
          ) : (
            <Link className="btn btn-outline-light btn-lg" to="/Account/Register">Create a free account</Link>
          )}
        </div>
      </section>

      <div className="stat-strip mb-5 px-2">
        <div className="stat-card" data-testid="stat-item-count">
          <div className="stat-value">{stats?.itemCount ?? '—'}</div>
          <div className="stat-label">Items cataloged</div>
        </div>
        <div className="stat-card" data-testid="stat-category-count">
          <div className="stat-value">{stats?.categoryCount ?? '—'}</div>
          <div className="stat-label">Categories</div>
        </div>
        <div className="stat-card" data-testid="stat-latest-item">
          <div className="stat-value fs-5">{stats?.latestItemName ?? '—'}</div>
          <div className="stat-label">Most recently added</div>
        </div>
        <div className="stat-card">
          <div className="stat-value fs-5">MVC + REST</div>
          <div className="stat-label">Same data, two ways in</div>
        </div>
      </div>

      <section className="mb-5">
        <div className="text-center mb-4">
          <div className="section-eyebrow">How it works</div>
          <h2>From browsing to organizing in three steps</h2>
        </div>
        <div className="row g-4">
          <div className="col-md-4">
            <div className="step-card">
              <div className="step-number">1</div>
              <h5>Browse &amp; search</h5>
              <p className="text-muted mb-0">Filter by category or search as you type &mdash; results update instantly, no page reloads.</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="step-card">
              <div className="step-number">2</div>
              <h5>Quick view or dig in</h5>
              <p className="text-muted mb-0">Preview an item in a modal, or open the full details page with specs and description tabs.</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="step-card">
              <div className="step-number">3</div>
              <h5>Organize your way</h5>
              <p className="text-muted mb-0">Signed-in users can add, edit, delete, and drag-and-drop reorder the whole catalog.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-5">
        <div className="text-center mb-4">
          <div className="section-eyebrow">Why teams use it</div>
          <h2>Built to stay out of your way</h2>
        </div>
        <div className="row g-4">
          <div className="col-md-4">
            <div className="value-card h-100">
              <div className="value-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </div>
              <h5 className="card-title">Find anything fast</h5>
              <p className="card-text text-muted">Live search and category filters mean you never scroll through a long list to find one item.</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="value-card h-100">
              <div className="value-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7h13l-3-3M21 17H8l3 3"></path></svg>
              </div>
              <h5 className="card-title">Organize your way</h5>
              <p className="card-text text-muted">Drag cards to reorder your catalog exactly how you want it &mdash; changes save instantly.</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="value-card h-100">
              <div className="value-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              </div>
              <h5 className="card-title">Built for teams</h5>
              <p className="card-text text-muted">Browsing stays open to everyone; adding, editing, and deleting requires a signed-in account.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
