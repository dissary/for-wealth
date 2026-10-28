import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TRANSACTIONS_KEY } from '@/lib/transactions'

async function fetchRecurring() {
  const res = await api.recurring.$get()
  if (!res.ok) throw new Error(`Your Recurring Transactions could not be loaded (${res.status})`)
  return res.json()
}

// Loading them creates any Transactions now due (ADR 0008), and saving one
// changes the Dashboard's Upcoming, so the key sits under the Transactions':
// one invalidation refreshes both ways.
export const recurringQuery = queryOptions({
  queryKey: [...TRANSACTIONS_KEY, 'recurring'],
  queryFn: fetchRecurring,
})

export type RecurringTransaction = Awaited<ReturnType<typeof fetchRecurring>>['active'][number]
