import { Link, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand'
import { PageTitle } from '@/components/page-title'
import { Button } from '@/components/ui/button'

// A page that is only a message, for when there's nothing else to show: no
// header, as there may be no one signed in.
function WholePageMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-6 px-6 py-12">
      <PageTitle>{title}</PageTitle>
      <Wordmark />
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      {children}
    </main>
  )
}

// An address that matches no page.
export function NotFoundPage() {
  return (
    <WholePageMessage title="Page not found">
      <p className="max-w-prose text-muted-foreground">
        There's no page at this address. The link may be mistyped or out of date.
      </p>
      <Button size="lg" className="w-fit" asChild>
        <Link to="/">Go to the Dashboard</Link>
      </Button>
    </WholePageMessage>
  )
}

// What a page couldn't load before it could show anything, such as who is
// signed in. A page's own data says so on the page instead, under its header.
export function LoadFailedPage() {
  const router = useRouter()
  return (
    <WholePageMessage title="Couldn't load this page">
      <p role="alert" className="max-w-prose text-muted-foreground">
        This page couldn't be loaded. Check your connection, then try again. If you're online, For Wealth may
        be having trouble for a moment.
      </p>
      {/* Runs the page's loading again, which also clears this error. */}
      <Button size="lg" className="w-fit" onClick={() => void router.invalidate()}>
        Try again
      </Button>
    </WholePageMessage>
  )
}
