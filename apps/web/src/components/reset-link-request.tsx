import { emailSchema } from '@for-wealth/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { DevEmailNote } from '@/components/dev-email-note'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

const formSchema = z.object({ email: emailSchema })
type FormValues = z.infer<typeof formSchema>

// Asks for an email and sends a password reset link to it. The API answers
// the same, and as fast, whether or not the email has an account, so the
// confirmation can't say more either.
export function ResetLinkRequestForm() {
  const [sentTo, setSentTo] = useState<string>()
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit({ email }: FormValues) {
    // The emailed link lands on the reset page, with ?token= when it works
    // and ?error= when it doesn't.
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
    if (error) {
      form.setError('root', {
        message:
          error.status === 429
            ? 'Too many attempts. Wait a minute, then try again.'
            : "Couldn't send the link. Try again.",
      })
      return
    }
    setSentTo(email)
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p>
          If <span className="font-medium">{sentTo}</span> has an account, a
          link to reset its password is on its way. It works once, within an
          hour.
        </p>
        <DevEmailNote />
      </div>
    )
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="reset-email">Email</FieldLabel>
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby="reset-email-error"
            {...form.register('email')}
          />
          <FieldError id="reset-email-error" errors={[errors.email]} />
        </Field>
        <FieldError errors={[errors.root]} />
        <Button type="submit" className="self-start" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send a reset link'}
        </Button>
      </FieldGroup>
    </form>
  )
}
