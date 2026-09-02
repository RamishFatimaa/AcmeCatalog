import { useState } from 'react'
import type { Item, ItemInput } from './types'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { CatalogGrid } from './components/CatalogGrid'
import { ItemForm } from './components/ItemForm'
import { LoginForm } from './components/LoginForm'
import { createItem, updateItem } from './api/items'

type View = { name: 'catalog' } | { name: 'login' } | { name: 'create' } | { name: 'edit'; item: Item }

function CatalogPage() {
  const { isAuthenticated, username, logout, token } = useAuth()
  const [view, setView] = useState<View>({ name: 'catalog' })
  const [refreshToken, setRefreshToken] = useState(0)

  async function handleFormSubmit(input: ItemInput) {
    if (!token) return
    if (view.name === 'edit') {
      await updateItem(view.item.id, input, token)
    } else {
      await createItem(input, token)
    }
    setRefreshToken((n) => n + 1)
    setView({ name: 'catalog' })
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>AcmeCatalog</h1>
        <div>
          {isAuthenticated ? (
            <>
              <span className="me-3 text-muted">Signed in as {username}</span>
              <button
                type="button"
                className="btn btn-outline-primary me-2"
                data-testid="add-item-btn"
                onClick={() => setView({ name: 'create' })}
              >
                + Add Item
              </button>
              <button type="button" className="btn btn-link" data-testid="logout-btn" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-outline-primary"
              data-testid="login-nav-link"
              onClick={() => setView({ name: 'login' })}
            >
              Log in
            </button>
          )}
        </div>
      </div>

      {view.name === 'catalog' && (
        <CatalogGrid
          refreshToken={refreshToken}
          onEdit={(item) => setView({ name: 'edit', item })}
        />
      )}

      {view.name === 'login' && (
        <LoginForm onSuccess={() => setView({ name: 'catalog' })} />
      )}

      {(view.name === 'create' || view.name === 'edit') && (
        <ItemForm
          initial={view.name === 'edit' ? view.item : undefined}
          onSubmit={handleFormSubmit}
          onCancel={() => setView({ name: 'catalog' })}
        />
      )}
    </div>
  )
}

export function App() {
  return (
    <AuthProvider>
      <CatalogPage />
    </AuthProvider>
  )
}
