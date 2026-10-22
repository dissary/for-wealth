import type { CalendarDate } from '@for-wealth/shared'
import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Every query of Transactions starts with this key, so one invalidation
// refreshes whatever is showing after a change.
export const TRANSACTIONS_KEY = ['transactions'] as const

async function fetchDay(date: CalendarDate) {
  const res = await api.transactions.$get({ query: { period: 'day', date } })
  if (!res.ok) throw new Error(`The day's Transactions could not be loaded (${res.status})`)
  return res.json()
}

// One day's Transactions, most recently added first, and its totals.
export function dayQuery(date: CalendarDate) {
  return queryOptions({ queryKey: [...TRANSACTIONS_KEY, 'day', date], queryFn: () => fetchDay(date) })
}

export type Day = Awaited<ReturnType<typeof fetchDay>>
