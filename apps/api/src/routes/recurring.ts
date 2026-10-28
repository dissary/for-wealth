import { newRecurringSchema, recurringChangesSchema, todayIn } from '@for-wealth/shared'
import { type Context, Hono } from 'hono'
import { validator } from 'hono/validator'
import { z } from 'zod'
import { parseFor } from '../parse-for.js'
import { catchUp, createRecurring, listRecurring, stopRecurring, updateRecurring } from '../recurring.js'
import { requireSession, type SignedInEnv } from '../require-session.js'
import { limitWrites } from '../write-limit.js'
import { catchingUp, categoryNotFound } from './shared.js'

// Someone else's, one that doesn't exist and, for editing, a stopped one all
// get this same answer.
function recurringNotFound(c: Context) {
  return c.json({ code: 'RECURRING_NOT_FOUND' as const, message: 'That Recurring Transaction isn’t available' }, 404)
}

// The most that aren't stopped are already there, so catching up stays cheap.
function recurringLimit(c: Context) {
  return c.json(
    { code: 'RECURRING_LIMIT' as const, message: 'Stop a Recurring Transaction before adding another' },
    409,
  )
}

// An ID in the path. One that isn't an ID can't be anyone's, so it gets the
// same 404 as one that doesn't exist.
const idParam = validator('param', (value, c) => {
  const parsed = z.object({ id: z.uuid() }).safeParse(value)
  if (!parsed.success) return recurringNotFound(c)
  return parsed.data
})

export const recurring = new Hono<SignedInEnv>()
  .use(requireSession)
  .use(limitWrites)
  .get('/', catchingUp, async (c) => {
    return c.json(await listRecurring(c.get('user').id))
  })
  .post('/', validator('json', parseFor(newRecurringSchema)), async (c) => {
    const result = await createRecurring(c.get('user').id, c.req.valid('json'))
    if ('created' in result) return c.json(result.created, 201)
    return result.refused === 'category' ? categoryNotFound(c) : recurringLimit(c)
  })
  .patch('/:id', idParam, validator('json', parseFor(() => recurringChangesSchema)), async (c) => {
    const user = c.get('user')
    const today = todayIn(user.timeZone)
    // So the change reaches exactly the Transactions not yet created
    // (ADR 0008).
    await catchUp(user.id, today)
    const result = await updateRecurring(user.id, c.req.valid('param').id, c.req.valid('json'), today)
    if ('updated' in result) return c.json(result.updated, 200)
    return result.notFound === 'category' ? categoryNotFound(c) : recurringNotFound(c)
  })
  .post('/:id/stop', idParam, async (c) => {
    const user = c.get('user')
    // Anything due up to today is created before it stops, so stopping on a
    // Due Date keeps that day's Transaction (ADR 0008).
    await catchUp(user.id, todayIn(user.timeZone))
    const stopped = await stopRecurring(user.id, c.req.valid('param').id)
    if (!stopped) return recurringNotFound(c)
    return c.body(null, 204)
  })
