import type { CalendarMonth } from '@for-wealth/shared'
import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TRANSACTIONS_KEY } from '@/lib/transactions'

async function fetchTrends(to: CalendarMonth) {
  const res = await api.trends.$get({ query: { to } })
  if (!res.ok) throw new Error(`Trends could not be loaded (${res.status})`)
  return res.json()
}

// Each month's Income and Expenses, for the year ending with `to`. They're
// summed from the Transactions, so the key starts with theirs, and adding,
// editing or deleting one refreshes Trends too.
export function trendsQuery(to: CalendarMonth) {
  return queryOptions({
    queryKey: [...TRANSACTIONS_KEY, 'trends', to],
    queryFn: () => fetchTrends(to),
    placeholderData: keepPreviousData,
  })
}

export type Trends = Awaited<ReturnType<typeof fetchTrends>>

export type TrendsMonth = Trends['months'][number]
