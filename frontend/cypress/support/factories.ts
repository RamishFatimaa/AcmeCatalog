import type { ItemInput } from '../../src/types'

// Fixtures (cypress/fixtures/*.json) are for static, reused-verbatim
// payloads. This is for the opposite case: data that must be unique per
// test run so parallel/retried runs don't collide on the same name — a
// fixture can't generate that itself.
export function uniqueItem(overrides: Partial<ItemInput> = {}): ItemInput {
  return {
    name: `Test Item ${Date.now()}`,
    price: 9.99,
    category: 'Electronics',
    description: 'Created by a factory for test isolation.',
    imageUrl: null,
    ...overrides,
  }
}
