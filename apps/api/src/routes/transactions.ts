import { categoryIdSchema, newTransactionSchema, periodSchema, transactionDateSchema } from '@for-wealth/shared'
import { type Context, Hono } from 'hono'
import { validator } from 'hono/validator'
import { z } from 'zod'
import { requireSession, type SignedInEnv } from '../require-session.js'
import { createTransaction, listPeriod } from '../transactions.js'
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

// Parses with the schema for this user, or answers 400 saying which fields
// are wrong and why.
function parseFor<T extends z.ZodType>(schemaFor: (timeZone: string) => T) {
  return (value: unknown, c: Context<SignedInEnv>) => {
    const parsed = schemaFor(c.get('user').timeZone).safeParse(value)
    if (parsed.success) return parsed.data as z.output<T>
    return c.json(
      {
        code: 'INVALID_INPUT' as const,
        message: 'Check the highlighted fields',
        fields: z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>,
      },
      400,
    )
  }
}

// Someone else's Category, an archived one when adding, and one that doesn't
// exist all get this same answer, so nobody can probe for other users' IDs.
function categoryNotFound(c: Context) {
  return c.json({ code: 'CATEGORY_NOT_FOUND' as const, message: 'That Category isn’t available' }, 404)
}

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
