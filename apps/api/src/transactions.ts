import { type CalendarDate, type CategoryKind, type NewTransaction, type Period, periodRange } from '@for-wealth/shared'
import { and, between, desc, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { categories, transactions } from './db/schema/index.js'

// Adds a Transaction for the user, or returns null when the Category isn't
// one of theirs: someone else's, archived, or no Category at all, which the
// route answers alike so nobody can probe for other users' IDs. The database
// refuses another user's Category too (transactions' foreign key).
export async function createTransaction(userId: string, input: NewTransaction) {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.userId, userId), eq(categories.id, input.categoryId), eq(categories.archived, false)),
    )
  if (!category) return null

  const [created] = await db
    .insert(transactions)
    .values({ userId, ...input })
    .returning({ id: transactions.id })
  return created!
}

// Every Transaction in the Period holding `date`, newest date first and most
// recently added first within a day, each with its Category's name and kind,
// and the Period's Income and Expense totals. There's no paging: a Period is
// at most a month of one person's spending.
//
// With a Category, the list and totals cover only that Category. Returns null
// when it isn't one of the user's, answered alike for someone else's and one
// that doesn't exist. An archived Category is still theirs, and old
// Transactions keep it, so it can still be browsed.
export async function listPeriod(
  userId: string,
  query: { period: Period; date: CalendarDate; category?: string | undefined },
) {
  const { period, date } = query
  let category = null
  if (query.category) {
    ;[category] = await db
      .select({ id: categories.id, name: categories.name, kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, query.category)))
    if (!category) return null
  }

  const { from, to } = periodRange(period, date)
  const rows = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      date: transactions.date,
      note: transactions.note,
      category: { id: categories.id, name: categories.name, kind: categories.kind },
    })
    .from(transactions)
    .innerJoin(
      categories,
      and(eq(categories.userId, transactions.userId), eq(categories.id, transactions.categoryId)),
    )
    .where(
      and(
        eq(transactions.userId, userId),
        between(transactions.date, from, to),
        category ? eq(transactions.categoryId, category.id) : undefined,
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))

  // Every Transaction in the Period is returned, so the totals are summed
  // from the same rows the list shows. The kind comes from the Category
  // (ADR 0005).
  const totals: Record<CategoryKind, number> = { income: 0, expense: 0 }
  for (const row of rows) totals[row.category.kind] += row.amount

  return { period, date, category, totals, transactions: rows }
}
