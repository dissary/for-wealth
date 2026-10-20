import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app.js'
import { pool } from '../src/db/client.js'

afterEach(() => vi.restoreAllMocks())
afterAll(() => pool.end())

describe('GET /api/health', () => {
  it('reports ok when the database answers', async () => {
    const res = await app.request('/api/health')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('reports unavailable, without details, when the database is down', async () => {
    vi.spyOn(pool, 'query').mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 127.0.0.1:5432'),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await app.request('/api/health')

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ status: 'unavailable' })
  })
})

describe('security headers', () => {
  it.each(['/api/health', '/api/no-such-route'])(
    'are on the response to %s',
    async (path) => {
      const res = await app.request(path)

      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
      expect(res.headers.get('strict-transport-security')).toMatch(/max-age=/)
      expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    },
  )
})
