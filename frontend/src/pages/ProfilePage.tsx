import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getMe } from '../api/auth'
import type { UserResponse } from '../types'

export function ProfilePage() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [user, setUser] = useState<UserResponse | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!token) return
    getMe(token)
      .then(setUser)
      .catch(() => setError(true))
  }, [token])

  function handleLogout() {
    logout()
    navigate('/')
  }

  if (!token) {
    navigate('/Account/Login')
    return null
  }

  return (
    <div className="row justify-content-center">
      <div className="col-md-6 col-lg-4">
        <div className="auth-card" data-testid="profile-card">
          <h1 className="mb-4">Your Profile</h1>
          {error && <div className="alert alert-danger" data-testid="profile-error">Could not load your profile.</div>}
          <dl className="row">
            <dt className="col-4">Username</dt>
            <dd className="col-8" data-testid="profile-username">{user?.username ?? '...'}</dd>
            <dt className="col-4">Email</dt>
            <dd className="col-8" data-testid="profile-email">{user?.email ?? '...'}</dd>
          </dl>
          <button type="button" className="btn btn-primary w-100" data-testid="profile-logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
