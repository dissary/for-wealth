import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../src/app.js'
import { pool } from '../src/db/client.js'
import { signUpTiming } from '../src/sign-up-timing.js'
import {
  APP_ORIGIN,
  cookiesFrom,
  lastLink,
  type MailerSpy,
  NEW_USER,
  signUp,
  startFresh,
} from './helpers.js'
import { BREACHED_PASSWORD } from './no-network.js'

let send: MailerSpy

beforeEach(async () => {
  send = await startFresh()
})
afterAll(() => pool.end())

describe('signing up', () => {
  it('sends a verification link on the address the browser uses', async () => {
    const res = await signUp(NEW_USER)

    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledOnce()
    const [email] = send.mock.calls[0]!
    expect(email.to).toBe('aisyah@example.com')
    expect(email.text).toContain(`${APP_ORIGIN}/api/auth/verify-email?token=`)
  })

  it('defaults the currency to MYR', async () => {
    const { currency: _, ...withoutCurrency } = NEW_USER

    const res = await signUp(withoutCurrency)

    expect(await res.json()).toMatchObject({ user: { currency: 'MYR' } })
  })

  it.each([
    ['an 11-character password', { password: 'a'.repeat(11) }, 'PASSWORD_TOO_SHORT'],
    ['a 129-character password', { password: 'a'.repeat(129) }, 'PASSWORD_TOO_LONG'],
    ['a breached password', { password: BREACHED_PASSWORD }, 'PASSWORD_COMPROMISED'],
    ['an unlisted currency', { currency: 'KWD' }, 'VALIDATION_ERROR'],
    ['an unknown time zone', { timeZone: 'Mars/Olympus_Mons' }, 'VALIDATION_ERROR'],
    ['a fixed-offset time zone', { timeZone: '+08:00' }, 'VALIDATION_ERROR'],
    ['no time zone', { timeZone: undefined }, 'MISSING_FIELD'],
    ['a blank name', { name: '   ' }, 'INVALID_NAME'],
  ])('rejects %s and sends no email', async (_, change, code) => {
    const res = await signUp({ ...NEW_USER, ...change })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code })
    expect(send).not.toHaveBeenCalled()
  })

  it('stores the time zone in its canonical spelling', async () => {
    const res = await signUp({ ...NEW_USER, timeZone: 'asia/kuala_lumpur' })

    expect(await res.json()).toMatchObject({
      user: { timeZone: 'Asia/Kuala_Lumpur' },
    })
  })

  it('answers without waiting for the email to be sent', async () => {
    send.mockReturnValue(new Promise(() => {}))

    const res = await signUp(NEW_USER)

    expect(res.status).toBe(200)
  })

  it('answers the same whether or not the email already has an account', async () => {
    // Only the random ID and the timestamps may differ.
    async function comparable(res: Response) {
      const body = (await res.json()) as { user: Record<string, unknown> }
      const { id, createdAt, updatedAt, ...user } = body.user
      expect([id, createdAt, updatedAt]).toEqual([
        expect.any(String),
        expect.any(String),
        expect.any(String),
      ])
      return { status: res.status, body: { ...body, user } }
    }
    const firstTime = await comparable(await signUp(NEW_USER))

    const again = await comparable(
      await signUp({ ...NEW_USER, email: 'Aisyah@Example.com' }),
    )

    expect(again).toEqual(firstTime)
  })

  it('stores the name without surrounding spaces', async () => {
    const res = await signUp({ ...NEW_USER, name: '  Aisyah  ' })

    expect(await res.json()).toMatchObject({ user: { name: 'Aisyah' } })
  })
})

describe('response time', () => {
  // A new email also writes the user and their account, an existing one
  // doesn't. Holding every answer to a floor hides that difference.
  it('is at least the floor, whether or not the email already has an account', async () => {
    signUpTiming.minimumMs = 300
    const durations: number[] = []

    for (const attempt of ['new email', 'same email again']) {
      const start = performance.now()
      const res = await signUp(NEW_USER)
      durations.push(performance.now() - start)
      expect(res.status, attempt).toBe(200)
    }

    expect(Math.min(...durations)).toBeGreaterThanOrEqual(300)
  })

  it('is at least the floor for a rejected signup too', async () => {
    signUpTiming.minimumMs = 300
    const start = performance.now()

    await signUp({ ...NEW_USER, password: 'short' })

    expect(performance.now() - start).toBeGreaterThanOrEqual(300)
  })
})

describe('opening the verification link', () => {
  async function verificationLink() {
    await signUp(NEW_USER)
    return lastLink(send)
  }

  it('signs the user in and sends them to the app', async () => {
    const link = await verificationLink()

    const res = await app.request(link.pathname + link.search)

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    expect(cookiesFrom(res)).toMatch(/session_token=/)
  })

  it('starts a session for the verified user, with their signup details', async () => {
    const link = await verificationLink()
    const verified = await app.request(link.pathname + link.search)

    const res = await app.request('/api/auth/get-session', {
      headers: { cookie: cookiesFrom(verified) },
    })

    expect(await res.json()).toMatchObject({
      user: {
        name: 'Aisyah',
        email: 'aisyah@example.com',
        emailVerified: true,
        currency: 'SGD',
        timeZone: 'Asia/Kuala_Lumpur',
      },
    })
  })

  it('rejects a tampered link without signing anyone in', async () => {
    const link = await verificationLink()
    link.searchParams.set('token', `${link.searchParams.get('token')}x`)

    const res = await app.request(link.pathname + link.search)

    expect(res.headers.get('location')).toBe('/?error=INVALID_TOKEN')
    expect(cookiesFrom(res)).not.toMatch(/session_token=/)
  })
})

describe('asking for a new verification link', () => {
  function requestLink(email: string) {
    return app.request('/api/auth/send-verification-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, callbackURL: '/' }),
    })
  }

  it('sends one to an account waiting to be verified', async () => {
    await signUp(NEW_USER)

    const res = await requestLink('aisyah@example.com')

    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(2)
    expect(lastLink(send).origin).toBe(APP_ORIGIN)
  })

  it('answers the same for an email with no account, sending nothing', async () => {
    const res = await requestLink('nobody@example.com')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: true })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('getting a new verification link', () => {
  it('is done by signing in before verifying, which is refused', async () => {
    await signUp(NEW_USER)

    const res = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: NEW_USER.email, password: NEW_USER.password }),
    })

    expect(res.status).toBe(403)
    expect(send).toHaveBeenCalledTimes(2)
    const [email] = send.mock.calls[1]!
    expect(email.to).toBe('aisyah@example.com')
    expect(email.text).toContain(`${APP_ORIGIN}/api/auth/verify-email?token=`)
  })
})
