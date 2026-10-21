import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/db/client.js'
import { getMe, NEW_USER, OTHER_USER, signInNewUser, signOut, startFresh } from './helpers.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

beforeEach(async () => {
  await startFresh()
})
afterAll(() => pool.end())

describe('GET /api/me', () => {
  it('is refused without a session', async () => {
    const res = await getMe()

    expect(res.status).toBe(401)
  })

  it("returns the signed-in user's own details", async () => {
    const cookie = await signInNewUser()

    const res = await getMe(cookie)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: expect.stringMatching(UUID),
      name: 'Aisyah',
      email: 'aisyah@example.com',
      currency: 'SGD',
      timeZone: 'Asia/Kuala_Lumpur',
    })
  })

  it('shows each of two users only their own details', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)

    const [forAisyah, forWeiMing] = await Promise.all(
      [aisyah, weiMing].map(async (cookie) => (await (await getMe(cookie)).json()) as { id: string }),
    )

    expect(forAisyah).toMatchObject({ email: 'aisyah@example.com', currency: 'SGD' })
    expect(forWeiMing).toMatchObject({ email: 'weiming@example.com', currency: 'JPY' })
    expect(forAisyah.id).not.toBe(forWeiMing.id)
  })

  it('is refused with the cookie of a session that has signed out', async () => {
    const cookie = await signInNewUser()

    const signedOut = await signOut(cookie)
    const res = await getMe(cookie)

    expect(signedOut.status).toBe(200)
    expect(res.status).toBe(401)
  })

  it('is refused with a forged session cookie', async () => {
    const res = await getMe('better-auth.session_token=not-a-real-token')

    expect(res.status).toBe(401)
  })

  it('tells caches not to keep the answer', async () => {
    const cookie = await signInNewUser()

    const res = await getMe(cookie)

    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
