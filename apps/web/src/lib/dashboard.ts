import type { CalendarMonth } from '@for-wealth/shared'
import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TRANSACTIONS_KEY } from '@/lib/transactions'

async function fetchMonth(month: CalendarMonth) {
  const res = await api.dashboard.$get({ query: { month } })
  if (!res.ok) throw new Error(`The Dashboard could not be loaded (${res.status})`)
  return res.json()
}

// Every month's Dashboard, under the Transactions it is summed from.
export const DASHBOARD_KEY = [...TRANSACTIONS_KEY, 'dashboard'] as const

// One month's Income and Expense totals and its Expenses by Category. They're
// summed from the Transactions, so the key starts with theirs, and adding,
// editing or deleting one refreshes the Dashboard too. Stepping to the next
// month keeps the last one on screen until the new one arrives.
export function dashboardQuery(month: CalendarMonth) {
  return queryOptions({
    queryKey: [...DASHBOARD_KEY, month],
    queryFn: () => fetchMonth(month),
    placeholderData: keepPreviousData,
  })
}

export type Dashboard = Awaited<ReturnType<typeof fetchMonth>>
