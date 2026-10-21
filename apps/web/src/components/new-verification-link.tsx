import { emailSchema } from '@for-wealth/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'
import { signInURL } from '@/lib/redirect'

const formSchema = z.object({ email: emailSchema })
type FormValues = z.infer<typeof formSchema>

// The API answers the same, and as fast, whether or not the email has an
// account waiting to be verified, so the confirmation can't say more either.
function LinkRequested({ email }: { email: string }) {
  return (
    <p role="status">
      If <span className="font-medium">{email}</span> has an account waiting to
      be verified, a new link is on its way.
    </p>
  )
}

async function requestLink(email: string) {
  return authClient.sendVerificationEmail({
    email,
    callbackURL: signInURL('/', window.location.origin),
  })
}

// For someone whose link expired or broke: asks for the email, then sends a
// fresh link to it.
export function NewVerificationLinkForm() {
  const [sentTo, setSentTo] = useState<string>()
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit({ email }: FormValues) {
    const { error } = await requestLink(email)
    if (error) {
      form.setError('root', { message: error.message ?? 'The link could not be sent. Try again.' })
      return
    }
    setSentTo(email)
  }

  if (sentTo) return <LinkRequested email={sentTo} />

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="new-link-email">Email</FieldLabel>
          <Input
            id="new-link-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby="new-link-email-error"
            {...form.register('email')}
          />
          <FieldError id="new-link-email-error" errors={[errors.email]} />
        </Field>
        <FieldError errors={[errors.root]} />
        <Button type="submit" className="self-start" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send a new link'}
        </Button>
      </FieldGroup>
    </form>
  )
}

// For someone who has just signed up and hasn't had the link: sends another
// to the email they gave.
export function SendLinkAgainButton({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  async function sendAgain() {
    setState('sending')
    const { error } = await requestLink(email)
    setState(error ? 'failed' : 'sent')
  }

  if (state === 'sent') return <LinkRequested email={email} />

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="outline" onClick={sendAgain} disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send the link again'}
      </Button>
      {state === 'failed' && (
        <p role="alert" className="text-sm text-destructive">
          The link could not be sent. Try again.
        </p>
      )}
    </div>
  )
}
