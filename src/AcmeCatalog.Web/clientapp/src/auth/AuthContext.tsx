import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { login as loginRequest } from '../api/auth'

const STORAGE_KEY = 'acmecatalog.auth'

interface StoredAuth {
  token: string
  username: string
  expiresAtUtc: string
}

interface AuthContextValue {
  token: string | null
  username: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredAuth(): StoredAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as StoredAuth
    if (new Date(parsed.expiresAtUtc) <= new Date()) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth())

  const login = useCallback(async (username: string, password: string) => {
    const response = await loginRequest(username, password)
    const stored: StoredAuth = {
      token: response.token,
      username: response.username,
      expiresAtUtc: response.expiresAtUtc,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    setAuth(stored)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setAuth(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        token: auth?.token ?? null,
        username: auth?.username ?? null,
        isAuthenticated: auth !== null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
