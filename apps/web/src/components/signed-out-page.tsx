import type { ReactNode } from 'react'
import { Tagline, Wordmark } from '@/components/brand'
import { MonthDays } from '@/components/month-days'
import { PANEL } from '@/components/panel'
import { cn } from '@/lib/utils'

// The frame every page for someone not signed in shares: the brand on one
// side, the form on a panel on the other.
export function SignedOutPage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-svh w-full max-w-5xl content-center items-center gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1fr_26rem] md:gap-16">
      <header className="flex flex-col gap-6">
        <Wordmark />
        <Tagline className="max-w-[14ch] text-4xl leading-[1.05] sm:text-5xl md:text-6xl" />
        {/* The tagline's month, a third of the way through. */}
        <MonthDays days={30} today={10} className="max-w-sm text-primary" />
      </header>
      <div className={cn(PANEL, 'sm:p-8')}>{children}</div>
    </main>
  )
}
