import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../src/app.js'
import { pool } from '../src/db/client.js'
import {
  APP_ORIGIN,
  cookiesFrom,
  getMe,
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

const NEW_PASSWORD = 'teh tarik kurang manis'

// As Settings sends it: every other session is signed out.
function changePassword(cookie: string, currentPassword: string, newPassword = NEW_PASSWORD) {
  return app.request('/api/auth/change-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN, cookie },
    body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }),
  })
}

describe('changing the password in Settings', () => {
  it('refuses a wrong current password, keeping the old one', async () => {
    const cookie = await signInNewUser()

    const res = await changePassword(cookie, 'not my password at all')

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_PASSWORD' })
    expect((await signIn(NEW_USER)).status).toBe(200)
    expect((await signIn({ email: NEW_USER.email, password: NEW_PASSWORD })).status).toBe(401)
  })

  // The sign-up rules, breach check included.
  it.each([
    ['a 9-character password', 'a'.repeat(9), 'PASSWORD_TOO_SHORT'],
    ['a 129-character password', 'a'.repeat(129), 'PASSWORD_TOO_LONG'],
    ['a breached password', BREACHED_PASSWORD, 'PASSWORD_COMPROMISED'],
  ])('refuses %s, keeping the old one', async (_, newPassword, code) => {
    const cookie = await signInNewUser()

    const res = await changePassword(cookie, NEW_USER.password, newPassword)

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code })
    expect((await signIn(NEW_USER)).status).toBe(200)
  })

  it('lets the user sign in with the new password, and not with the old one', async () => {
    const cookie = await signInNewUser()

    const res = await changePassword(cookie, NEW_USER.password)

    expect(res.status).toBe(200)
    expect((await signIn({ email: NEW_USER.email, password: NEW_PASSWORD })).status).toBe(200)
    expect((await signIn(NEW_USER)).status).toBe(401)
  })

  // Better Auth signs every session out and starts a new one for this
  // browser, replacing its cookie, so the user stays signed in here.
  it('keeps this session signed in and signs out every other one', async () => {
    const otherDevice = await signInNewUser()
    const signedIn = await signIn(NEW_USER)
    const thisDevice = cookiesFrom(signedIn)

    const res = await changePassword(thisDevice, NEW_USER.password)

    expect(res.status).toBe(200)
    expect((await getMe(updateCookies(thisDevice, res))).status).toBe(200)
    expect((await getMe(otherDevice)).status).toBe(401)
  })

  // The "your password was changed" email comes with sending emails, in
  // slice 7.
  it('sends no email', async () => {
    const cookie = await signInNewUser()
    send.mockClear()

    const res = await changePassword(cookie, NEW_USER.password)

    expect(res.status).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })
})

// The Cookie header a browser would send after `res`: its cookies replace
// those of the same name.
function updateCookies(cookie: string, res: Response) {
  const jar = new Map(cookie.split('; ').map((pair) => [pair.split('=')[0]!, pair]))
  for (const pair of cookiesFrom(res).split('; ')) jar.set(pair.split('=')[0]!, pair)
  return [...jar.values()].join('; ')
}
