// Mirrors AcmeCatalog.Core.Models.Item and the Web/Dtos login types exactly —
// keep this in sync with the C# side if either changes.

export interface Item {
  id: number
  name: string
  price: number
  description: string
  category: string
  imageUrl: string | null
  sortOrder: number
  dateAdded: string
}

export type ItemInput = Omit<Item, 'id' | 'sortOrder' | 'dateAdded'>

export interface LoginResponse {
  token: string
  expiresAtUtc: string
  username: string
}

export interface ProblemDetails {
  title?: string
  detail?: string
  status?: number
  errors?: Record<string, string[]>
}
