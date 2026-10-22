import { createMiddleware } from 'hono/factory'
import type { SignedInEnv } from './require-session.js'

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])

// When each user's recent writes happened, oldest first. In memory until
// slice 7 moves it to the database, so a restart forgets it.
const recentWrites = new Map<string, number[]>()
let lastSweep = 0

// Adding, editing and deleting user data is limited to `max` requests per
// user in any `windowMs` (v1-spec "Data and security"). A sliding window, so
// no burst can straddle a boundary. Tests set `now` and call reset().
export const writeLimit = {
  max: 60,
  windowMs: 60_000,
  now: () => Date.now(),
  reset() {
    recentWrites.clear()
    lastSweep = 0
    this.now = () => Date.now()
  },
}

// For app routes behind requireSession. Every write counts, refused and
// invalid ones included, since each still costs a session lookup and a
// query. Reads pass straight through.
export const limitWrites = createMiddleware<SignedInEnv>(async (c, next) => {
  if (READS.has(c.req.method)) return next()

  const now = writeLimit.now()
  const since = now - writeLimit.windowMs
  sweep(now, since)

  const userId = c.get('user').id
  const times = (recentWrites.get(userId) ?? []).filter((time) => time > since)
  if (times.length >= writeLimit.max) {
    recentWrites.set(userId, times)
    const retryAfter = Math.ceil((times[0]! + writeLimit.windowMs - now) / 1000)
    c.header('retry-after', String(retryAfter))
    return c.json({ code: 'TOO_MANY_WRITES', message: 'Too many changes in a minute' }, 429)
  }

  times.push(now)
  recentWrites.set(userId, times)
  await next()
})

// Drops users with no write in the window, at most once a window, so the map
// holds only users who wrote recently.
function sweep(now: number, since: number) {
  if (now - lastSweep < writeLimit.windowMs) return
  lastSweep = now
  for (const [userId, times] of recentWrites) {
    if (times.at(-1)! <= since) recentWrites.delete(userId)
  }
}
