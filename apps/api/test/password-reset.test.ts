import { sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app.js'
import { db, pool } from '../src/db/client.js'
import { verifications } from '../src/db/schema/index.js'
import { responseFloor } from '../src/response-floor.js'
import {
  APP_ORIGIN,
  getMe,
  lastLink,
  type MailerSpy,
  NEW_USER,
  signIn,
  signInNewUser,
  startFresh,
} from './helpers.js'
import { BREACHED_PASSWORD } from './no-network.js'

let send: MailerSpy

beforeEach(async () => {
  send = await startFresh()
})
afterAll(() => pool.end())

// Signs in a verified user, with the sign-up email forgotten so each test
// sees only the emails it causes. Returns the session cookie.
async function existingSession() {
  const cookie = await signInNewUser()
  send.mockClear()
  return cookie
}

function requestReset(email: string) {
  return app.request('/api/auth/request-password-reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN },
    body: JSON.stringify({ email, redirectTo: '/reset-password' }),
  })
}

describe('asking for a password reset', () => {
  it('emails a reset link on the address the browser uses', async () => {
    await existingSession()

    const res = await requestReset(NEW_USER.email)

    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledOnce()
    const [email] = send.mock.calls[0]!
    expect(email.to).toBe(NEW_USER.email)
    expect(lastLink(send).href).toMatch(`${APP_ORIGIN}/api/auth/reset-password/`)
  })

  it('answers the same for an email with no account, sending nothing', async () => {
    await existingSession()
    const known = await requestReset(NEW_USER.email)

    const unknown = await requestReset('nobody@example.com')

    expect(unknown.status).toBe(known.status)
    expect(await unknown.json()).toEqual(await known.json())
    expect(send).toHaveBeenCalledOnce()
  })

  // Someone who could read the database still can't use a live link.
  it('stores only a hash of the token', async () => {
    await existingSession()

    const token = await tokenFromEmail()

    const rows = await db.select().from(verifications)
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('answers without waiting for the email to be sent', async () => {
    await existingSession()
    send.mockReturnValue(new Promise(() => {}))

    const res = await requestReset(NEW_USER.email)

    expect(res.status).toBe(200)
  })

  // A known email also writes a reset token, an unknown one doesn't. Holding
  // every answer to a floor hides that difference.
  it('takes at least the floor, whether or not the email has an account', async () => {
    await existingSession()
    responseFloor.minimumMs = 300
    const durations: number[] = []

    for (const email of [NEW_USER.email, 'nobody@example.com']) {
      const start = performance.now()
      const res = await requestReset(email)
      durations.push(performance.now() - start)
      expect(res.status, email).toBe(200)
    }

    expect(Math.min(...durations)).toBeGreaterThanOrEqual(300)
  })
})

const NEW_PASSWORD = 'teh tarik kurang manis'

// The token the reset page gets: the emailed link redirects to it.
async function tokenFrom(link: URL) {
  const res = await app.request(link.pathname + link.search)
  const location = new URL(res.headers.get('location')!, APP_ORIGIN)
  return location.searchParams.get('token')!
}

async function tokenFromEmail() {
  await requestReset(NEW_USER.email)
  return tokenFrom(lastLink(send))
}

function resetPassword(token: string, newPassword = NEW_PASSWORD) {
  return app.request('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN },
    body: JSON.stringify({ token, newPassword }),
  })
}

describe('opening the reset link', () => {
  it('lands on the reset page with the token', async () => {
    await existingSession()
    await requestReset(NEW_USER.email)
    const link = lastLink(send)

    const res = await app.request(link.pathname + link.search)

    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(`${APP_ORIGIN}/reset-password`)
    expect(location.searchParams.get('token')).toBeTruthy()
  })
})

describe('choosing a new password', () => {
  it('lets the user sign in with it, and not with the old one', async () => {
    await existingSession()
    const token = await tokenFromEmail()

    const res = await resetPassword(token)

    expect(res.status).toBe(200)
    expect((await signIn({ email: NEW_USER.email, password: NEW_PASSWORD })).status).toBe(200)
    expect((await signIn(NEW_USER)).status).toBe(401)
  })

  it('signs out every session from before the reset', async () => {
    const oldSession = await existingSession()
    const token = await tokenFromEmail()

    await resetPassword(token)

    expect((await getMe(oldSession)).status).toBe(401)
  })

  // Spending the token, signing out the sessions and saving the password
  // happen in one transaction. Postgres refuses the last step here, so the
  // first two must be undone.
  it('changes nothing if saving the password fails', async () => {
    const oldSession = await existingSession()
    const token = await tokenFromEmail()
    await refusePasswordWrites(async () => {
      const res = await resetPassword(token)

      expect(res.status).toBe(500)
    })

    expect((await getMe(oldSession)).status).toBe(200)
    expect((await signIn(NEW_USER)).status).toBe(200)
    expect((await resetPassword(token)).status).toBe(200)
  })

  it.each([
    ['a 9-character password', 'a'.repeat(9), 'PASSWORD_TOO_SHORT'],
    ['a 129-character password', 'a'.repeat(129), 'PASSWORD_TOO_LONG'],
    ['a breached password', BREACHED_PASSWORD, 'PASSWORD_COMPROMISED'],
  ])('rejects %s, keeping the old one and the link', async (_, newPassword, code) => {
    await existingSession()
    const token = await tokenFromEmail()

    const res = await resetPassword(token, newPassword)

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code })
    expect((await signIn(NEW_USER)).status).toBe(200)
    expect((await resetPassword(token)).status).toBe(200)
  })
})

