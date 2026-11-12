import { categoryIdSchema, trendsToSchema } from '@for-wealth/shared'
import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { z } from 'zod'
import { parseFor } from '../parse-for.js'
import { requireSession, type SignedInEnv } from '../require-session.js'
import { categoryTrends, monthTrends } from '../trends.js'
import { catchingUp, categoryNotFound } from './shared.js'

// The window's last month and optionally one Category, nothing else, so no
// arbitrary ranges. This month, its latest, is taken in the user's own time
// zone.
function trendsQuerySchema(timeZone: string) {
  return z.strictObject({ to: trendsToSchema(timeZone), category: categoryIdSchema.optional() })
}

export const trends = new Hono<SignedInEnv>()
  .use(requireSession)
  .get('/', validator('query', parseFor(trendsQuerySchema)), catchingUp, async (c) => {
    const { to, category } = c.req.valid('query')
    if (!category) return c.json(await monthTrends(c.get('user').id, to))
    const trends = await categoryTrends(c.get('user').id, to, category)
    if (!trends) return categoryNotFound(c)
    return c.json(trends)
  })
