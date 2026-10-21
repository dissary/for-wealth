import { sql } from 'drizzle-orm'
import { type MockInstance, vi } from 'vitest'
import app from '../src/app.js'
import { db } from '../src/db/client.js'
import { mailer } from '../src/email.js'
import { env } from '../src/env.js'
import { signUpTiming } from '../src/sign-up-timing.js'

// The address the browser uses (vitest.config.ts sets it).
export const APP_ORIGIN = new URL(env.BETTER_AUTH_URL).origin

export const NEW_USER = {
  name: 'Aisyah',
  email: 'aisyah@example.com',
  password: 'correct horse battery',
  currency: 'SGD',
  timeZone: 'Asia/Kuala_Lumpur',
}

export type MailerSpy = MockInstance<typeof mailer.send>

// For each test's beforeEach: empties every table and replaces the mailer, so
// nothing prints and the emails can be read from the returned spy.
// verifications has no foreign key to users, so the cascade alone would leave
// its rows behind. Sign-up's response-time floor is off unless a test sets it.
export async function startFresh(): Promise<MailerSpy> {
  await db.execute(sql`truncate table users, verifications cascade`)
  vi.restoreAllMocks()
  signUpTiming.minimumMs = 0
  return vi.spyOn(mailer, 'send').mockResolvedValue()
}

export function signUp(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

// The link in the most recent email.
export function lastLink(send: MailerSpy) {
  const email = send.mock.lastCall?.[0]
  const url = email?.text.match(/https?:\/\/\S+/)?.[0]
  if (!url) throw new Error('No email with a link was sent')
  return new URL(url)
}

// The cookies a response sets, as a Cookie header for the next request.
export function cookiesFrom(res: Response) {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

// Signs NEW_USER up and opens their verification link, which signs them in.
// Returns the session cookie.
export async function signUpAndVerify(send: MailerSpy) {
  await signUp(NEW_USER)
  const link = lastLink(send)
  return cookiesFrom(await app.request(link.pathname + link.search))
}
