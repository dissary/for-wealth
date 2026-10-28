import { type CalendarMonth, type CategoryKind, firstDayOf, periodRange } from '@for-wealth/shared'
import { and, asc, between, desc, eq, sql } from 'drizzle-orm'
import { monthBudgets } from './budgets.js'
import { db } from './db/client.js'
import { categories, transactions } from './db/schema/index.js'
import { ownCategory } from './transactions.js'

// One month of the user's Transactions, summed in Postgres per Category: the
// month's Income and Expense totals, and its Expenses by Category in display
// order, each with the month's Budget limit or null. Every Transaction dated
// in the month counts, later than today too.
export async function monthDashboard(userId: string, month: CalendarMonth) {
  const { from, to } = periodRange('month', firstDayOf(month))
  // A sum of bigints is numeric in Postgres, which the driver sends as a string.
  const total = sql<number>`sum(${transactions.amount})::bigint`.mapWith(Number)

  // Largest total first; equal totals fall back to the Category's position.
  // Categories with no Transactions that month have no row, so they're left
  // out, and an archived Category with some is still listed.
  const rowsQuery = db
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
  const [rows, budgets] = await Promise.all([rowsQuery, monthBudgets(userId, month)])

  // Each kind's total is the sum of its Categories' totals. The kind comes
  // from the Category (ADR 0005).
  const totals: Record<CategoryKind, number> = { income: 0, expense: 0 }
  for (const row of rows) totals[row.kind] += row.total

  // A Category with a Budget has a row even with no Expenses that month.
  // Those rows total 0, so they come last, already in position order. Only
  // Categories that aren't archived have Budgets in slice 4.
  const limits = new Map(budgets.map(({ category, limit }) => [category.id, limit]))
  const spentRows = rows
    .filter((row) => row.kind === 'expense')
    .map(({ category, total }) => ({ category, total, budget: limits.get(category.id) ?? null }))
  const spentIds = new Set(spentRows.map((row) => row.category.id))
  const unspentRows = budgets
    .filter(({ category, limit }) => limit !== null && !spentIds.has(category.id))
    .map(({ category, limit }) => ({ category: { ...category, archived: false }, total: 0, budget: limit }))

  return { month, totals, expenseCategories: [...spentRows, ...unspentRows] }
}
