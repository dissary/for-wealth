import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { monthDashboard } from '../dashboard.js'
import { parseFor } from '../parse-for.js'
import { requireSession, type SignedInEnv } from '../require-session.js'
import { monthQuerySchema } from './shared.js'

export const dashboard = new Hono<SignedInEnv>()
  .use(requireSession)
  .get('/', validator('query', parseFor(monthQuerySchema)), async (c) => {
    return c.json(await monthDashboard(c.get('user').id, c.req.valid('query').month))
  })
