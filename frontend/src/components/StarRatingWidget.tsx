import { useEffect, useRef } from 'react'
import '../webcomponents/StarRatingElement'

interface StarRatingWidgetProps {
  rating: number
  onChange: (rating: number) => void
}

export function StarRatingWidget({ rating, onChange }: StarRatingWidgetProps) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function handleRatingChange(e: Event) {
      onChange((e as CustomEvent<{ rating: number }>).detail.rating)
    }

    el.addEventListener('rating-change', handleRatingChange)
    return () => el.removeEventListener('rating-change', handleRatingChange)
  }, [onChange])

  return <star-rating ref={ref} rating={rating} data-testid="star-rating" />
}
