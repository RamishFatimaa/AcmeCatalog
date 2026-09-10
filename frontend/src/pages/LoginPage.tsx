import { useLocation, useNavigate, type Location } from 'react-router-dom'
import { LoginForm } from '../components/LoginForm'

interface LoginLocationState {
  from?: Location
}

export function LoginPage() {
  const navigate = useNavigate()
  // RequireAuth attaches where an anonymous visitor was actually headed
  // before redirecting here; return them there instead of always landing
  // on /Items. Was previously set by RequireAuth and never read anywhere —
  // half a feature, not a finished one.
  const location = useLocation()
  const from = (location.state as LoginLocationState | null)?.from

  return (
    <div className="row justify-content-center">
      <div className="col-md-6 col-lg-4">
        <LoginForm onSuccess={() => navigate(from ? `${from.pathname}${from.search}` : '/Items')} />
      </div>
    </div>
  )
}
