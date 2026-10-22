import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../src/app.js'
import { db, pool } from '../src/db/client.js'
import { users } from '../src/db/schema/index.js'
import { NEW_USER, startFresh } from './helpers.js'

const LIMIT = 16 * 1024

// A valid sign-up, padded with trailing spaces (still valid JSON) to `bytes`.
function signUpBody(bytes: number) {
  return JSON.stringify(NEW_USER).padEnd(bytes, ' ')
}

function postSignUp(body: string | ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
    // Required by Node's fetch for a streamed body.
    duplex: 'half',
  })
}

beforeEach(async () => {
  await startFresh()
})
afterAll(() => pool.end())

describe('requests to /api/*', () => {
  it('refuses a body over 16 KB by its declared length', async () => {
    const res = await postSignUp(signUpBody(LIMIT + 1), { 'content-length': String(LIMIT + 1) })

    expect(res.status).toBe(413)
    expect(await db.$count(users)).toBe(0)
  })

  it('refuses a body over 16 KB sent without a length', async () => {
    const chunk = new TextEncoder().encode(' '.repeat(1024))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i <= 16; i++) controller.enqueue(chunk)
        controller.close()
      },
    })

    const res = await postSignUp(stream)

    expect(res.status).toBe(413)
    expect(await db.$count(users)).toBe(0)
  })

  it('accepts a body of exactly 16 KB', async () => {
    const res = await postSignUp(signUpBody(LIMIT), { 'content-length': String(LIMIT) })

    expect(res.status).toBe(200)
    expect(await db.$count(users)).toBe(1)
  })
})
