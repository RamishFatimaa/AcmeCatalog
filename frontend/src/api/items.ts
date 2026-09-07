import { apiRequest } from './client'
import { CATALOG_SERVICE_URL } from './config'
import type { Item, ItemInput } from '../types'

export interface GetItemsOptions {
  term?: string
  category?: string
  sort?: 'name' | 'price' | 'newest'
  minPrice?: number
  maxPrice?: number
}

export function getItems(options: GetItemsOptions = {}): Promise<Item[]> {
  const params = new URLSearchParams()
  if (options.term) params.set('term', options.term)
  if (options.category) params.set('category', options.category)
  if (options.sort) params.set('sort', options.sort)
  if (options.minPrice !== undefined) params.set('minPrice', String(options.minPrice))
  if (options.maxPrice !== undefined) params.set('maxPrice', String(options.maxPrice))
  const query = params.toString()
  return apiRequest<Item[]>(CATALOG_SERVICE_URL, `/items${query ? `?${query}` : ''}`)
}

export function getItem(id: number): Promise<Item> {
  return apiRequest<Item>(CATALOG_SERVICE_URL, `/items/${id}`)
}

export function getCategories(): Promise<string[]> {
  return apiRequest<string[]>(CATALOG_SERVICE_URL, '/items/categories')
}

export function createItem(item: ItemInput, token: string): Promise<Item> {
  return apiRequest<Item>(CATALOG_SERVICE_URL, '/items', { method: 'POST', body: item, token })
}

export function updateItem(id: number, item: ItemInput, token: string): Promise<void> {
  return apiRequest<void>(CATALOG_SERVICE_URL, `/items/${id}`, { method: 'PUT', body: { id, ...item }, token })
}

export function deleteItem(id: number, token: string): Promise<void> {
  return apiRequest<void>(CATALOG_SERVICE_URL, `/items/${id}`, { method: 'DELETE', token })
}

export function reorderItems(orderedIds: number[], token: string): Promise<void> {
  return apiRequest<void>(CATALOG_SERVICE_URL, '/items/reorder', { method: 'PUT', body: orderedIds, token })
}

export function uploadItemImage(id: number, file: File, token: string): Promise<Item> {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest<Item>(CATALOG_SERVICE_URL, `/items/${id}/image`, { method: 'POST', body: formData, token })
}

// Not fetched via apiRequest — the Export button links straight here so the
// browser handles the download natively (Content-Disposition: attachment).
export const ITEMS_EXPORT_URL = `${CATALOG_SERVICE_URL}/api/items/export`
