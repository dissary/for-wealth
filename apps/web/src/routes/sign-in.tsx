import { signInSchema, type SignInInput } from '@for-wealth/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { DevEmailNote } from '@/components/dev-email-note'
import { NewVerificationLinkForm } from '@/components/new-verification-link'
import { SignedOutPage } from '@/components/signed-out-page'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { type AuthErrorCode, authClient } from '@/lib/auth-client'
import { meQuery } from '@/lib/me'
import { pathInsideApp, signInURL } from '@/lib/redirect'

// ?redirect= is where to go after signing in. Better Auth adds ?error= when a
// verification link doesn't work, as every link it sends comes back here.
const searchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/sign-in')({
  validateSearch: searchSchema,
  // Someone already signed in goes straight on. This is also how a working
  // verification link, which signs the user in, ends up in the app.
  beforeLoad: async ({ context, search }) => {
    if (await context.queryClient.fetchQuery(meQuery)) {
      throw redirect({ href: pathInsideApp(search.redirect, window.location.origin) })
    }
  },
  component: SignIn,
})

const LINK_ERRORS: Partial<Record<AuthErrorCode, string>> = {
  TOKEN_EXPIRED: 'That verification link has expired.',
}
const BROKEN_LINK = "That verification link doesn't work. Check you copied all of it."

function SignIn() {
  const { error, redirect: redirectTo } = Route.useSearch()
  const [unverified, setUnverified] = useState<string>()

  return (
    <SignedOutPage>
      <div className="flex flex-col gap-8">
        {error && <BrokenLink error={error} />}
        {unverified ? (
          <CheckYourEmail email={unverified} onBack={() => setUnverified(undefined)} />
        ) : (
          <SignInForm
            // Where Better Auth sends the browser after signing in, and where
            // the link in a verification email leads: back here, which
            // forwards to the page the user was going to.
            callbackURL={signInURL(redirectTo, window.location.origin)}
            onUnverified={setUnverified}
          />
        )}
      </div>
    </SignedOutPage>
  )
}

function SignInForm({
  callbackURL,
  onUnverified,
}: {
  callbackURL: string
  onUnverified: (email: string) => void
}) {
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })
  const { errors, isSubmitting, isSubmitSuccessful } = form.formState

  async function onSubmit(values: SignInInput) {
    // On success Better Auth's client loads callbackURL as a new page, so
    // nothing from before signing in stays in memory.
    const { error } = await authClient.signIn.email({ ...values, callbackURL })
    if (!error) return

    // Only someone who knows the password gets 403, so saying the email is
    // waiting to be verified gives nothing away.
    if (error.status === 403) return onUnverified(values.email)
    form.setError(
      'root',
      {
        // One message whether the email or the password is wrong, as the
        // API's answer is the same.
        message:
          error.status === 401
            ? "That email and password don't match an account."
            : error.status === 429
              ? 'Too many attempts. Wait a minute, then try again.'
              : "Couldn't sign in. Try again.",
      },
      { shouldFocus: true },
    )
  }

  const busy = isSubmitting || isSubmitSuccessful

  return (
    <section aria-labelledby="sign-in-heading" className="flex flex-col gap-6">
      <h2 id="sign-in-heading" className="text-2xl font-semibold">
        Sign in
      </h2>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby="email-error"
              {...form.register('email')}
            />
            <FieldError id="email-error" errors={[errors.email]} />
          </Field>

          <Field data-invalid={!!errors.password}>
            <div className="flex items-baseline justify-between gap-4">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby="password-error"
              {...form.register('password')}
            />
            <FieldError id="password-error" errors={[errors.password]} />
          </Field>

          <FieldError errors={[errors.root]} />
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <p className="text-sm">
            New here?{' '}
            <Link to="/sign-up" className="font-medium text-primary underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        </FieldGroup>
      </form>
    </section>
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

function CheckYourEmail({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <section aria-labelledby="check-email-heading" className="flex flex-col gap-3" role="status">
      <h2 id="check-email-heading" className="text-2xl font-semibold">
        Check your email
      </h2>
      <p>
        Your email isn't verified yet. We've sent a new link to{' '}
        <span className="font-medium">{email}</span>. Open it to verify your
        email and sign in.
      </p>
      <DevEmailNote />
      <Button variant="outline" className="self-start" onClick={onBack}>
        Sign in with a different email
      </Button>
    </section>
  )
}
