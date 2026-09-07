import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../api/client'

export function RegisterForm({ onSuccess }: { onSuccess?: () => void }) {
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register(username, email, password, confirmPassword)
      onSuccess?.()
    } catch (err) {
      if (err instanceof ApiError) {
        const firstFieldError = err.problem?.errors ? Object.values(err.problem.errors)[0]?.[0] : undefined
        setError(firstFieldError ?? err.problem?.detail ?? 'Could not create the account.')
      } else {
        setError('Something went wrong creating the account.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate data-testid="register-form" className="auth-card">
      {error && <div className="alert alert-danger" data-testid="register-error-summary">{error}</div>}

      <div className="mb-3">
        <label className="form-label" htmlFor="register-username">Username</label>
        <input
          id="register-username"
          className="form-control"
          autoComplete="username"
          data-testid="register-username-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="register-email">Email</label>
        <input
          id="register-email"
          type="email"
          className="form-control"
          autoComplete="email"
          data-testid="register-email-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="register-password">Password</label>
        <input
          id="register-password"
          type="password"
          className="form-control"
          autoComplete="new-password"
          data-testid="register-password-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="register-confirm-password">Confirm Password</label>
        <input
          id="register-confirm-password"
          type="password"
          className="form-control"
          autoComplete="new-password"
          data-testid="register-confirm-password-input"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      <button type="submit" className="btn btn-primary w-100" data-testid="register-submit-btn" disabled={submitting}>
        Create Account
      </button>
    </form>
  )
}
