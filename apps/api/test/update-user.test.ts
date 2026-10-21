import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../src/app.js'
import { pool } from '../src/db/client.js'
import { APP_ORIGIN, type MailerSpy, signUpAndVerify, startFresh } from './helpers.js'

let send: MailerSpy

beforeEach(async () => {
  send = await startFresh()
})
afterAll(() => pool.end())

function updateUser(cookie: string, body: Record<string, unknown>) {
  return app.request('/api/auth/update-user', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN, cookie },
    body: JSON.stringify(body),
  })
}

async function signedInUser(cookie: string) {
  const res = await app.request('/api/auth/get-session', { headers: { cookie } })
  return ((await res.json()) as { user: Record<string, unknown> }).user
}

describe('changing your details after signup', () => {
  it('refuses a new currency and keeps the old one', async () => {
    const cookie = await signUpAndVerify(send)

    const res = await updateUser(cookie, { currency: 'USD' })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'CURRENCY_LOCKED' })
    expect(await signedInUser(cookie)).toMatchObject({ currency: 'SGD' })
  })

  it('refuses a currency sent alongside other changes, changing nothing', async () => {
    const cookie = await signUpAndVerify(send)

    const res = await updateUser(cookie, { name: 'Aisyah R', currency: 'SGD' })

    expect(res.status).toBe(400)
    expect(await signedInUser(cookie)).toMatchObject({ name: 'Aisyah' })
  })

  it('refuses a blank name and keeps the old one', async () => {
    const cookie = await signUpAndVerify(send)

    const res = await updateUser(cookie, { name: '  ' })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_NAME' })
    expect(await signedInUser(cookie)).toMatchObject({ name: 'Aisyah' })
  })

  // Settings (slice 6) lets people change it.
  it('accepts a new time zone, in its canonical spelling', async () => {
    const cookie = await signUpAndVerify(send)

    const res = await updateUser(cookie, { timeZone: 'europe/london' })

    expect(res.status).toBe(200)
    expect(await signedInUser(cookie)).toMatchObject({ timeZone: 'Europe/London' })
  })

  it('refuses an unknown time zone', async () => {
    const cookie = await signUpAndVerify(send)

    const res = await updateUser(cookie, { timeZone: 'Mars/Olympus_Mons' })

    expect(res.status).toBe(400)
    expect(await signedInUser(cookie)).toMatchObject({ timeZone: 'Asia/Kuala_Lumpur' })
  })
})
