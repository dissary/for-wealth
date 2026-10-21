export interface Email {
  to: string
  subject: string
  text: string
}

// Until slice 7 no real email is sent: each one is printed to the API console,
// where the developer opens its link. Resend replaces the body of send() then.
export const mailer = {
  async send(email: Email): Promise<void> {
    console.log(`\n✉️  To: ${email.to}\n   ${email.subject}\n\n${email.text}\n`)
  },
}

// Starts sending and returns at once. Callers that handle sign-up must not
// wait, or the response time would show whether an email went out. A failure
// is logged, never shown to the person who asked.
export function sendInBackground(email: Email): void {
  mailer.send(email).catch((error: unknown) => {
    console.error(`Email "${email.subject}" could not be sent`, error)
  })
}
