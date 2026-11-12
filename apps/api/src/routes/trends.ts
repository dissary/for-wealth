import { trendsToSchema } from '@for-wealth/shared'
import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { z } from 'zod'
import { parseFor } from '../parse-for.js'
import { requireSession, type SignedInEnv } from '../require-session.js'
import { monthTrends } from '../trends.js'
import { catchingUp } from './shared.js'

// The window's last month and nothing else, so no arbitrary ranges. This
// month, its latest, is taken in the user's own time zone.
function trendsQuerySchema(timeZone: string) {
  return z.strictObject({ to: trendsToSchema(timeZone) })
}

export const trends = new Hono<SignedInEnv>()
  .use(requireSession)
  .get('/', validator('query', parseFor(trendsQuerySchema)), catchingUp, async (c) => {
    return c.json(await monthTrends(c.get('user').id, c.req.valid('query').to))
  })
