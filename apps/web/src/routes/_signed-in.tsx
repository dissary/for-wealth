import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Wordmark } from '@/components/brand'
import { HeaderNav, TabBar } from '@/components/main-nav'
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
    <div className="flex min-h-svh flex-col">
      {/* From sm up, one row: the app name, the pages and the user's name. A
          phone keeps a slim bar with the app name and the user's name, and
          moves the pages to a tab bar at the foot of the screen. */}
      <header className="border-b bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-x-4 px-4 sm:gap-x-8 sm:px-6">
          <Wordmark className="flex h-12 items-center font-heading text-lg font-semibold tracking-tight sm:h-14" />
          <HeaderNav className="hidden flex-1 sm:flex" />
          <UserMenu me={me} />
        </div>
      </header>
      {/* Wider than a reading column, so the Dashboard can set its totals
          beside Expenses by Category. On a phone the foot of the page clears
          the tab bar and the floating Add button over it. */}
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-0">
        <Outlet />
      </div>
      <TabBar className="sm:hidden" />
    </div>
  )
}
