import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ItemForm } from '../components/ItemForm'
import { createItem, updateItem, uploadItemImage, getItem } from '../api/items'
import { useAuth } from '../auth/AuthContext'
import type { Item, ItemInput } from '../types'

export function ItemFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = id !== undefined
  const { token } = useAuth()
  const navigate = useNavigate()
  const [initial, setInitial] = useState<Item | undefined>(undefined)
  const [loading, setLoading] = useState(isEdit)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!isEdit || !id) return
    getItem(Number(id))
      .then((item) => {
        setInitial(item)
        setLoading(false)
      })
      .catch(() => {
        setLoadError(true)
        setLoading(false)
      })
  }, [isEdit, id])

  async function handleSubmit(input: ItemInput, imageFile?: File | null) {
    if (!token) return
    if (isEdit && id) {
      await updateItem(Number(id), input, token)
      if (imageFile) {
        await uploadItemImage(Number(id), imageFile, token)
      }
    } else {
      await createItem(input, token)
    }
    navigate('/Items')
  }

  if (loading) return null

  if (loadError) {
    return (
      <div className="alert alert-danger" data-testid="item-form-load-error">
        Could not load this item to edit.{' '}
        <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => navigate('/Items')}>
          Back to catalog
        </button>
      </div>
    )
  }

  return (
    <ItemForm initial={initial} onSubmit={handleSubmit} onCancel={() => navigate('/Items')} />
  )
}
