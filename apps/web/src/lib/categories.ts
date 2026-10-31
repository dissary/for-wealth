import type { CategoryKind } from '@for-wealth/shared'
import { type QueryClient, queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const KIND_LABELS: Record<CategoryKind, string> = { expense: 'Expense', income: 'Income' }

async function fetchCategories() {
  const res = await api.categories.$get()
  if (!res.ok) throw new Error(`Your Categories could not be loaded (${res.status})`)
  return res.json()
}

// The user's Categories that aren't archived, one list per kind, and the
// archived ones the same way, each in position order.
export const categoriesQuery = queryOptions({
  queryKey: ['categories'],
  queryFn: fetchCategories,
})

export type Category = Awaited<ReturnType<typeof fetchCategories>>['income'][number]

// A Category's name and place show in pickers, on Transactions and Recurring
// Transactions, in Edit Budgets and on the Dashboard, so after adding,
// renaming or moving one, everything loaded is stale. Only what's on screen
// loads again straight away.
export function refreshAfterCategoryChange(queryClient: QueryClient) {
  return queryClient.invalidateQueries()
}

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
