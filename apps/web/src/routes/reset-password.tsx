import { PASSWORD_MIN_LENGTH, passwordSchema } from '@for-wealth/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ResetLinkRequestForm } from '@/components/reset-link-request'
import { SignedOutPage } from '@/components/signed-out-page'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { type AuthErrorCode, authClient } from '@/lib/auth-client'

// Where the emailed reset link lands: with ?token= when the link works, or
// with ?error= when it was used, has expired or was mangled.
const searchSchema = z.object({
  token: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/reset-password')({
  validateSearch: searchSchema,
  component: ResetPassword,
})

const formSchema = z.object({ password: passwordSchema })
type FormValues = z.infer<typeof formSchema>

const PASSWORD_ERRORS: AuthErrorCode[] = [
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'PASSWORD_COMPROMISED',
]

function ResetPassword() {
  const { token, error } = Route.useSearch()
  const [state, setState] = useState<'choosing' | 'link-failed' | 'done'>('choosing')

  return (
    <SignedOutPage>
      {state === 'done' ? (
        <PasswordChanged />
      ) : !token || error || state === 'link-failed' ? (
        <LinkNoLongerWorks />
      ) : (
        <NewPasswordForm
          token={token}
          onDone={() => setState('done')}
          onLinkFailed={() => setState('link-failed')}
        />
      )}
    </SignedOutPage>
  )
}

function NewPasswordForm({
  token,
  onDone,
  onLinkFailed,
}: {
  token: string
  onDone: () => void
  onLinkFailed: () => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '' },
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit({ password }: FormValues) {
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    if (!error) {
      // Every session was signed out, this browser's too, so nothing of the
      // user's may stay in memory.
      queryClient.clear()
      return onDone()
    }

    if (error.code === 'INVALID_TOKEN') return onLinkFailed()
    const isPasswordError = PASSWORD_ERRORS.includes(error.code as AuthErrorCode)
    form.setError(
      isPasswordError ? 'password' : 'root',
      {
        message: isPasswordError
          ? (error.message ?? 'Choose a different password.')
          : error.status === 429
            ? 'Too many attempts. Wait a minute, then try again.'
            : "Couldn't change your password. Try again.",
      },
      { shouldFocus: true },
    )
  }

  return (
    <section aria-labelledby="new-password-heading" className="flex flex-col gap-6">
      <h2 id="new-password-heading" className="text-2xl font-semibold">
        Choose a new password
      </h2>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby="password-hint password-error"
              {...form.register('password')}
            />
            <FieldDescription id="password-hint">
              At least {PASSWORD_MIN_LENGTH} characters. A few unrelated words
              work well.
            </FieldDescription>
            <FieldError id="password-error" errors={[errors.password]} />
          </Field>
          <FieldError errors={[errors.root]} />
          <p className="text-sm">Changing it signs you out on every device.</p>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Changing password…' : 'Change password'}
          </Button>
        </FieldGroup>
      </form>
    </section>
  )
}

// One message whether the link was used, has expired or was mangled: the
// API doesn't say which, and the fix is the same.
function LinkNoLongerWorks() {
  return (
    <section aria-labelledby="link-failed-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="link-failed-heading" role="alert" className="text-2xl font-semibold">
          This link no longer works
        </h2>
        <p className="text-sm">
          A reset link works once, within an hour of asking for it. Request a
          new one.
        </p>
      </div>
      <ResetLinkRequestForm />
    </section>
  )
}

function PasswordChanged() {
  return (
    <section aria-labelledby="password-changed-heading" className="flex flex-col gap-3" role="status">
      <h2 id="password-changed-heading" className="text-2xl font-semibold">
        Password changed
      </h2>
      <p>You've been signed out on every device. Sign in with your new password.</p>
      <Button asChild className="self-start">
        <Link to="/sign-in">Sign in</Link>
      </Button>
    </section>
  )
}
