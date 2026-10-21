import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  PASSWORD_MIN_LENGTH,
  signUpSchema,
  type SignUpInput,
  type SignUpOutput,
} from '@for-wealth/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Tagline, Wordmark } from '@/components/brand'
import { DevEmailNote } from '@/components/dev-email-note'
import { SendLinkAgainButton } from '@/components/new-verification-link'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { type AuthErrorCode, authClient } from '@/lib/auth-client'
import { currencyLabel } from '@/lib/currency'
import { signInURL } from '@/lib/redirect'

export const Route = createFileRoute('/sign-up')({
  component: SignUp,
})

// Errors the API reports against one field. Anything else shows above the
// button.
const FIELD_FOR_ERROR: Partial<Record<AuthErrorCode, keyof SignUpInput>> = {
  INVALID_NAME: 'name',
  INVALID_EMAIL: 'email',
  PASSWORD_TOO_SHORT: 'password',
  PASSWORD_TOO_LONG: 'password',
  PASSWORD_COMPROMISED: 'password',
}

function SignUp() {
  const [sentTo, setSentTo] = useState<string>()

  return (
    <main className="mx-auto grid min-h-svh w-full max-w-5xl content-center gap-12 px-6 py-12 md:grid-cols-[1fr_24rem] md:gap-20">
      <header className="flex flex-col gap-4">
        <Wordmark />
        <Tagline className="max-w-[12ch] text-5xl leading-[0.95] md:text-7xl" />
      </header>
      {sentTo ? <CheckYourEmail email={sentTo} /> : <SignUpForm onSent={setSentTo} />}
    </main>
  )
}

function SignUpForm({ onSent }: { onSent: (email: string) => void }) {
  const form = useForm<SignUpInput, unknown, SignUpOutput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      currency: DEFAULT_CURRENCY,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit(values: SignUpOutput) {
    const { error } = await authClient.signUp.email({
      ...values,
      callbackURL: signInURL('/', window.location.origin),
    })
    if (!error) return onSent(values.email)

    const message = error.message ?? 'Your account could not be created. Try again.'
    const field = error.code ? FIELD_FOR_ERROR[error.code as AuthErrorCode] : undefined
    form.setError(field ?? 'root', { message }, { shouldFocus: true })
  }

  return (
    <section aria-labelledby="sign-up-heading" className="flex flex-col gap-6">
      <h2 id="sign-up-heading" className="text-2xl font-semibold">
        Create your account
      </h2>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              autoComplete="name"
              aria-invalid={!!errors.name}
              aria-describedby="name-error"
              {...form.register('name')}
            />
            <FieldError id="name-error" errors={[errors.name]} />
          </Field>

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
            <FieldLabel htmlFor="password">Password</FieldLabel>
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

          <Field data-invalid={!!errors.currency}>
            <FieldLabel htmlFor="currency">Currency</FieldLabel>
            <NativeSelect
              id="currency"
              className="w-full"
              aria-invalid={!!errors.currency}
              aria-describedby="currency-hint currency-error"
              {...form.register('currency')}
            >
              {CURRENCIES.map(({ code }) => (
                <NativeSelectOption key={code} value={code}>
                  {currencyLabel(code)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription id="currency-hint">
              Every amount is in this currency. It can't be changed later.
            </FieldDescription>
            <FieldError id="currency-error" errors={[errors.currency]} />
          </Field>

          <Field data-invalid={!!errors.timeZone}>
            <p className="text-sm">
              Time zone: <span className="font-medium">{form.getValues('timeZone')}</span>
            </p>
            <FieldDescription>
              From your device. “Today” and “this month” follow it.
            </FieldDescription>
            <FieldError errors={[errors.timeZone]} />
          </Field>

          <FieldError errors={[errors.root]} />
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
          <p className="text-sm">
            Already have an account?{' '}
            <Link to="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </FieldGroup>
      </form>
    </section>
  )
}

function CheckYourEmail({ email }: { email: string }) {
  return (
    <section aria-labelledby="check-email-heading" className="flex flex-col gap-3" role="status">
      <h2 id="check-email-heading" className="text-2xl font-semibold">
        Check your email
      </h2>
      {/* The same words whether or not the email already has an account, as
          the API's answer is the same. */}
      <p>
        We've sent a link to <span className="font-medium">{email}</span>. Open
        it to verify your email and sign in. If that email already has an
        account, no new account is made and no link is sent.
      </p>
      <SendLinkAgainButton email={email} />
      <DevEmailNote />
    </section>
  )
}
