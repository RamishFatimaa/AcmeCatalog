import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { login as loginRequest, register as registerRequest } from '../api/auth'
import type { LoginResponse } from '../types'

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
  register: (username: string, email: string, password: string, confirmPassword: string) => Promise<void>
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

  function persist(response: LoginResponse) {
    const stored: StoredAuth = {
      token: response.token,
      username: response.username,
      expiresAtUtc: response.expiresAtUtc,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    setAuth(stored)
  }

  const login = useCallback(async (username: string, password: string) => {
    persist(await loginRequest(username, password))
  }, [])

  const register = useCallback(
    async (username: string, email: string, password: string, confirmPassword: string) => {
      // JWT auth is stateless, so a successful registration returns a token
      // directly — the same "sign in immediately after creating the
      // account" behavior the old cookie-based flow had, just without a
      // separate sign-in round trip.
      persist(await registerRequest(username, email, password, confirmPassword))
    },
    [],
  )

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
        register,
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
