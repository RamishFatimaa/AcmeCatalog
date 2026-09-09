import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../api/client'

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      onSuccess?.()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(err.problem?.detail ?? 'Username or password is incorrect.')
      } else {
        setError('Something went wrong logging in. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate data-testid="login-form" className="auth-card">
      {error && <div className="alert alert-danger" data-testid="login-error-summary">{error}</div>}

      <div className="mb-3">
        <label className="form-label" htmlFor="login-username">Username</label>
        <input
          id="login-username"
          className="form-control"
          autoComplete="username"
          data-testid="login-username-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          className="form-control"
          autoComplete="current-password"
          data-testid="login-password-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button type="submit" className="btn btn-primary w-100" data-testid="login-submit-btn" disabled={submitting}>
        Log In
      </button>
    </form>
  )
}
