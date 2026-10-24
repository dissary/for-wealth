import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { Wordmark } from '@/components/brand'
import { UserMenu } from '@/components/user-menu'
import { meQuery } from '@/lib/me'

// Every page that needs a signed-in user lives under this layout (in
// routes/_signed-in/). Anyone else is sent to sign in, and back here after.
export const Route = createFileRoute('/_signed-in')({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.fetchQuery(meQuery)
    if (!me) {
      throw redirect({
        to: '/sign-in',
        search: location.href === '/' ? {} : { redirect: location.href },
      })
    }
    return { me }
  },
  component: SignedInLayout,
})

function SignedInLayout() {
  const { me } = Route.useRouteContext()

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between gap-4 border-b py-3">
        <div className="flex items-center gap-6">
          <Wordmark />
          <nav aria-label="Main">
            <Link
              to="/transactions"
              className="rounded-md text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              activeProps={{ className: 'font-medium text-foreground', 'aria-current': 'page' }}
              // Active on any Period or filter of the page, not only the bare path.
              activeOptions={{ includeSearch: false }}
            >
              Transactions
            </Link>
          </nav>
        </div>
        <UserMenu me={me} />
      </header>
      <Outlet />
    </div>
  )
}
