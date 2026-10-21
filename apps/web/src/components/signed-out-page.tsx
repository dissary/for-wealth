import type { ReactNode } from 'react'
import { Tagline, Wordmark } from '@/components/brand'

// The frame every page for someone not signed in shares: the brand on one
// side, the form on the other.
export function SignedOutPage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-svh w-full max-w-5xl content-center gap-12 px-6 py-12 md:grid-cols-[1fr_24rem] md:gap-20">
      <header className="flex flex-col gap-4">
        <Wordmark />
        <Tagline className="max-w-[12ch] text-5xl leading-[0.95] md:text-7xl" />
      </header>
      {children}
    </main>
  )
}
