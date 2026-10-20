import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db/client.js'

export const health = new Hono().get('/', async (c) => {
  try {
    await db.execute(sql`select 1`)
  } catch (error) {
    // The reason goes to the server log only; callers just learn it's down.
    console.error('Health check: database query failed', error)
    return c.json({ status: 'unavailable' as const }, 503)
  }
  return c.json({ status: 'ok' as const })
})
