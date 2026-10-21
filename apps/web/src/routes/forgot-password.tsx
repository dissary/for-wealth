import { createFileRoute, Link } from '@tanstack/react-router'
import { ResetLinkRequestForm } from '@/components/reset-link-request'
import { SignedOutPage } from '@/components/signed-out-page'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPassword,
})

function ForgotPassword() {
  return (
    <SignedOutPage>
      <section aria-labelledby="forgot-password-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 id="forgot-password-heading" className="text-2xl font-semibold">
            Reset your password
          </h2>
          <p className="text-sm">
            Enter the email you signed up with. We'll send a link to choose a
            new password.
          </p>
        </div>
        <ResetLinkRequestForm />
        <p className="text-sm">
          Remembered it?{' '}
          <Link to="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </section>
    </SignedOutPage>
  )
}
