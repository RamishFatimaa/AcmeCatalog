import { apiRequest } from './client'
import type { Item, ItemInput } from '../types'

export function getItems(term?: string, category?: string): Promise<Item[]> {
  const params = new URLSearchParams()
  if (term) params.set('term', term)
  if (category) params.set('category', category)
  const query = params.toString()
  return apiRequest<Item[]>(`/items${query ? `?${query}` : ''}`)
}

export function getItem(id: number): Promise<Item> {
  return apiRequest<Item>(`/items/${id}`)
}

export function getCategories(): Promise<string[]> {
  return apiRequest<string[]>('/items/categories')
}

export function createItem(item: ItemInput, token: string): Promise<Item> {
  return apiRequest<Item>('/items', { method: 'POST', body: item, token })
}

export function updateItem(id: number, item: ItemInput, token: string): Promise<void> {
  return apiRequest<void>(`/items/${id}`, { method: 'PUT', body: { id, ...item }, token })
}

export function deleteItem(id: number, token: string): Promise<void> {
  return apiRequest<void>(`/items/${id}`, { method: 'DELETE', token })
}

export function reorderItems(orderedIds: number[], token: string): Promise<void> {
  return apiRequest<void>('/items/reorder', { method: 'PUT', body: orderedIds, token })
}
