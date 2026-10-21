import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../src/app.js'
import { pool } from '../src/db/client.js'
import { APP_ORIGIN, type MailerSpy, NEW_USER, startFresh } from './helpers.js'

const OTHER_SITE = 'https://evil.example'

const signUpForm = new URLSearchParams(NEW_USER)

function post(path: string, init: { headers: Record<string, string>; body: string }) {
  return app.request(path, { method: 'POST', ...init })
}

let send: MailerSpy

beforeEach(async () => {
  send = await startFresh()
})
afterAll(() => pool.end())

describe('state-changing requests from another site', () => {
  // Stopped by Hono's csrf() (and Better Auth's own check behind it).
  it('rejects a form post to sign-up', async () => {
    const res = await post('/api/auth/sign-up/email', {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: OTHER_SITE,
        'sec-fetch-site': 'cross-site',
      },
      body: signUpForm.toString(),
    })

    expect(res.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  // Hono's csrf() checks only form-style posts, which a page on another site
  // can send without asking. A browser asks the API's permission before
  // sending this one cross-site, and gets none. If it is sent anyway, Better
  // Auth's own origin check stops it.
  it('rejects a JSON post to sign-up (by Better Auth’s origin check)', async () => {
    const res = await post('/api/auth/sign-up/email', {
      headers: {
        'content-type': 'application/json',
        origin: OTHER_SITE,
        'sec-fetch-site': 'cross-site',
      },
      body: JSON.stringify(NEW_USER),
    })

    expect(res.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects a form post to a route outside Better Auth', async () => {
    const res = await post('/api/health', {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: OTHER_SITE,
      },
      body: '',
    })

    expect(res.status).toBe(403)
  })
})

describe('state-changing requests from the app itself', () => {
  it('accepts a form post to sign-up', async () => {
    const res = await post('/api/auth/sign-up/email', {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: APP_ORIGIN,
        'sec-fetch-site': 'same-origin',
      },
      body: signUpForm.toString(),
    })

    expect(res.status).toBe(200)
  })
})
