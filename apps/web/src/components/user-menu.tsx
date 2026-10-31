import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronDownIcon, LogOutIcon, SettingsIcon } from 'lucide-react'
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
import type { Me } from '@/lib/me'

// The user's name in the header, opening who is signed in, Settings and
// Sign out.
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
          <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
            <span className="truncate font-medium">{me.name}</span>
            <span className="truncate text-muted-foreground">{me.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <SettingsIcon aria-hidden="true" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={signOut} disabled={state === 'signing-out'}>
            <LogOutIcon aria-hidden="true" />
            {state === 'signing-out' ? 'Signing out…' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
