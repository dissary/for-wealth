import { dashboardMonthSchema } from '@for-wealth/shared'
import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { z } from 'zod'
import { monthDashboard } from '../dashboard.js'
import { parseFor } from '../parse-for.js'
import { requireSession, type SignedInEnv } from '../require-session.js'

// One month and nothing else, so no arbitrary ranges. Today, and so the
// month's bounds, are taken in the user's own time zone.
function monthQuerySchema(timeZone: string) {
  return z.strictObject({ month: dashboardMonthSchema(timeZone) })
}

export const dashboard = new Hono<SignedInEnv>()
  .use(requireSession)
  .get('/', validator('query', parseFor(monthQuerySchema)), async (c) => {
    return c.json(await monthDashboard(c.get('user').id, c.req.valid('query').month))
  })
