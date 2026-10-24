import {
  categoryIdSchema,
  newTransactionSchema,
  periodSchema,
  transactionChangesSchema,
  transactionDateSchema,
} from '@for-wealth/shared'
import { type Context, Hono } from 'hono'
import { validator } from 'hono/validator'
import { z } from 'zod'
import { parseFor } from '../parse-for.js'
import { requireSession, type SignedInEnv } from '../require-session.js'
import {
  createTransaction,
  deleteTransaction,
  findTransaction,
  listPeriod,
  updateTransaction,
} from '../transactions.js'
import { limitWrites } from '../write-limit.js'

// A Day, a Week or a Month, named by any date in it, and optionally one
// Category; nothing else, so no arbitrary ranges. Today, and so the bounds on
// the date, are taken in the user's own time zone.
function periodQuerySchema(timeZone: string) {
  return z.strictObject({
    period: periodSchema,
    date: transactionDateSchema(timeZone),
    category: categoryIdSchema.optional(),
  })
}

// Someone else's Category, an archived one to add to or move to, and one
// that doesn't exist all get this same answer, so nobody can probe for other
// users' IDs.
function categoryNotFound(c: Context) {
  return c.json({ code: 'CATEGORY_NOT_FOUND' as const, message: 'That Category isn’t available' }, 404)
}

// Someone else's Transaction and one that doesn't exist get this same answer.
function transactionNotFound(c: Context) {
  return c.json({ code: 'TRANSACTION_NOT_FOUND' as const, message: 'That Transaction isn’t available' }, 404)
}

// A Transaction's ID in the path. One that isn't an ID can't be anyone's, so
// it gets the same 404 as one that doesn't exist.
const idParam = validator('param', (value, c) => {
  const parsed = z.object({ id: z.uuid() }).safeParse(value)
  if (!parsed.success) return transactionNotFound(c)
  return parsed.data
})

export const transactions = new Hono<SignedInEnv>()
  .use(requireSession)
  .use(limitWrites)
  .get('/', validator('query', parseFor(periodQuerySchema)), async (c) => {
    const listing = await listPeriod(c.get('user').id, c.req.valid('query'))
    if (!listing) return categoryNotFound(c)
    return c.json(listing)
  })
  .post('/', validator('json', parseFor(newTransactionSchema)), async (c) => {
    const created = await createTransaction(c.get('user').id, c.req.valid('json'))
    if (!created) return categoryNotFound(c)
    return c.json(created, 201)
  })
  .get('/:id', idParam, async (c) => {
    const found = await findTransaction(c.get('user').id, c.req.valid('param').id)
    if (!found) return transactionNotFound(c)
    return c.json(found, 200)
  })
  .patch('/:id', idParam, validator('json', parseFor(transactionChangesSchema)), async (c) => {
    const result = await updateTransaction(c.get('user').id, c.req.valid('param').id, c.req.valid('json'))
    if ('updated' in result) return c.json(result.updated, 200)
    return result.notFound === 'category' ? categoryNotFound(c) : transactionNotFound(c)
  })
  .delete('/:id', idParam, async (c) => {
    const deleted = await deleteTransaction(c.get('user').id, c.req.valid('param').id)
    if (!deleted) return transactionNotFound(c)
    return c.body(null, 204)
  })
