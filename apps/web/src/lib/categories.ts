import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

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
