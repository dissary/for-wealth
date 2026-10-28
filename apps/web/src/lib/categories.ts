import type { CategoryKind } from '@for-wealth/shared'
import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const KIND_LABELS: Record<CategoryKind, string> = { expense: 'Expense', income: 'Income' }

// The user's Categories that aren't archived, one list per kind, each in
// position order.
export const categoriesQuery = queryOptions({
  queryKey: ['categories'],
  queryFn: async () => {
    const res = await api.categories.$get()
    if (!res.ok) throw new Error(`Your Categories could not be loaded (${res.status})`)
    return res.json()
  },
})

// The Categories a picker of one kind offers. A Transaction or Recurring
// Transaction keeps an archived Category, which the lists leave out, so it's
// added while editing one of that kind, as "Food (archived)".
export function pickerOptions(
  listed: readonly { id: string; name: string }[],
  kept: { id: string; name: string; kind: CategoryKind } | undefined,
  kind: CategoryKind,
) {
  const archived =
    kept && kept.kind === kind && !listed.some((c) => c.id === kept.id)
      ? [{ id: kept.id, name: `${kept.name} (archived)` }]
      : []
  return [...archived, ...listed]
}
