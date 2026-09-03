import { useNavigate } from 'react-router-dom'
import { RegisterForm } from '../components/RegisterForm'

export function RegisterPage() {
  const navigate = useNavigate()

  return (
    <div className="row justify-content-center">
      <div className="col-md-6 col-lg-4">
        <RegisterForm onSuccess={() => navigate('/Items')} />
      </div>
    </div>
  )
}
