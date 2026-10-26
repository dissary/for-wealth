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

// Links along the header's bottom edge. The router marks the current page's
// link aria-current, and it is underlined in the accent on the header's rule.
const NAV_LINK =
  'relative flex h-10 items-center rounded-md px-1 text-sm text-muted-foreground transition-colors outline-none after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:after:bg-primary sm:h-14'

function SignedInLayout() {
  const { me } = Route.useRouteContext()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card">
        {/* One row from sm up. On a phone the links take a second row, so the
            app name, both links and the user's name all fit. */}
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-8 px-4 sm:flex-nowrap sm:px-6">
          <Wordmark className="flex h-12 items-center font-heading text-lg font-semibold tracking-tight sm:h-14" />
          <nav aria-label="Main" className="order-last flex w-full items-center gap-5 sm:order-none sm:w-auto sm:flex-1">
            <Link
              to="/"
              className={NAV_LINK}
              // Active on any month of the Dashboard, but not on the pages under it.
              activeOptions={{ exact: true, includeSearch: false }}
            >
              Dashboard
            </Link>
            <Link
              to="/transactions"
              className={NAV_LINK}
              // Active on any Period or filter of the page, not only the bare path.
              activeOptions={{ includeSearch: false }}
            >
              Transactions
            </Link>
          </nav>
          <UserMenu me={me} />
        </div>
      </header>
      {/* Wider than a reading column, so the Dashboard can set its totals
          beside Expenses by Category. */}
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
        <Outlet />
      </div>
    </div>
  )
}
