import {
  budgetsOverBy,
  type CalendarMonth,
  dueDatesBetween,
  firstDayOf,
  type KindTotals,
  monthPlan,
  periodRange,
} from '@for-wealth/shared'
import { and, asc, between, desc, eq, sql } from 'drizzle-orm'
import { monthBudgets } from './budgets.js'
import { db } from './db/client.js'
import { categories, transactions } from './db/schema/index.js'
import { dueThrough } from './recurring.js'
import { listEstimates, ownCategory } from './transactions.js'

// One month of the user's Transactions, summed in Postgres per Category, and
// its Upcoming Due Dates: the month's Income and Expense totals, its plan
// (Expected Income, Commitments, Free to Spend, Remaining), its Expenses by
// Category in display order, each with the month's Budget limit or null,
// and every unconfirmed Estimate. Every Transaction dated in the month
// counts, later than today too. The user's Recurring Transactions must have
// caught up first, so every Due Date from each one's next on is Upcoming.
export async function monthDashboard(userId: string, month: CalendarMonth) {
  const { from, to } = periodRange('month', firstDayOf(month))
  // A sum of bigints is numeric in Postgres, which the driver sends as a string.
  const total = sql<number>`sum(${transactions.amount})::bigint`.mapWith(Number)
  // The part Recurring Transactions created, at their current amounts.
  const createdByRecurring = sql`${transactions.recurringTransactionId} is not null`
  const fromRecurring = sql<number>`coalesce(sum(${transactions.amount}) filter (where ${createdByRecurring}), 0)::bigint`
    .mapWith(Number)

  // Largest total first; equal totals fall back to the Category's position.
  // Categories with no Transactions that month have no row, so they're left
  // out, and an archived Category with some is still listed.
  const rowsQuery = db
    .select({
      kind: categories.kind,
      category: { id: categories.id, name: categories.name, archived: categories.archived },
      total,
      fromRecurring,
    })
    .from(transactions)
    .innerJoin(categories, ownCategory)
    .where(and(eq(transactions.userId, userId), between(transactions.date, from, to)))
    .groupBy(categories.id)
    .orderBy(desc(total), asc(categories.position), asc(categories.id))
  const [rows, budgets, recurring, estimates] = await Promise.all([
    rowsQuery,
    monthBudgets(userId, month),
    dueThrough(userId, to),
    listEstimates(userId),
  ])

  // Each kind's total is the sum of its Categories' totals. The kind comes
  // from the Category (ADR 0005).
  const totals: KindTotals = { income: 0, expense: 0 }
  const recurringTotals: KindTotals = { income: 0, expense: 0 }
  // Expense Category ID to its Commitments: created and Upcoming alike.
  const commitmentsByCategory: Record<string, number> = {}
  for (const row of rows) {
    totals[row.kind] += row.total
    recurringTotals[row.kind] += row.fromRecurring
    if (row.kind === 'expense' && row.fromRecurring > 0) commitmentsByCategory[row.category.id] = row.fromRecurring
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
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
  const upcomingTotals: KindTotals = { income: 0, expense: 0 }
  for (const { amount, category } of upcoming) {
    upcomingTotals[category.kind] += amount
    if (category.kind === 'expense') {
      commitmentsByCategory[category.id] = (commitmentsByCategory[category.id] ?? 0) + amount
    }
  }

  const plan = monthPlan({ recorded: totals, fromRecurring: recurringTotals, upcoming: upcomingTotals })

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

  return {
    month,
    totals,
    plan,
    commitmentsByCategory,
    budgetsOverBy: budgetsOverBy({
      limits: budgets.map(({ category, limit }) => ({ categoryId: category.id, limit })),
      commitmentsByCategory,
      expectedIncome: plan.expectedIncome,
    }),
    expenseCategories: [...spentRows, ...unspentRows],
    upcoming,
    estimates,
  }
}
