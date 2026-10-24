import type { CalendarMonth } from '@for-wealth/shared'
import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TRANSACTIONS_KEY } from '@/lib/transactions'

async function fetchMonth(month: CalendarMonth) {
  const res = await api.dashboard.$get({ query: { month } })
  if (!res.ok) throw new Error(`The Dashboard could not be loaded (${res.status})`)
  return res.json()
}

// One month's Income and Expense totals and its Expenses by Category. They're
// summed from the Transactions, so the key starts with theirs, and adding,
// editing or deleting one refreshes the Dashboard too.
export function dashboardQuery(month: CalendarMonth) {
  return queryOptions({
    queryKey: [...TRANSACTIONS_KEY, 'dashboard', month],
    queryFn: () => fetchMonth(month),
  })
}

export type Dashboard = Awaited<ReturnType<typeof fetchMonth>>
