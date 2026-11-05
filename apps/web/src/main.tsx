import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LoadFailedPage } from '@/components/whole-page-message'
import { whenSessionEnds } from '@/lib/api'
import './index.css'
import { routeTree } from './routeTree.gen.ts'

const queryClient = new QueryClient({
  // Without a connection, a load fails (after its retries) and the page says
  // so with Try again, rather than waiting on "Loading…" for the connection
  // to come back.
  defaultOptions: { queries: { networkMode: 'always' } },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  // When a page can't even start, such as when who is signed in can't be
  // loaded. A page's own data says so under its header instead.
  defaultErrorComponent: LoadFailedPage,
})

// A session that has ended (signed out elsewhere, or expired). Loading the
// page again asks who is signed in, and the signed-in layout sends the user to
// sign in, and back to this page after.
whenSessionEnds(() => void router.invalidate())

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
