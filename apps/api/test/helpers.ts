import { eq, sql } from 'drizzle-orm'
import { type MockInstance, vi } from 'vitest'
import app from '../src/app.js'
import { db } from '../src/db/client.js'
import { users } from '../src/db/schema/index.js'
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

// A second person, for checking that each user sees only their own data.
export const OTHER_USER = {
  name: 'Wei Ming',
  email: 'weiming@example.com',
  password: 'staple orbit lantern',
  currency: 'JPY',
  timeZone: 'Asia/Tokyo',
}

export function signIn(credentials: { email: string; password: string }) {
  return app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN },
    body: JSON.stringify(credentials),
  })
}

export function signOut(cookie: string) {
  return app.request('/api/auth/sign-out', {
    method: 'POST',
    headers: { origin: APP_ORIGIN, cookie },
  })
}

export async function getMe(cookie?: string) {
  return app.request('/api/me', { headers: cookie ? { cookie } : {} })
}

// The session cookie a response sets, with its attributes (Max-Age and so on).
export function sessionCookieFrom(res: Response) {
  return res.headers.getSetCookie().find((cookie) => cookie.includes('session_token='))
}

// Signs a new user up, marks their email verified straight in the database
// (skipping the inbox), then signs them in. Returns the session cookie.
export async function signInNewUser(user: typeof NEW_USER = NEW_USER) {
  const signedUp = await signUp(user)
  if (!signedUp.ok) throw new Error(`Sign-up failed: ${signedUp.status}`)
  await db.update(users).set({ emailVerified: true }).where(eq(users.email, user.email))

  const signedIn = await signIn(user)
  if (!signedIn.ok) throw new Error(`Sign-in failed: ${signedIn.status}`)
  return cookiesFrom(signedIn)
}
