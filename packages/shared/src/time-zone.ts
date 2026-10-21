import { z } from 'zod'

// Intl also accepts fixed offsets such as "+08:00". They aren't IANA names and
// have no daylight saving rules, so they're refused.
const FIXED_OFFSET = /^[+-]/

function canonicalTimeZone(zone: string): string | undefined {
  if (FIXED_OFFSET.test(zone)) return undefined
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions()
      .timeZone
  } catch {
    return undefined
  }
}

// An IANA time zone name, such as "Asia/Kuala_Lumpur", in its canonical
// spelling. Each user has one; "today", "this week" and "this month" are
// calculated in it.
export const timeZoneSchema = z
  .string({ error: 'Choose a time zone' })
  .max(64, 'Unknown time zone')
  .transform((zone, ctx) => {
    const canonical = canonicalTimeZone(zone)
    if (canonical === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Unknown time zone' })
      return z.NEVER
    }
    return canonical
  })
