import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ItemForm } from '../components/ItemForm'
import { createItem, updateItem, getItem } from '../api/items'
import { useAuth } from '../auth/AuthContext'
import type { Item, ItemInput } from '../types'

export function ItemFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = id !== undefined
  const { token } = useAuth()
  const navigate = useNavigate()
  const [initial, setInitial] = useState<Item | undefined>(undefined)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (!isEdit || !id) return
    getItem(Number(id)).then((item) => {
      setInitial(item)
      setLoading(false)
    })
  }, [isEdit, id])

  async function handleSubmit(input: ItemInput) {
    if (!token) return
    if (isEdit && id) {
      await updateItem(Number(id), input, token)
    } else {
      await createItem(input, token)
    }
    navigate('/Items')
  }

  if (loading) return null

  return (
    <ItemForm initial={initial} onSubmit={handleSubmit} onCancel={() => navigate('/Items')} />
  )
}
