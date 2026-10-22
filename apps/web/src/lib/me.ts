import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

async function fetchMe() {
  const res = await api.me.$get()
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`Your details could not be loaded (${res.status})`)
  return res.json()
}

// The signed-in user's own details, or null when no one is signed in. Pages
// behind the _signed-in layout can rely on it being there.
export const meQuery = queryOptions({ queryKey: ['me'], queryFn: fetchMe })

export type Me = NonNullable<Awaited<ReturnType<typeof fetchMe>>>
