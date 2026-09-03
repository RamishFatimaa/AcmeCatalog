import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function Layout() {
  const { isAuthenticated, username, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <>
      <header>
        <nav className="navbar navbar-expand-lg navbar-dark app-navbar mb-4">
          <div className="container-fluid">
            <NavLink className="navbar-brand navbar-brand-mark" to="/">
              <span className="brand-dot"></span> AcmeCatalog
            </NavLink>
            <div className="navbar-collapse collapse d-lg-inline-flex justify-content-between show">
              <ul className="navbar-nav flex-grow-1">
                <li className="nav-item">
                  <NavLink className="nav-link" to="/">Home</NavLink>
                </li>
                <li className="nav-item">
                  <NavLink className="nav-link" to="/Items" id="nav-catalog">Catalog</NavLink>
                </li>
                {isAuthenticated && (
                  <li className="nav-item">
                    <NavLink className="nav-link" to="/Items/Create" data-testid="add-item-nav-link">Add Item</NavLink>
                  </li>
                )}
                <li className="nav-item">
                  <NavLink className="nav-link" to="/Home/Help">Help</NavLink>
                </li>
              </ul>
              <ul className="navbar-nav">
                {isAuthenticated ? (
                  <>
                    <li className="nav-item">
                      <NavLink className="nav-link" to="/Account/Profile" data-testid="account-nav-link">
                        Hi, {username}
                      </NavLink>
                    </li>
                    <li className="nav-item">
                      <button type="button" className="nav-link btn btn-link" data-testid="logout-btn" onClick={handleLogout}>
                        Log out
                      </button>
                    </li>
                  </>
                ) : (
                  <>
                    <li className="nav-item">
                      <NavLink className="nav-link" to="/Account/Login" data-testid="login-nav-link">Log in</NavLink>
                    </li>
                    <li className="nav-item">
                      <NavLink className="nav-link" to="/Account/Register" data-testid="register-nav-link">Sign up</NavLink>
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </nav>
      </header>

      <div className="container">
        <main role="main" className="pb-3">
          <Outlet />
        </main>
      </div>

      <footer className="app-footer">
        <div className="container d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span>&copy; 2026 AcmeCatalog &mdash; a catalog manager built for small teams.</span>
          <div className="d-flex gap-3">
            <NavLink to="/Home/Help">Help</NavLink>
            <a href="/swagger">API Docs</a>
          </div>
        </div>
      </footer>
    </>
  )
}
