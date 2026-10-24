import { z } from 'zod'
import { isCalendarMonth, monthOf } from './dates.js'
import { formatPeriodLabel } from './periods.js'
import { EARLIEST_DATE, latestDate } from './transactions.js'

// The month the Dashboard shows, for a user in `timeZone`. Its bounds are the
// months holding a Transaction's earliest and latest dates (v1-spec "The
// Dashboard").
export function dashboardMonthSchema(timeZone: string, now: Date = new Date()) {
  const latest = latestDate(timeZone, now)
  return z
    .string({ error: 'Enter a month' })
    // Stops here for a non-month, which the bounds can't say anything about.
    .refine(isCalendarMonth, { error: 'Enter a month', abort: true })
    .refine(
      (month) => month >= monthOf(EARLIEST_DATE),
      `Use a month from ${formatPeriodLabel('month', EARLIEST_DATE)}`,
    )
    .refine((month) => month <= monthOf(latest), `Use a month up to ${formatPeriodLabel('month', latest)}`)
}

// A Category's share of the month's Expenses, as a whole percentage: "34%".
// A share under 1% shows as "<1%", never "0%". Each share is rounded on its
// own, so a month's shares may not add up to 100%, and nothing adjusts them
// (v1-spec "The Dashboard").
export function formatShare(total: number, monthTotal: number): string {
  // A Category with Expenses means the month has some, so this is a bug.
  if (monthTotal <= 0) throw new Error(`No share of a month's Expenses of ${monthTotal}`)
  // Rounded half up in bigint: a month's total can pass what a number holds
  // exactly once it is multiplied by 100.
  const whole = BigInt(monthTotal)
  const percent = (200n * BigInt(total) + whole) / (2n * whole)
  return percent === 0n ? '<1%' : `${percent}%`
}
