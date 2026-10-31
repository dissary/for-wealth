import { z } from 'zod'
import type { CategoryKind } from './categories.js'
import { type CalendarDate, type CalendarMonth, daysInMonth, firstDayOf, isCalendarMonth, monthOf } from './dates.js'
import { formatPeriodLabel, periodRange } from './periods.js'
import { dueDatesBetween, type Schedule } from './recurring.js'
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
type KindTotals = Record<CategoryKind, number>

// For sorting strings that compare with < and >: calendar dates, and IDs in
// the order Postgres gives them.
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// One Category's Transactions dated in the month: their total, and the part
// of it Recurring Transactions created, at their current amounts, both in
// minor units.
export interface CategoryMonth {
  category: { id: string; name: string; kind: CategoryKind; archived: boolean; position: number }
  total: number
  fromRecurring: number
}

// A Recurring Transaction that isn't stopped, with its next Due Date, the
// first not yet created.
export interface ActiveRecurringTransaction {
  id: string
  nextDueDate: CalendarDate
  amount: number
  schedule: Schedule
  varies: boolean
  note: string | null
  category: { id: string; name: string; kind: CategoryKind; archived: boolean }
}

// A month's Dashboard figures (v1-spec "Dashboard maths" and "The Dashboard
// in slice 5"), from its Transactions summed per Category (`categories`,
// Categories with none left out), the Recurring Transactions that aren't
// stopped, and the month's Budgets, in position order. Every Due Date from
// each one's next on is Upcoming, so they must have caught up first.
export function monthFigures({
  month,
  categories,
  recurring,
  budgets,
}: {
  month: CalendarMonth
  categories: readonly CategoryMonth[]
  recurring: readonly ActiveRecurringTransaction[]
  budgets: readonly { category: { id: string; name: string; archived: boolean }; limit: number | null }[]
}) {
  const { from, to } = periodRange('month', firstDayOf(month))

  // Each kind's total is the sum of its Categories' totals. The kind comes
  // from the Category (ADR 0005).
  const totals: KindTotals = { income: 0, expense: 0 }
  const recurringTotals: KindTotals = { income: 0, expense: 0 }
  // Expense Category ID to its Commitments: created and Upcoming alike.
  const commitmentsByCategory: Record<string, number> = {}
  for (const { category, total, fromRecurring } of categories) {
    totals[category.kind] += total
    recurringTotals[category.kind] += fromRecurring
    if (category.kind === 'expense' && fromRecurring > 0) commitmentsByCategory[category.id] = fromRecurring
  }

  // The month's Due Dates not yet created, in date order, at each Recurring
  // Transaction's amount. None for a past month: everything due is created.
  const upcoming = recurring
    .flatMap(({ id, nextDueDate, amount, schedule, varies, note, category }) =>
      dueDatesBetween(schedule, nextDueDate > from ? nextDueDate : from, to).map((dueDate) => ({
        recurringTransactionId: id,
        dueDate,
        amount,
        estimate: varies,
        note,
        category,
      })),
    )
    .sort((a, b) => byText(a.dueDate, b.dueDate))
  const upcomingTotals: KindTotals = { income: 0, expense: 0 }
  for (const { amount, category } of upcoming) {
    upcomingTotals[category.kind] += amount
    if (category.kind === 'expense') {
      commitmentsByCategory[category.id] = (commitmentsByCategory[category.id] ?? 0) + amount
    }
  }

  const expectedIncome = totals.income + upcomingTotals.income
  const commitments = recurringTotals.expense + upcomingTotals.expense
  const freeToSpend = expectedIncome - commitments
  const remaining = freeToSpend - (totals.expense - recurringTotals.expense)

  // Largest total first; equal totals fall back to the Category's position.
  // An archived Category with Expenses that month is still listed. A
  // Category with a Budget has a row even with no Expenses that month: those
  // total 0, so they come last, in position order. An archived Category
  // keeps the limits it had before it was archived.
  const limits = new Map(budgets.map(({ category, limit }) => [category.id, limit]))
  const spentRows = categories
    .filter(({ category }) => category.kind === 'expense')
    .sort(
      (a, b) =>
        b.total - a.total ||
        a.category.position - b.category.position ||
        byText(a.category.id, b.category.id),
    )
    .map(({ category: { id, name, archived }, total }) => ({
      category: { id, name, archived },
      total,
      budget: limits.get(id) ?? null,
    }))
  const spentIds = new Set(spentRows.map((row) => row.category.id))
  const unspentRows = budgets
    .filter(({ category, limit }) => limit !== null && !spentIds.has(category.id))
    .map(({ category: { id, name, archived }, limit }) => ({
      category: { id, name, archived },
      total: 0,
      budget: limit,
    }))

  return {
    totals,
    plan: { expectedIncome, commitments, freeToSpend, remaining },
    commitmentsByCategory,
    budgetsOverBy: budgetsOverBy({
      limits: budgets.map(({ category, limit }) => ({ categoryId: category.id, limit })),
      commitmentsByCategory,
      expectedIncome,
    }),
    expenseCategories: [...spentRows, ...unspentRows],
    upcoming,
  }
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
