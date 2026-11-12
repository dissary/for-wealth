import { type CalendarMonth, firstDayOf, monthOf, periodRange, trendsMonths } from '@for-wealth/shared'
import { and, between, eq, min, sql } from 'drizzle-orm'
import { categoryLimits } from './budgets.js'
import { db } from './db/client.js'
import { categories, transactions } from './db/schema/index.js'
import { ownCategory } from './transactions.js'

// The months of the Trends window ending with `to`, and `first`, the month of
// the user's earliest Transaction, or null with none, which starts it.
async function trendsWindow(userId: string, to: CalendarMonth) {
  const [earliest] = await db
    .select({ date: min(transactions.date) })
    .from(transactions)
    .where(eq(transactions.userId, userId))
  const first = earliest?.date ? monthOf(earliest.date) : null
  return { first, window: trendsMonths(to, first) }
}

// Transactions dated in the window's months, oldest first and not empty.
function within(window: readonly CalendarMonth[]) {
  return between(transactions.date, firstDayOf(window[0]!), periodRange('month', firstDayOf(window.at(-1)!)).to)
}

// A Transaction's month, as the API names it.
const monthOfDate = sql<CalendarMonth>`to_char(${transactions.date}, 'YYYY-MM')`

// The user's Income and Expenses for each month of the Trends window ending
// with `to`, summed in Postgres, oldest first (v1-spec "Trends"). `first` is
// the month of their earliest Transaction, or null with none; months before
// it are left out, and months in the window with nothing recorded are 0.
// Every Transaction dated in a month counts, later than today too.
export async function monthTrends(userId: string, to: CalendarMonth) {
  const { first, window } = await trendsWindow(userId, to)
  if (window.length === 0) return { to, first, months: [] }

  // A sum of bigints is numeric in Postgres, which the driver sends as a
  // string. The kind comes from the Category (ADR 0005).
  const totalOf = (kind: 'income' | 'expense') =>
    sql<number>`coalesce(sum(${transactions.amount}) filter (where ${categories.kind} = ${kind}), 0)::bigint`.mapWith(
      Number,
    )
  const rows = await db
    .select({ month: monthOfDate, income: totalOf('income'), expense: totalOf('expense') })
    .from(transactions)
    .innerJoin(categories, ownCategory)
    .where(
      and(
        eq(transactions.userId, userId),
        within(window),
      ),
    )
    .groupBy(monthOfDate)

  const byMonth = new Map(rows.map((row) => [row.month, row]))
  return {
    to,
    first,
    months: window.map((month) => {
      const row = byMonth.get(month)
      return { month, income: row?.income ?? 0, expense: row?.expense ?? 0 }
    }),
  }
}

// One of the user's Categories each month of the same Trends window as
// monthTrends, set by their earliest Transaction of any Category, not this
// one's (v1-spec "Trends"). An archived Category of theirs works too. Null
// when the Category isn't theirs or doesn't exist, which the route answers
// alike.
export async function categoryTrends(userId: string, to: CalendarMonth, categoryId: string) {
  const [category] = await db
    .select({ id: categories.id, name: categories.name, kind: categories.kind, archived: categories.archived })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
  if (!category) return null

  const { first, window } = await trendsWindow(userId, to)
  if (window.length === 0) return { to, first, category, months: [] }

  const rows = await db
    .select({
      month: monthOfDate,
      total: sql<number>`coalesce(sum(${transactions.amount}), 0)::bigint`.mapWith(Number),
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, category.id), within(window)))
    .groupBy(monthOfDate)

  // Only an Expense Category has a Budget.
  const limits = category.kind === 'expense' ? await categoryLimits(userId, category.id, window) : []
  const byMonth = new Map(rows.map((row) => [row.month, row.total]))
  return {
    to,
    first,
    category,
    months: window.map((month, i) => ({ month, total: byMonth.get(month) ?? 0, budget: limits[i] ?? null })),
  }
}
