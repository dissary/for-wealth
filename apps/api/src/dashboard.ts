import { type CalendarMonth, firstDayOf, monthFigures, periodRange } from '@for-wealth/shared'
import { and, between, eq, sql } from 'drizzle-orm'
import { monthBudgets } from './budgets.js'
import { db } from './db/client.js'
import { categories, transactions } from './db/schema/index.js'
import { dueThrough } from './recurring.js'
import { listEstimates, ownCategory } from './transactions.js'

// One month of the user's Transactions, summed in Postgres per Category, and
// the figures worked out from them (monthFigures): the month's Income and
// Expense totals, its plan, its Expenses by Category with their Budgets, and
// its Upcoming Due Dates. Also every unconfirmed Estimate. Every Transaction
// dated in the month counts, later than today too. The user's Recurring
// Transactions must have caught up first, so every Due Date from each one's
// next on is Upcoming.
export async function monthDashboard(userId: string, month: CalendarMonth) {
  const { from, to } = periodRange('month', firstDayOf(month))
  // A sum of bigints is numeric in Postgres, which the driver sends as a string.
  const total = sql<number>`sum(${transactions.amount})::bigint`.mapWith(Number)
  // The part Recurring Transactions created, at their current amounts.
  const createdByRecurring = sql`${transactions.recurringTransactionId} is not null`
  const fromRecurring = sql<number>`coalesce(sum(${transactions.amount}) filter (where ${createdByRecurring}), 0)::bigint`
    .mapWith(Number)

  // Categories with no Transactions that month have no row.
  const categoryMonths = db
    .select({
      category: {
        id: categories.id,
        name: categories.name,
        kind: categories.kind,
        archived: categories.archived,
        position: categories.position,
      },
      total,
      fromRecurring,
    })
    .from(transactions)
    .innerJoin(categories, ownCategory)
    .where(and(eq(transactions.userId, userId), between(transactions.date, from, to)))
    .groupBy(categories.id)
  const [rows, budgets, recurring, estimates] = await Promise.all([
    categoryMonths,
    monthBudgets(userId, month),
    dueThrough(userId, to),
    listEstimates(userId),
  ])

  return { month, ...monthFigures({ month, categories: rows, recurring, budgets }), estimates }
}
