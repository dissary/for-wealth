import type { CalendarDate, Period } from '@for-wealth/shared'
import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Every query of Transactions starts with this key, so one invalidation
// refreshes whatever is showing after a change.
export const TRANSACTIONS_KEY = ['transactions'] as const

export interface View {
  period: Period
  date: CalendarDate
  category?: string | undefined
}

// Null when the filter's Category isn't one of the user's (404).
async function fetchPeriod({ period, date, category }: View) {
  const res = await api.transactions.$get({ query: { period, date, ...(category ? { category } : {}) } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`The Transactions could not be loaded (${res.status})`)
  return res.json()
}

// Every Transaction in one Period, newest first, and its totals. Stepping to
// the next Period keeps the last one on screen until the new one arrives.
export function periodQuery(view: View) {
  return queryOptions({
    queryKey: [...TRANSACTIONS_KEY, view.period, view.date, view.category ?? null],
    queryFn: () => fetchPeriod(view),
    placeholderData: keepPreviousData,
  })
}

export type Listing = NonNullable<Awaited<ReturnType<typeof fetchPeriod>>>
