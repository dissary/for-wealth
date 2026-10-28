import { dashboardMonthSchema } from '@for-wealth/shared'
import type { Context } from 'hono'
import { z } from 'zod'

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
