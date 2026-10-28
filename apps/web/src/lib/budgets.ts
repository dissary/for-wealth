import type { CalendarMonth } from '@for-wealth/shared'
import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Every query of Budgets starts with this key, so saving refreshes them all:
// a change reaches later months too.
export const BUDGETS_KEY = ['budgets'] as const

async function fetchMonth(month: CalendarMonth) {
  const res = await api.budgets.$get({ query: { month } })
  if (!res.ok) throw new Error(`Your Budgets could not be loaded (${res.status})`)
  return res.json()
}

// Every Expense Category that isn't archived, in position order, with the
// month's limit, set that month or carried forward, or null for no limit.
export function budgetsQuery(month: CalendarMonth) {
  return queryOptions({
    queryKey: [...BUDGETS_KEY, month],
    queryFn: () => fetchMonth(month),
  })
}

export type Budget = Awaited<ReturnType<typeof fetchMonth>>[number]
