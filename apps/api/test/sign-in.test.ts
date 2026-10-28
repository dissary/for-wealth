import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, pool } from '../src/db/client.js'
import { sessions, users } from '../src/db/schema/index.js'
import { passwordHashing } from '../src/password-hashing.js'
import {
  APP_ORIGIN,
  cookiesFrom,
  getMe,
  type MailerSpy,
  NEW_USER,
  sessionCookieFrom,
  signIn,
  signInNewUser,
  signUp,
  startFresh,
} from './helpers.js'

let send: MailerSpy

beforeEach(async () => {
  send = await startFresh()
})
afterAll(() => pool.end())

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60

describe('signing in', () => {
  it('starts a session for a verified user', async () => {
    const cookie = await signInNewUser()

    const res = await getMe(cookie)

    expect(res.status).toBe(200)
  })

  // Every other test hashes passwords fast (test/fast-passwords.ts); this one
  // runs the scrypt hash production uses.
  it('checks the password with the real hash', async () => {
    passwordHashing.reset()
    const cookie = await signInNewUser()

    const wrongPassword = await signIn({ email: NEW_USER.email, password: 'not the right one' })

    expect((await getMe(cookie)).status).toBe(200)
    expect(wrongPassword.status).toBe(401)
  })

  it('gives the same answer for a wrong password and for an email with no account', async () => {
    await signInNewUser()

    const wrongPassword = await signIn({ email: NEW_USER.email, password: 'not the right one' })
    const noAccount = await signIn({ email: 'nobody@example.com', password: NEW_USER.password })

    expect(wrongPassword.status).toBe(401)
    expect(noAccount.status).toBe(401)
    expect(await wrongPassword.json()).toEqual(await noAccount.json())
    expect(cookiesFrom(wrongPassword)).not.toMatch(/session_token=/)
  })

  it('lasts 7 days', async () => {
    await signUp(NEW_USER)
    await db.update(users).set({ emailVerified: true }).where(eq(users.email, NEW_USER.email))

    const res = await signIn(NEW_USER)

    expect(sessionCookieFrom(res)).toContain(`Max-Age=${SEVEN_DAYS_IN_SECONDS}`)
  })
})

describe('signing in before verifying the email', () => {
  it('is refused and sends a fresh verification link', async () => {
    await signUp(NEW_USER)

    const res = await signIn(NEW_USER)

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' })
    expect(cookiesFrom(res)).not.toMatch(/session_token=/)
    expect(send).toHaveBeenCalledTimes(2)
    const [email] = send.mock.calls[1]!
    expect(email.to).toBe('aisyah@example.com')
    expect(email.text).toContain(`${APP_ORIGIN}/api/auth/verify-email?token=`)
  })

  // Only someone who knows the password learns that the email is waiting to
  // be verified.
  it('with the wrong password gives the usual answer and sends nothing', async () => {
    await signUp(NEW_USER)

    const res = await signIn({ email: NEW_USER.email, password: 'not the right one' })

    expect(res.status).toBe(401)
    expect(send).toHaveBeenCalledOnce()
  })
})

describe('a session in use', () => {
  // Better Auth extends a session once it is a day old. Makes this one look
  // two days old.
  async function ageSessionsByTwoDays() {
    await db.update(sessions).set({ expiresAt: sql`${sessions.expiresAt} - interval '2 days'` })
  }

  it('is extended to 7 days from now, in the database and in the cookie', async () => {
    const cookie = await signInNewUser()
    await ageSessionsByTwoDays()

    const res = await getMe(cookie)

    expect(res.status).toBe(200)
    expect(sessionCookieFrom(res)).toContain(`Max-Age=${SEVEN_DAYS_IN_SECONDS}`)
    const [session] = await db.select().from(sessions)
    const daysLeft = (session!.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(daysLeft).toBeCloseTo(7, 1)
  })
})
