import { z } from 'zod'
import { type CalendarDate, type CalendarMonth, daysInMonth, isCalendarMonth, monthOf } from './dates.js'
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

// How much of `left` minor units can be spent each day: ÷ the days left in
// the month, counting today in the user's time zone. Rounded down to a whole
// minor unit, so it never shows more than is really left. Only this month
// has one; null for a past or future month. For a Budget's money left and for
// Remaining alike (v1-spec "Budgets").
export function perDayLeft(left: number, month: CalendarMonth, today: CalendarDate): number | null {
  if (monthOf(today) !== month) return null
  const [year, monthNumber, day] = today.split('-').map(Number) as [number, number, number]
  const daysLeft = daysInMonth(year, monthNumber) - day + 1
  return Math.floor(left / daysLeft)
}

// A month's Income and Expenses, in minor units.
export interface KindTotals {
  income: number
  expense: number
}

// A month's plan (v1-spec "Dashboard maths"), from its Transactions,
// `recorded`, the part of those a Recurring Transaction created, and its
// Upcoming Due Dates, at their Recurring Transactions' amounts.
export function monthPlan({
  recorded,
  fromRecurring,
  upcoming,
}: {
  recorded: KindTotals
  fromRecurring: KindTotals
  upcoming: KindTotals
}) {
  const expectedIncome = recorded.income + upcoming.income
  const commitments = fromRecurring.expense + upcoming.expense
  const freeToSpend = expectedIncome - commitments
  const remaining = freeToSpend - (recorded.expense - fromRecurring.expense)
  return { expectedIncome, commitments, freeToSpend, remaining }
}

// How far a month's Budgets, plus its Commitments in Expense Categories
// without one, go past Expected Income, or null when they don't. A Commitment
// in a budgeted Category is covered by that Budget, so it isn't counted twice
// (v1-spec "The Dashboard in slice 5").
export function budgetsOverBy({
  limits,
  commitmentsByCategory,
  expectedIncome,
}: {
  limits: readonly { categoryId: string; limit: number | null }[]
  commitmentsByCategory: Readonly<Record<string, number>>
  expectedIncome: number
}): number | null {
  const budgeted = new Set<string>()
  let planned = 0
  for (const { categoryId, limit } of limits) {
    if (limit === null) continue
    budgeted.add(categoryId)
    planned += limit
  }
  for (const [categoryId, amount] of Object.entries(commitmentsByCategory)) {
    if (!budgeted.has(categoryId)) planned += amount
  }
  return planned > expectedIncome ? planned - expectedIncome : null
}
