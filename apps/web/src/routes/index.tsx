import { currencyCodeSchema } from '@for-wealth/shared'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { Tagline, Wordmark } from '@/components/brand'
import { NewVerificationLinkForm } from '@/components/new-verification-link'
import { Button } from '@/components/ui/button'
import { type AuthErrorCode, authClient } from '@/lib/auth-client'
import { currencyLabel } from '@/lib/currency'

// Better Auth sends people here with ?error=… when a verification link
// doesn't work.
const searchSchema = z.object({ error: z.string().optional().catch(undefined) })

const LINK_ERRORS: Partial<Record<AuthErrorCode, string>> = {
  TOKEN_EXPIRED: 'That verification link has expired.',
}
const BROKEN_LINK = "That verification link doesn't work. Check you copied all of it."

export const Route = createFileRoute('/')({
  validateSearch: searchSchema,
  component: Home,
})

function Home() {
  const { error } = Route.useSearch()
  const session = authClient.useSession()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-8 px-6 py-12">
      <Wordmark />
      {error && !session.data && <BrokenLink error={error} />}
      {session.isPending ? (
        <p role="status">Checking whether you're signed in…</p>
      ) : session.data ? (
        <SignedIn user={session.data.user} />
      ) : (
        <SignedOut />
      )}
    </main>
  )
}

function BrokenLink({ error }: { error: string }) {
  return (
    <section aria-labelledby="broken-link-heading" className="flex flex-col gap-4 rounded-md bg-muted p-4">
      <h2 id="broken-link-heading" role="alert" className="font-sans text-sm font-medium">
        {LINK_ERRORS[error as AuthErrorCode] ?? BROKEN_LINK}
      </h2>
      <p className="text-sm">Enter the email you signed up with to get a new one.</p>
      <NewVerificationLinkForm />
    </section>
  )
}

function SignedIn({ user }: { user: typeof authClient.$Infer.Session.user }) {
  // The API only ever stores a listed currency, but the client types it as a
  // plain string.
  const currency = currencyCodeSchema.safeParse(user.currency)

  return (
    <section aria-labelledby="signed-in-heading" className="flex flex-col gap-6">
      <h1 id="signed-in-heading" className="text-5xl font-semibold tracking-tight">
        You're signed in, {user.name}.
      </h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd>{user.email}</dd>
        <dt className="text-muted-foreground">Currency</dt>
        <dd>{currency.success ? currencyLabel(currency.data) : user.currency}</dd>
        <dt className="text-muted-foreground">Time zone</dt>
        <dd>{user.timeZone}</dd>
      </dl>
    </section>
  )
}

function SignedOut() {
  return (
    <section aria-labelledby="welcome-heading" className="flex flex-col items-start gap-6">
      <Tagline id="welcome-heading" className="text-5xl" />
      <Button asChild size="lg">
        <Link to="/sign-up">Create an account</Link>
      </Button>
    </section>
  )
}
