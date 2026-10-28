import { dashboardMonthSchema, todayIn } from '@for-wealth/shared'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import { catchUp } from '../recurring.js'
import type { SignedInEnv } from '../require-session.js'

// One month and nothing else, so no arbitrary ranges, for the Dashboard and
// Budgets alike. Today, and so the month's bounds, are taken in the user's
// own time zone.
export function monthQuerySchema(timeZone: string) {
  return z.strictObject({ month: dashboardMonthSchema(timeZone) })
}

// Someone else's Category, one that can't be used, one that doesn't exist and
// an ID that isn't an ID all get this same answer, so nobody can probe for
// other users' IDs.
export function categoryNotFound(c: Context) {
  return c.json({ code: 'CATEGORY_NOT_FOUND' as const, message: 'That Category isn’t available' }, 404)
}

// For routes that read the user's Transactions or Recurring Transactions:
// every Due Date up to today, in the user's time zone, becomes a Transaction
// first (ADR 0008).
export const catchingUp = createMiddleware<SignedInEnv>(async (c, next) => {
  const user = c.get('user')
  await catchUp(user.id, todayIn(user.timeZone))
  await next()
})
