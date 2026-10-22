import { newTransactionSchema, transactionDateSchema } from '@for-wealth/shared'
import { type Context, Hono } from 'hono'
import { validator } from 'hono/validator'
import { z } from 'zod'
import { requireSession, type SignedInEnv } from '../require-session.js'
import { createTransaction, listDay } from '../transactions.js'
import { limitWrites } from '../write-limit.js'

// Today, and so the bounds on a date, are taken in the user's own time zone.
function dayQuerySchema(timeZone: string) {
  return z.object({
    period: z.literal('day', { error: 'Choose a Period' }),
    date: transactionDateSchema(timeZone),
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

export const transactions = new Hono<SignedInEnv>()
  .use(requireSession)
  .use(limitWrites)
  .get('/', validator('query', parseFor(dayQuerySchema)), async (c) => {
    const { date } = c.req.valid('query')
    return c.json(await listDay(c.get('user').id, date))
  })
  .post('/', validator('json', parseFor(newTransactionSchema)), async (c) => {
    const created = await createTransaction(c.get('user').id, c.req.valid('json'))
    if (!created) {
      return c.json({ code: 'CATEGORY_NOT_FOUND' as const, message: 'That Category isn’t available' }, 404)
    }
    return c.json(created, 201)
  })
