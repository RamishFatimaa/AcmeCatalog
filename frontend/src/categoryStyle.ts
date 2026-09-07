// Mirrors AcmeCatalog.Web.Helpers.CategoryStyleHelper exactly, so React-rendered
// cards pick up the same site.css category-badge colors as the rest of the app.

const BADGE_CLASSES: Record<string, string> = {
  Electronics: 'cat-badge cat-electronics',
  'Home & Kitchen': 'cat-badge cat-home',
  'Sporting Goods': 'cat-badge cat-sporting',
  Books: 'cat-badge cat-books',
  'Toys & Games': 'cat-badge cat-toys',
}

export function getBadgeClass(category: string): string {
  return BADGE_CLASSES[category] ?? 'cat-badge'
}