describe('a reset link that no longer works', () => {
  const ONE_HOUR = 60 * 60 * 1000

  // Moves the clock on, as if the user opened the link `ms` after asking.
  function later(ms: number) {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + ms })
  }
  afterEach(() => vi.useRealTimers())

  it('works for an hour', async () => {
    await existingSession()
    const token = await tokenFromEmail()
    later(ONE_HOUR - 60_000)

    const res = await resetPassword(token)

    expect(res.status).toBe(200)
  })

  it('is refused once an hour has passed', async () => {
    await existingSession()
    const token = await tokenFromEmail()
    later(ONE_HOUR + 60_000)

    const res = await resetPassword(token)

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_TOKEN' })
    expect((await signIn(NEW_USER)).status).toBe(200)
  })

  it('is refused the second time', async () => {
    await existingSession()
    const token = await tokenFromEmail()
    await resetPassword(token)

    const res = await resetPassword(token, 'a second new password')

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_TOKEN' })
    expect((await signIn({ email: NEW_USER.email, password: NEW_PASSWORD })).status).toBe(200)
  })

  it('is refused once the password has been reset with a later link', async () => {
    await existingSession()
    const earlier = await tokenFromEmail()
    await resetPassword(await tokenFromEmail())

    const res = await resetPassword(earlier, 'a second new password')

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_TOKEN' })
  })

  // The reset page explains these from ?error= and offers a new link.
  it.each([
    ['used', async (link: URL) => void (await resetPassword(await tokenFrom(link)))],
    ['expired', async () => later(ONE_HOUR + 60_000)],
    ['tampered with', async (link: URL) => void (link.pathname = `${link.pathname}x`)],
  ])('sends a browser that opens it once %s to the reset page with an error', async (_, spoil) => {
    await existingSession()
    await requestReset(NEW_USER.email)
    const link = lastLink(send)
    await spoil(link)

    const res = await app.request(link.pathname + link.search)

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${APP_ORIGIN}/reset-password?error=INVALID_TOKEN`)
  })
})

// Runs `during` while a trigger makes Postgres reject any change to a
// password.
async function refusePasswordWrites(during: () => Promise<void>) {
  await db.execute(sql`
    create function refuse_password_write() returns trigger language plpgsql as $$
    begin raise exception 'password writes refused by the test'; end $$
  `)
  await db.execute(sql`
    create trigger refuse_password_write before update of password on accounts
    for each row execute function refuse_password_write()
  `)
  try {
    await during()
  } finally {
    await db.execute(sql`drop trigger refuse_password_write on accounts`)
    await db.execute(sql`drop function refuse_password_write`)
  }
}
