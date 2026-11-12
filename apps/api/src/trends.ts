import { type CalendarMonth, firstDayOf, monthOf, periodRange, trendsMonths } from '@for-wealth/shared'
import { and, between, eq, min, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { categories, transactions } from './db/schema/index.js'
import { ownCategory } from './transactions.js'

// The user's Income and Expenses for each month of the Trends window ending
// with `to`, summed in Postgres, oldest first (v1-spec "Trends"). `first` is
// the month of their earliest Transaction, or null with none; months before
// it are left out, and months in the window with nothing recorded are 0.
// Every Transaction dated in a month counts, later than today too.
export async function monthTrends(userId: string, to: CalendarMonth) {
  const [earliest] = await db
    .select({ date: min(transactions.date) })
    .from(transactions)
    .where(eq(transactions.userId, userId))
  const first = earliest?.date ? monthOf(earliest.date) : null

  const window = trendsMonths(to, first)
  if (window.length === 0) return { to, first, months: [] }

  // A sum of bigints is numeric in Postgres, which the driver sends as a
  // string. The kind comes from the Category (ADR 0005).
  const totalOf = (kind: 'income' | 'expense') =>
    sql<number>`coalesce(sum(${transactions.amount}) filter (where ${categories.kind} = ${kind}), 0)::bigint`.mapWith(
      Number,
    )
  const month = sql<CalendarMonth>`to_char(${transactions.date}, 'YYYY-MM')`
  const rows = await db
    .select({ month, income: totalOf('income'), expense: totalOf('expense') })
    .from(transactions)
    .innerJoin(categories, ownCategory)
    .where(
      and(
        eq(transactions.userId, userId),
        between(transactions.date, firstDayOf(window[0]!), periodRange('month', firstDayOf(to)).to),
      ),
    )
    .groupBy(month)

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
