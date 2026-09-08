// Mirrors catalog-service's ItemResponse and identity-service's Dtos exactly —
// keep this in sync with the C# side if either changes. This hand-sync is
// itself a real weak point (nothing fails at build time if a backend field
// is renamed, only a runtime surprise) — generating this from each service's
// OpenAPI spec instead would close that gap, not done in this pass.

export interface Item {
  id: number
  name: string
  price: number
  description: string
  category: string
  imageUrl: string | null
  sortOrder: number
  dateAdded: string
  createdByDisplayName: string
}

export type ItemInput = Omit<Item, 'id' | 'sortOrder' | 'dateAdded' | 'createdByDisplayName'>

export interface LoginResponse {
  token: string
  expiresAtUtc: string
  username: string
}

export interface UserResponse {
  username: string
  email: string
}

export interface ProblemDetails {
  title?: string
  detail?: string
  status?: number
  errors?: Record<string, string[]>
}
