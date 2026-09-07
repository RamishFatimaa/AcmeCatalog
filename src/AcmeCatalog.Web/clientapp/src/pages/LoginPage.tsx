import { useNavigate } from 'react-router-dom'
import { LoginForm } from '../components/LoginForm'

export function LoginPage() {
  const navigate = useNavigate()

  return (
    <div className="row justify-content-center">
      <div className="col-md-6 col-lg-4">
        <LoginForm onSuccess={() => navigate('/Items')} />
      </div>
    </div>
  )
}
