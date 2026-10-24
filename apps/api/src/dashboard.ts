import { type CalendarMonth, type CategoryKind, firstDayOf, periodRange } from '@for-wealth/shared'
import { and, asc, between, desc, eq, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { categories, transactions } from './db/schema/index.js'
import { ownCategory } from './transactions.js'

// One month of the user's Transactions, summed in Postgres per Category: the
// month's Income and Expense totals, and its Expenses by Category in display
// order. Every Transaction dated in the month counts, later than today too.
export async function monthDashboard(userId: string, month: CalendarMonth) {
  const { from, to } = periodRange('month', firstDayOf(month))
  // A sum of bigints is numeric in Postgres, which the driver sends as a string.
  const total = sql<number>`sum(${transactions.amount})::bigint`.mapWith(Number)

  // Largest total first; equal totals fall back to the Category's position.
  // Categories with no Transactions that month have no row, so they're left
  // out, and an archived Category with some is still listed.
  const rows = await db
    .select({
      kind: categories.kind,
      category: { id: categories.id, name: categories.name, archived: categories.archived },
      total,
    })
    .from(transactions)
    .innerJoin(categories, ownCategory)
    .where(and(eq(transactions.userId, userId), between(transactions.date, from, to)))
    .groupBy(categories.id)
    .orderBy(desc(total), asc(categories.position), asc(categories.id))

  // Each kind's total is the sum of its Categories' totals. The kind comes
  // from the Category (ADR 0005).
  const totals: Record<CategoryKind, number> = { income: 0, expense: 0 }
  for (const row of rows) totals[row.kind] += row.total

  return {
    month,
    totals,
    expenseCategories: rows
      .filter((row) => row.kind === 'expense')
      .map(({ category, total }) => ({ category, total })),
  }
}
