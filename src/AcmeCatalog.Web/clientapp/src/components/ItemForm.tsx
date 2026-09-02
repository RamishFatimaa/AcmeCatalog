import { useState, type FormEvent } from 'react'
import type { Item, ItemInput } from '../types'
import { ApiError } from '../api/client'

const CATEGORIES = ['Electronics', 'Home & Kitchen', 'Sporting Goods', 'Books', 'Toys & Games']

interface ItemFormProps {
  initial?: Item
  onSubmit: (item: ItemInput) => Promise<void>
  onCancel: () => void
}

interface FieldErrors {
  name?: string
  price?: string
  category?: string
  description?: string
}

export function ItemForm({ initial, onSubmit, onCancel }: ItemFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!name.trim()) next.name = 'Name is required.'
    const priceNumber = Number(price)
    if (!price || Number.isNaN(priceNumber) || priceNumber < 0.01) {
      next.price = 'Price must be a positive number.'
    }
    if (!category) next.category = 'Category is required.'
    if (!description.trim()) next.description = 'Description is required.'
    return next
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const validationErrors = validate()
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        price: Number(price),
        category,
        description: description.trim(),
        imageUrl: imageUrl.trim() || null,
      })
    } catch (err) {
      if (err instanceof ApiError && err.problem?.errors) {
        const serverErrors: FieldErrors = {}
        for (const [field, messages] of Object.entries(err.problem.errors)) {
          const key = field.charAt(0).toLowerCase() + field.slice(1)
          if (key in { name: 1, price: 1, category: 1, description: 1 }) {
            ;(serverErrors as Record<string, string>)[key] = messages[0]
          }
        }
        setErrors(serverErrors)
      } else {
        throw err
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-testid="item-form"
      className="bg-white border rounded-4 p-4 p-md-5 shadow-sm"
    >
      <div className="mb-3">
        <label className="form-label" htmlFor="item-name">Name</label>
        <input
          id="item-name"
          className="form-control"
          data-testid="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {errors.name && <span className="text-danger" data-testid="name-error">{errors.name}</span>}
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="item-price">Price</label>
        <input
          id="item-price"
          type="number"
          step="0.01"
          min="0.01"
          className="form-control"
          data-testid="price-input"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        {errors.price && <span className="text-danger" data-testid="price-error">{errors.price}</span>}
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="item-category">Category</label>
        <select
          id="item-category"
          className="form-select"
          data-testid="category-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Select a category...</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {errors.category && <span className="text-danger" data-testid="category-error">{errors.category}</span>}
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="item-description">Description</label>
        <textarea
          id="item-description"
          className="form-control"
          rows={4}
          data-testid="description-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {errors.description && <span className="text-danger" data-testid="description-error">{errors.description}</span>}
      </div>

      <div className="mb-4">
        <label className="form-label" htmlFor="item-image-url">Image URL</label>
        <input
          id="item-image-url"
          className="form-control"
          placeholder="https://..."
          data-testid="image-url-input"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
      </div>

      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary" data-testid="submit-btn" disabled={submitting}>
          {initial ? 'Save Changes' : 'Save Item'}
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
