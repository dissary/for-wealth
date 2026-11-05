import { describe, expect, it, vi } from 'vitest'
import { noticingEndedSession } from '../src/lib/session.ts'

function answering(status: number) {
  return vi.fn<typeof fetch>(async () => new Response(null, { status }))
}

describe('noticingEndedSession', () => {
  it('reports an ended session when the API answers 401, and still hands back the answer', async () => {
    const onEnded = vi.fn()
    const res = await noticingEndedSession(answering(401), onEnded)('/api/transactions')
    expect(onEnded).toHaveBeenCalledOnce()
    expect(res.status).toBe(401)
  })

  it.each([200, 204, 400, 404, 409, 429, 500])('reports nothing for %i', async (status) => {
    const onEnded = vi.fn()
    const res = await noticingEndedSession(answering(status), onEnded)('/api/transactions')
    expect(onEnded).not.toHaveBeenCalled()
    expect(res.status).toBe(status)
  })

  it('reports nothing when the request never reached the API', async () => {
    const onEnded = vi.fn()
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(noticingEndedSession(offline, onEnded)('/api/transactions')).rejects.toThrow('Failed to fetch')
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('passes the request through unchanged', async () => {
    const fetchFn = answering(200)
    const init = { method: 'POST', body: '{}' }
    await noticingEndedSession(fetchFn, vi.fn())('/api/transactions', init)
    expect(fetchFn).toHaveBeenCalledWith('/api/transactions', init)
  })
})
