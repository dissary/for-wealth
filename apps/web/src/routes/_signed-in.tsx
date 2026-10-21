import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
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
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between gap-4 border-b py-4">
        <Wordmark />
        <div className="flex items-center gap-4">
          <p className="text-sm">
            <span className="font-medium">{me.name}</span>
            <span className="text-muted-foreground"> · {me.currency}</span>
          </p>
          <SignOutButton />
        </div>
      </header>
      <Outlet />
    </div>
  )
}

function SignOutButton() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [state, setState] = useState<'idle' | 'signing-out' | 'failed'>('idle')

  async function signOut() {
    setState('signing-out')
    const { error } = await authClient.signOut()
    if (error) return setState('failed')
    // Nothing of this user's may stay in memory for whoever signs in next.
    queryClient.clear()
    await navigate({ to: '/sign-in' })
  }

  return (
    <div className="flex items-center gap-2">
      {state === 'failed' && (
        <p role="alert" className="text-sm">
          Couldn't sign out. Try again.
        </p>
      )}
      <Button variant="outline" size="sm" onClick={signOut} disabled={state === 'signing-out'}>
        {state === 'signing-out' ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  )
}
