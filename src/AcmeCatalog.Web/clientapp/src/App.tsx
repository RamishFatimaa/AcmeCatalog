import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { HelpPage } from './pages/HelpPage'
import { ItemsPage } from './pages/ItemsPage'
import { ItemFormPage } from './pages/ItemFormPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ProfilePage } from './pages/ProfilePage'

// Mirrors the old [Authorize] MVC attribute: anonymous visitors get sent to
// the login page, remembering where they were headed via location state so
// LoginPage (or a future "return here after login" flow) could use it.
function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/Account/Login" state={{ from: location }} replace />
  }

  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="Items" element={<ItemsPage />} />
        <Route
          path="Items/Create"
          element={
            <RequireAuth>
              <ItemFormPage />
            </RequireAuth>
          }
        />
        <Route
          path="Items/Edit/:id"
          element={
            <RequireAuth>
              <ItemFormPage />
            </RequireAuth>
          }
        />
        <Route path="Account/Login" element={<LoginPage />} />
        <Route path="Account/Register" element={<RegisterPage />} />
        <Route
          path="Account/Profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route path="Home/Help" element={<HelpPage />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
