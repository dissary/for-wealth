import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDownIcon, LogOutIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { authClient } from '@/lib/auth-client'
import { currencyLabel } from '@/lib/currency'
import type { Me } from '@/lib/me'

// The user's name in the header, opening their details and Sign out.
export function UserMenu({ me }: { me: Me }) {
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="max-w-48">
            <span className="truncate">{me.name}</span>
            <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel asChild>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-normal">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate">{me.email}</dd>
              <dt className="text-muted-foreground">Currency</dt>
              <dd>{currencyLabel(me.currency)}</dd>
              <dt className="text-muted-foreground">Time zone</dt>
              <dd>{me.timeZone}</dd>
            </dl>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={signOut} disabled={state === 'signing-out'}>
            <LogOutIcon aria-hidden="true" />
            {state === 'signing-out' ? 'Signing out…' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
