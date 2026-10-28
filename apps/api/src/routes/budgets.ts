import { budgetLimitsSchema, categoryIdSchema } from '@for-wealth/shared'
import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { monthBudgets, setBudgets } from '../budgets.js'
import { parseFor } from '../parse-for.js'
import { requireSession, type SignedInEnv } from '../require-session.js'
import { limitWrites } from '../write-limit.js'
import { categoryNotFound, monthQuerySchema } from './shared.js'

// Any month the Dashboard can show, past ones included.
const monthQuery = validator('query', parseFor(monthQuerySchema))

export const budgets = new Hono<SignedInEnv>()
  .use(requireSession)
  .use(limitWrites)
  .get('/', monthQuery, async (c) => {
    return c.json(await monthBudgets(c.get('user').id, c.req.valid('query').month))
  })
  .put('/', monthQuery, validator('json', parseFor(() => budgetLimitsSchema)), async (c) => {
    const input = c.req.valid('json')
    // An ID that isn't an ID can't be anyone's, so it gets the same 404 as
    // one that isn't the user's.
    if (!input.limits.every(({ categoryId }) => categoryIdSchema.safeParse(categoryId).success)) {
      return categoryNotFound(c)
    }
    const saved = await setBudgets(c.get('user').id, c.req.valid('query').month, input)
    if (!saved) return categoryNotFound(c)
    return c.body(null, 204)
  })
