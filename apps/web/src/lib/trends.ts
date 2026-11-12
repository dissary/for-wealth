import type { CalendarMonth } from '@for-wealth/shared'
import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TRANSACTIONS_KEY } from '@/lib/transactions'

// Every query of Trends starts with this key. They're summed from the
// Transactions, so it starts with theirs, and adding, editing or deleting one
// refreshes Trends too. A Category's chart shows its Budget, so saving
// Budgets refreshes them as well.
export const TRENDS_KEY = [...TRANSACTIONS_KEY, 'trends'] as const

// Null when the Category isn't one of the user's (404).
async function fetchTrends(to: CalendarMonth, category: string | undefined) {
  const res = await api.trends.$get({ query: { to, ...(category ? { category } : {}) } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Trends could not be loaded (${res.status})`)
  return res.json()
}

// Each month's Income and Expenses for the year ending with `to`, or, with a
// Category, that Category's total and Budget limit each month.
export function trendsQuery(to: CalendarMonth, category?: string) {
  return queryOptions({
    queryKey: [...TRENDS_KEY, to, category ?? null],
    queryFn: () => fetchTrends(to, category),
    placeholderData: keepPreviousData,
  })
}

type TrendsAnswer = NonNullable<Awaited<ReturnType<typeof fetchTrends>>>

export type Trends = Exclude<TrendsAnswer, { category: unknown }>

export type TrendsMonth = Trends['months'][number]

export type CategoryTrends = Extract<TrendsAnswer, { category: unknown }>
