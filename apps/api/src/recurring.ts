import {
  type CalendarDate,
  dueDateAfter,
  firstDueDateFrom,
  type NewRecurring,
  nextDueDateAfterChange,
  RECURRING_LIMIT,
  type RecurringChanges,
  sameSchedule,
  type Schedule,
} from '@for-wealth/shared'
import { and, asc, count, eq, isNull, lte, type SQL, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { categories, recurringTransactions, transactions, users } from './db/schema/index.js'
import { canFileUnder } from './transactions.js'

// Short for the table, which most of this file reads.
const rt = recurringTransactions

// A schedule from its columns: only the ones its frequency uses are set (the
// table's check).
export function scheduleOf(row: {
  frequency: Schedule['frequency']
  day: number | null
  weekday: number | null
  month: number | null
}): Schedule {
  switch (row.frequency) {
    case 'monthly':
      return { frequency: 'monthly', day: row.day! }
    case 'weekly':
      return { frequency: 'weekly', weekday: row.weekday! }
    case 'yearly':
      return { frequency: 'yearly', month: row.month!, day: row.day! }
  }
}

function scheduleColumns(schedule: Schedule) {
  return {
    frequency: schedule.frequency,
    day: schedule.frequency === 'weekly' ? null : schedule.day,
    weekday: schedule.frequency === 'weekly' ? schedule.weekday : null,
    month: schedule.frequency === 'yearly' ? schedule.month : null,
  }
}

// Joins a Recurring Transaction to its Category, inside one user's data, as
// for a Transaction (ADR 0004).
export const recurringCategory = and(eq(categories.userId, rt.userId), eq(categories.id, rt.categoryId))

// Creates a Transaction for every Due Date on or before `today`, the user's
// today in their time zone, that hasn't been created yet, each dated on its
// Due Date, and moves each Recurring Transaction's next Due Date on. Called
// before the user's Transactions, Dashboard or Recurring Transactions are
// read (ADR 0008). Whether a Transaction exists is never checked, so one
// deleted to skip its Due Date is never created again.
export async function catchUp(userId: string, today: CalendarDate) {
  const due = and(eq(rt.userId, userId), isNull(rt.stoppedAt), lte(rt.nextDueDate, today))
  // Most loads have nothing due, so they don't open a transaction.
  const [any] = await db.select({ id: rt.id }).from(rt).where(due).limit(1)
  if (!any) return

  await db.transaction(async (tx) => {
    // Locked, so a load catching up at the same moment waits, then finds
    // them moved on and creates nothing. The unique Due Date per Recurring
    // Transaction holds the line if it doesn't.
    const rows = await tx.select().from(rt).where(due).for('no key update')

    const created: (typeof transactions.$inferInsert)[] = []
    for (const row of rows) {
      const schedule = scheduleOf(row)
      let next = row.nextDueDate
      let last = row.lastDueDate
      for (; next <= today; next = dueDateAfter(schedule, next)) {
        created.push({
          userId,
          categoryId: row.categoryId,
          amount: row.amount,
          date: next,
          note: row.note,
          recurringTransactionId: row.id,
          dueDate: next,
          estimate: row.varies,
        })
        last = next
      }
      await tx
        .update(rt)
        .set({ nextDueDate: next, lastDueDate: last })
        .where(and(eq(rt.userId, userId), eq(rt.id, row.id)))
    }

    // In batches, well inside Postgres's limit on parameters per statement,
    // for a user back after a long time away.
    for (let i = 0; i < created.length; i += 1_000) {
      await tx
        .insert(transactions)
        .values(created.slice(i, i + 1_000))
        .onConflictDoNothing({ target: [transactions.recurringTransactionId, transactions.dueDate] })
    }
  })
}

// Recurring Transactions as the API shows them, with their Category, narrowed
// by `conditions` within the user's own.
function selectRecurring(userId: string, ...conditions: (SQL | undefined)[]) {
  return db
    .select({
      id: rt.id,
      amount: rt.amount,
      note: rt.note,
      varies: rt.varies,
      frequency: rt.frequency,
      day: rt.day,
      weekday: rt.weekday,
      month: rt.month,
      startDate: rt.startDate,
      nextDueDate: rt.nextDueDate,
      stoppedAt: rt.stoppedAt,
      category: { id: categories.id, name: categories.name, kind: categories.kind, archived: categories.archived },
    })
    .from(rt)
    .innerJoin(categories, recurringCategory)
    .where(and(eq(rt.userId, userId), ...conditions))
}

type RecurringRow = Awaited<ReturnType<typeof selectRecurring>>[number]

function shown({ frequency, day, weekday, month, stoppedAt, ...rest }: RecurringRow) {
  return {
    ...rest,
    schedule: scheduleOf({ frequency, day, weekday, month }),
    stoppedAt: stoppedAt?.toISOString() ?? null,
  }
}

// The user's Recurring Transactions: the ones that aren't stopped by next Due
// Date, and the stopped ones, most recently stopped first.
export async function listRecurring(userId: string) {
  const rows = await selectRecurring(userId).orderBy(asc(rt.nextDueDate), asc(rt.createdAt), asc(rt.id))
  const active = rows.filter((row) => !row.stoppedAt).map(shown)
  const stopped = rows
    .filter((row) => row.stoppedAt)
    .sort((a, b) => b.stoppedAt!.getTime() - a.stoppedAt!.getTime())
    .map(shown)
  return { active, stopped }
}

// One of the user's, stopped or not, or null when it isn't theirs.
async function findRecurring(userId: string, id: string) {
  const [found] = await selectRecurring(userId, eq(rt.id, id))
  return found ? shown(found) : null
}

// The user's Recurring Transactions that aren't stopped and are next due on
// or before `through`, for the Dashboard's Upcoming, oldest added first.
export async function dueThrough(userId: string, through: CalendarDate) {
  const rows = await selectRecurring(userId, isNull(rt.stoppedAt), lte(rt.nextDueDate, through)).orderBy(
    asc(rt.createdAt),
    asc(rt.id),
  )
  return rows.map(shown)
}

// Adds a Recurring Transaction, first due on the schedule's first Due Date on
// or after its start date. Says why when it can't: the Category isn't one of
// the user's that can be used, or they already have the most that aren't
// stopped.
export async function createRecurring(userId: string, { schedule, startDate, ...input }: NewRecurring) {
  if (!(await canFileUnder(userId, input.categoryId))) return { refused: 'category' } as const

  return db.transaction(async (tx) => {
    // Locked, so two adds at the same moment can't both pass the limit.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('no key update')
    const [held] = await tx
      .select({ active: count() })
      .from(rt)
      .where(and(eq(rt.userId, userId), isNull(rt.stoppedAt)))
    if (held!.active >= RECURRING_LIMIT) return { refused: 'limit' } as const

    const [created] = await tx
      .insert(rt)
      .values({
        userId,
        ...input,
        ...scheduleColumns(schedule),
        startDate,
        nextDueDate: firstDueDateFrom(schedule, startDate),
      })
      .returning({ id: rt.id })
    return { created: created! }
  })
}

// Changes the fields given, which reach only Transactions not yet created. A
// new schedule moves the next Due Date so that no period gets a second
// Transaction. A new Category must be one the user can file under; keeping
// the one it has is always allowed. Says which wasn't found: the Recurring
// Transaction (someone else's, or stopped) is checked before the Category.
export async function updateRecurring(userId: string, id: string, changes: RecurringChanges, today: CalendarDate) {
  const { schedule, ...fields } = changes
  const result = await db.transaction(async (tx) => {
    // Locked, so catching up can't move the next Due Date on while it's
    // worked out here.
    const [current] = await tx
      .select()
      .from(rt)
      .where(and(eq(rt.userId, userId), eq(rt.id, id), isNull(rt.stoppedAt)))
      .for('no key update')
    if (!current) return { notFound: 'recurring' } as const
    if (
      fields.categoryId !== undefined &&
      fields.categoryId !== current.categoryId &&
      !(await canFileUnder(userId, fields.categoryId))
    ) {
      return { notFound: 'category' } as const
    }

    const moved =
      schedule && !sameSchedule(schedule, scheduleOf(current))
        ? {
            ...scheduleColumns(schedule),
            nextDueDate: nextDueDateAfterChange({
              from: scheduleOf(current),
              to: schedule,
              lastDueDate: current.lastDueDate,
              startDate: current.startDate,
              today,
            }),
          }
        : {}
    const set = { ...fields, ...moved }
    if (Object.keys(set).length > 0) {
      await tx
        .update(rt)
        .set(set)
        .where(and(eq(rt.userId, userId), eq(rt.id, id)))
    }
    return { saved: true } as const
  })
  if ('notFound' in result) return result

  const found = await findRecurring(userId, id)
  return found ? { updated: found } : ({ notFound: 'recurring' } as const)
}

// Stops one of the user's, for good: it creates nothing more, and the
// Transactions it created stay. Stopping one already stopped keeps when it
// was first stopped. False when it isn't theirs.
export async function stopRecurring(userId: string, id: string) {
  const stopped = await db
    .update(rt)
    .set({ stoppedAt: sql`coalesce(${rt.stoppedAt}, now())` })
    .where(and(eq(rt.userId, userId), eq(rt.id, id)))
    .returning({ id: rt.id })
  return stopped.length > 0
}
