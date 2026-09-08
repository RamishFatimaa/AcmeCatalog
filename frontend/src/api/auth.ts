import { apiRequest } from './client'
import { IDENTITY_SERVICE_URL } from './config'
import type { LoginResponse, UserResponse } from '../types'

export function login(username: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(IDENTITY_SERVICE_URL, '/auth/login', { method: 'POST', body: { username, password } })
}

export function register(
  username: string,
  email: string,
  password: string,
  confirmPassword: string,
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(IDENTITY_SERVICE_URL, '/auth/register', {
    method: 'POST',
    body: { username, email, password, confirmPassword },
  })
}

export function getMe(token: string): Promise<UserResponse> {
  return apiRequest<UserResponse>(IDENTITY_SERVICE_URL, '/auth/me', { token })
}
