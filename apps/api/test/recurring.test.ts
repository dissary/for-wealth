import {
  addDays,
  addMonths,
  addYears,
  dueDatesBetween,
  firstDayOf,
  isoWeekday,
  monthOf,
  periodRange,
  RECURRING_LIMIT,
  todayIn,
} from '@for-wealth/shared'
import { and, asc, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, pool } from '../src/db/client.js'
import { categories, recurringTransactions, transactions, users } from '../src/db/schema/index.js'
import {
  deleteTransaction,
  getCategories,
  getDashboard,
  getRecurring,
  getTransactions,
  NEW_USER,
  OTHER_USER,
  patchRecurring,
  patchTransaction,
  postRecurring,
  postTransaction,
  putBudgets,
  signInNewUser,
  startFresh,
  stopRecurring,
} from './helpers.js'

type Categories = { income: { id: string; name: string }[]; expense: { id: string; name: string }[] }

// The signed-in user's Categories of one kind, by name.
async function categoryIds(cookie: string, kind: keyof Categories) {
  const all = (await (await getCategories(cookie)).json()) as Categories
  return Object.fromEntries(all[kind].map((c) => [c.name, c.id])) as Record<string, string>
}

// Today in the user's zone (Kuala Lumpur), and the months around it.
const TODAY = todayIn(NEW_USER.timeZone)
const MONTH = monthOf(TODAY)
const NEXT_MONTH = monthOf(addMonths(firstDayOf(MONTH), 1))
const LAST_MONTH = monthOf(addMonths(firstDayOf(MONTH), -1))
// Every week on today's weekday, so a Due Date falls on today.
const ON_TODAYS_WEEKDAY = { frequency: 'weekly', weekday: isoWeekday(TODAY) } as const

async function added(cookie: string, body: Record<string, unknown>) {
  const res = await postRecurring(cookie, { note: null, varies: false, startDate: TODAY, ...body })
  if (res.status !== 201) throw new Error(`Adding a Recurring Transaction failed: ${res.status}`)
  return ((await res.json()) as { id: string }).id
}

// As if it had been set up on `date`: time can't pass in a test, so its start
// and next Due Date are moved back instead.
async function backdate(id: string, date: string) {
  await db
    .update(recurringTransactions)
    .set({ startDate: date, nextDueDate: date })
    .where(eq(recurringTransactions.id, id))
}

// The Transactions a Recurring Transaction created, in date order.
function createdBy(id: string) {
  return db
    .select({
      date: transactions.date,
      dueDate: transactions.dueDate,
      amount: transactions.amount,
      note: transactions.note,
      estimate: transactions.estimate,
    })
    .from(transactions)
    .where(eq(transactions.recurringTransactionId, id))
    .orderBy(asc(transactions.date))
}

type Listing = {
  active: { id: string; nextDueDate: string; amount: number; schedule: unknown }[]
  stopped: { id: string; stoppedAt: string }[]
}

async function listing(cookie: string) {
  const res = await getRecurring(cookie)
  if (res.status !== 200) throw new Error(`Loading Recurring Transactions failed: ${res.status}`)
  return (await res.json()) as Listing
}

type Dashboard = {
  plan: { expectedIncome: number; commitments: number; freeToSpend: number; remaining: number }
  commitmentsByCategory: Record<string, number>
  budgetsOverBy: number | null
  expenseCategories: { category: { id: string }; total: number }[]
  upcoming: { recurringTransactionId: string; dueDate: string; amount: number; estimate: boolean }[]
  estimates: { id: string; amount: number; estimate: boolean }[]
}

async function dashboardFor(cookie: string, month: string) {
  const res = await getDashboard(cookie, { month })
  if (res.status !== 200) throw new Error(`Loading the Dashboard failed: ${res.status}`)
  return (await res.json()) as Dashboard
}

beforeEach(async () => {
  await startFresh()
})
afterAll(() => pool.end())

describe('POST /api/recurring', () => {
  it('adds one, first due on the schedule’s first Due Date from its start', async () => {
    const cookie = await signInNewUser()
    const { Housing } = await categoryIds(cookie, 'expense')
    const tomorrow = { frequency: 'weekly', weekday: isoWeekday(addDays(TODAY, 1)) }

    const res = await postRecurring(cookie, {
      categoryId: Housing,
      amount: 150_000,
      note: ' Rent ',
      varies: false,
      schedule: tomorrow,
      startDate: TODAY,
    })

    expect(res.status).toBe(201)
    expect(await listing(cookie)).toEqual({
      active: [
        {
          id: ((await res.json()) as { id: string }).id,
          amount: 150_000,
          note: 'Rent',
          varies: false,
          schedule: tomorrow,
          startDate: TODAY,
          nextDueDate: addDays(TODAY, 1),
          stoppedAt: null,
          category: { id: Housing, name: 'Housing', kind: 'expense', archived: false },
        },
      ],
      stopped: [],
    })
    // Nothing is due yet.
    expect(await db.$count(transactions)).toBe(0)
  })

  it.each([
    ['yesterday', addDays(TODAY, -1)],
    ['more than a year away', addDays(addYears(TODAY, 1), 1)],
  ])('refuses a start date %s, so nothing is backfilled', async (_, startDate) => {
    const cookie = await signInNewUser()
    const { Housing } = await categoryIds(cookie, 'expense')

    const res = await postRecurring(cookie, {
      categoryId: Housing,
      amount: 150_000,
      varies: false,
      schedule: ON_TODAYS_WEEKDAY,
      startDate,
    })

    expect(res.status).toBe(400)
    expect(Object.keys(((await res.json()) as { fields: object }).fields)).toEqual(['startDate'])
  })

  it('refuses a schedule a month can’t have', async () => {
    const cookie = await signInNewUser()
    const { Housing } = await categoryIds(cookie, 'expense')

    const res = await postRecurring(cookie, {
      categoryId: Housing,
      amount: 150_000,
      varies: false,
      schedule: { frequency: 'yearly', month: 2, day: 30 },
      startDate: TODAY,
    })

    expect(res.status).toBe(400)
    expect(await db.$count(recurringTransactions)).toBe(0)
  })

  it('refuses an archived Category, or one that isn’t the user’s, with 404', async () => {
    const theirs = await signInNewUser(OTHER_USER)
    const { Food: theirFood } = await categoryIds(theirs, 'expense')
    const cookie = await signInNewUser()
    const { Housing } = await categoryIds(cookie, 'expense')
    await db.update(categories).set({ archived: true }).where(eq(categories.id, Housing))

    for (const categoryId of [Housing, theirFood, '3f1d2c4b-5a69-4f7e-8d90-1a2b3c4d5e6f']) {
      const res = await postRecurring(cookie, {
        categoryId,
        amount: 150_000,
        varies: false,
        schedule: ON_TODAYS_WEEKDAY,
        startDate: TODAY,
      })
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ code: 'CATEGORY_NOT_FOUND' })
    }
    expect(await db.$count(recurringTransactions)).toBe(0)
  })

  it(`refuses the ${RECURRING_LIMIT + 1}st that isn’t stopped`, async () => {
    const cookie = await signInNewUser()
    const { Food } = await categoryIds(cookie, 'expense')
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, NEW_USER.email))
    // Straight into the database, as adding this many through the API would
    // pass the write limit.
    const held = Array.from({ length: RECURRING_LIMIT }, () => ({
      userId: user!.id,
      categoryId: Food,
      amount: 100,
      varies: false,
      frequency: 'monthly' as const,
      day: 1,
      startDate: addDays(TODAY, 1),
      nextDueDate: addDays(TODAY, 40),
    }))
    const [first] = await db.insert(recurringTransactions).values(held).returning({ id: recurringTransactions.id })
    const body = { categoryId: Food, amount: 100, varies: false, schedule: ON_TODAYS_WEEKDAY, startDate: TODAY }

    const refused = await postRecurring(cookie, body)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ code: 'RECURRING_LIMIT' })

    // A stopped one doesn't count.
    expect((await stopRecurring(cookie, first!.id)).status).toBe(204)
    expect((await postRecurring(cookie, body)).status).toBe(201)
  })
})

describe('catching up', () => {
  it('creates each missed Due Date once, dated on it, when the Transactions are loaded', async () => {
    const cookie = await signInNewUser()
    const { Food } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, { categoryId: Food, amount: 2_000, note: 'Groceries', schedule: ON_TODAYS_WEEKDAY })
    await backdate(id, addDays(TODAY, -21))

    const res = await getTransactions(cookie, { period: 'day', date: TODAY })

    expect(res.status).toBe(200)
    const dates = [-21, -14, -7, 0].map((days) => addDays(TODAY, days))
    expect(await createdBy(id)).toEqual(
      dates.map((date) => ({ date, dueDate: date, amount: 2_000, note: 'Groceries', estimate: false })),
    )
    expect(await res.json()).toMatchObject({
      transactions: [{ amount: 2_000, recurringTransactionId: id, estimate: false }],
    })
    // Loading again creates nothing more, and it's next due in a week.
    await getTransactions(cookie, { period: 'day', date: TODAY })
    expect(await createdBy(id)).toHaveLength(4)
    expect((await listing(cookie)).active[0]).toMatchObject({ nextDueDate: addDays(TODAY, 7) })
  })

  it('catches up when the Dashboard or the Recurring Transactions are loaded', async () => {
    const cookie = await signInNewUser()
    const { Food } = await categoryIds(cookie, 'expense')
    const first = await added(cookie, { categoryId: Food, amount: 2_000, schedule: ON_TODAYS_WEEKDAY })

    await dashboardFor(cookie, LAST_MONTH)
    expect(await createdBy(first)).toHaveLength(1)

    const second = await added(cookie, { categoryId: Food, amount: 3_000, schedule: ON_TODAYS_WEEKDAY })
    await backdate(second, addDays(TODAY, -7))
    await listing(cookie)
    expect(await createdBy(second)).toHaveLength(2)
  })

  it('never creates a deleted one again, so deleting skips its Due Date', async () => {
    const cookie = await signInNewUser()
    const { Food } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, { categoryId: Food, amount: 2_000, schedule: ON_TODAYS_WEEKDAY })
    await backdate(id, addDays(TODAY, -7))
    await getTransactions(cookie, { period: 'day', date: TODAY })
    const [skipped] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.recurringTransactionId, id), eq(transactions.date, addDays(TODAY, -7))))

    expect((await deleteTransaction(cookie, skipped!.id)).status).toBe(204)
    await getTransactions(cookie, { period: 'day', date: TODAY })

    expect((await createdBy(id)).map((t) => t.date)).toEqual([TODAY])
  })

  it('creates each Due Date once when two loads catch up at the same moment', async () => {
    const cookie = await signInNewUser()
    const { Food } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, { categoryId: Food, amount: 2_000, schedule: ON_TODAYS_WEEKDAY })
    await backdate(id, addDays(TODAY, -28))

    const loads = await Promise.all([
      getTransactions(cookie, { period: 'day', date: TODAY }),
      dashboardFor(cookie, MONTH),
      getRecurring(cookie),
    ])

    expect(loads[0].status).toBe(200)
    expect(await createdBy(id)).toHaveLength(5)
  })

  it('keeps a Transaction it created when its date is edited, without creating that Due Date again', async () => {
    const cookie = await signInNewUser()
    const { Food } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, { categoryId: Food, amount: 2_000, schedule: ON_TODAYS_WEEKDAY })
    await getTransactions(cookie, { period: 'day', date: TODAY })
    const [created] = await db.select({ id: transactions.id }).from(transactions)

    await patchTransaction(cookie, created!.id, { date: addDays(TODAY, -1) })
    await getTransactions(cookie, { period: 'day', date: TODAY })

    expect(await createdBy(id)).toEqual([
      { date: addDays(TODAY, -1), dueDate: TODAY, amount: 2_000, note: null, estimate: false },
    ])
  })
})

describe('Estimates', () => {
  it('are created when the amount varies, listed to confirm, and confirmed by saving', async () => {
    const cookie = await signInNewUser()
    const { Utilities } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, {
      categoryId: Utilities,
      amount: 15_000,
      note: 'Electricity',
      varies: true,
      schedule: ON_TODAYS_WEEKDAY,
    })

    const before = await dashboardFor(cookie, MONTH)

    expect(before.estimates).toEqual([
      {
        id: expect.any(String),
        amount: 15_000,
        date: TODAY,
        note: 'Electricity',
        recurringTransactionId: id,
        estimate: true,
        category: { id: Utilities, name: 'Utilities', kind: 'expense' },
      },
    ])
    // An Estimate counts straight away, beside the ones still to come.
    expect(before.plan.commitments).toBe(15_000 * (1 + before.upcoming.length))

    const res = await patchTransaction(cookie, before.estimates[0]!.id, { amount: 18_200 })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ amount: 18_200, estimate: false })
    const after = await dashboardFor(cookie, MONTH)
    expect(after.estimates).toEqual([])
    expect(after.expenseCategories).toContainEqual(
      expect.objectContaining({ category: expect.objectContaining({ id: Utilities }), total: 18_200 }),
    )
  })

  it('lists an Estimate from an earlier month whichever month is shown', async () => {
    const cookie = await signInNewUser()
    const { Utilities } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, { categoryId: Utilities, amount: 15_000, varies: true, schedule: ON_TODAYS_WEEKDAY })
    await backdate(id, addDays(TODAY, -35))

    const { estimates } = await dashboardFor(cookie, NEXT_MONTH)

    expect(estimates).toHaveLength(6)
  })
})

describe('PATCH /api/recurring/:id', () => {
  it('changes only Transactions not yet created', async () => {
    const cookie = await signInNewUser()
    const { Food } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, { categoryId: Food, amount: 2_000, schedule: ON_TODAYS_WEEKDAY })

    // Today's Due Date is created before the change.
    const res = await patchRecurring(cookie, id, { amount: 2_500, note: 'Market' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ amount: 2_500, note: 'Market', nextDueDate: addDays(TODAY, 7) })
    expect(await createdBy(id)).toEqual([{ date: TODAY, dueDate: TODAY, amount: 2_000, note: null, estimate: false }])
    const { upcoming } = await dashboardFor(cookie, NEXT_MONTH)
    expect(upcoming.every((u) => u.amount === 2_500)).toBe(true)
  })

  // v1-spec: a schedule change never creates a second Transaction in a
  // period that already has one.
  it('moves the next Due Date past a month that already has its Transaction', async () => {
    const cookie = await signInNewUser()
    const { Housing } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, { categoryId: Housing, amount: 150_000, schedule: { frequency: 'monthly', day: 1 } })
    await backdate(id, firstDayOf(MONTH))
    await listing(cookie)

    const res = await patchRecurring(cookie, id, { schedule: { frequency: 'monthly', day: 28 } })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      schedule: { frequency: 'monthly', day: 28 },
      nextDueDate: `${NEXT_MONTH}-28`,
    })
  })

  it('leaves the next Due Date when the schedule is the same', async () => {
    const cookie = await signInNewUser()
    const { Housing } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, {
      categoryId: Housing,
      amount: 150_000,
      schedule: ON_TODAYS_WEEKDAY,
      startDate: addDays(TODAY, 30),
    })

    const res = await patchRecurring(cookie, id, { schedule: ON_TODAYS_WEEKDAY, varies: true })

    expect(await res.json()).toMatchObject({ varies: true, nextDueDate: addDays(TODAY, 35) })
  })

  it('refuses a move to an archived Category, but keeps the archived one it has', async () => {
    const cookie = await signInNewUser()
    const { Housing, Food } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, {
      categoryId: Housing,
      amount: 150_000,
      schedule: ON_TODAYS_WEEKDAY,
      startDate: addDays(TODAY, 1),
    })
    await db.update(categories).set({ archived: true }).where(eq(categories.id, Food))

    const moved = await patchRecurring(cookie, id, { categoryId: Food })
    expect(moved.status).toBe(404)
    expect(await moved.json()).toMatchObject({ code: 'CATEGORY_NOT_FOUND' })

    await db.update(categories).set({ archived: true }).where(eq(categories.id, Housing))
    const kept = await patchRecurring(cookie, id, { categoryId: Housing, amount: 160_000 })
    expect(kept.status).toBe(200)
  })

  it('refuses a stopped one, whatever else is wrong', async () => {
    const cookie = await signInNewUser()
    const { Housing, Food } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, { categoryId: Housing, amount: 150_000, schedule: ON_TODAYS_WEEKDAY })
    await stopRecurring(cookie, id)
    await db.update(categories).set({ archived: true }).where(eq(categories.id, Food))

    for (const changes of [{ amount: 160_000 }, { categoryId: Food }]) {
      const res = await patchRecurring(cookie, id, changes)
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ code: 'RECURRING_NOT_FOUND' })
    }
  })
})

describe('POST /api/recurring/:id/stop', () => {
  it('creates nothing more, keeps what it created, and leaves Upcoming', async () => {
    const cookie = await signInNewUser()
    const { Food } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, { categoryId: Food, amount: 2_000, schedule: ON_TODAYS_WEEKDAY })

    const res = await stopRecurring(cookie, id)

    expect(res.status).toBe(204)
    // Today's Due Date was created before it stopped.
    expect(await createdBy(id)).toHaveLength(1)
    // Were it still going, this would create two more.
    await db
      .update(recurringTransactions)
      .set({ startDate: addDays(TODAY, -14), nextDueDate: addDays(TODAY, -14), lastDueDate: null })
      .where(eq(recurringTransactions.id, id))
    await getTransactions(cookie, { period: 'day', date: TODAY })
    expect(await createdBy(id)).toHaveLength(1)
    expect((await dashboardFor(cookie, NEXT_MONTH)).upcoming).toEqual([])
    const { active, stopped } = await listing(cookie)
    expect(active).toEqual([])
    expect(stopped).toMatchObject([{ id, stoppedAt: expect.any(String) }])
  })

  // v1-spec: it leaves Upcoming at once, including later Due Dates this
  // month. On the month's last day there are none left to leave.
  it('takes this month’s later Due Dates out of Upcoming', async () => {
    const cookie = await signInNewUser()
    const { Food } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, { categoryId: Food, amount: 2_000, schedule: ON_TODAYS_WEEKDAY })
    const later = dueDatesBetween(ON_TODAYS_WEEKDAY, addDays(TODAY, 1), periodRange('month', TODAY).to)

    expect((await dashboardFor(cookie, MONTH)).upcoming.map((u) => u.dueDate)).toEqual(later)
    await stopRecurring(cookie, id)

    expect((await dashboardFor(cookie, MONTH)).upcoming).toEqual([])
  })

  it('keeps when it first stopped when stopped again', async () => {
    const cookie = await signInNewUser()
    const { Food } = await categoryIds(cookie, 'expense')
    const id = await added(cookie, { categoryId: Food, amount: 2_000, schedule: ON_TODAYS_WEEKDAY })
    await stopRecurring(cookie, id)
    const { stopped } = await listing(cookie)

    expect((await stopRecurring(cookie, id)).status).toBe(204)
    expect((await listing(cookie)).stopped).toEqual(stopped)
  })
})

// The maths is tested in packages/shared (monthFigures). These check what the
// queries feed it: Recurring Transactions, Budgets, and which Transactions
// Recurring Transactions created.
describe('the Dashboard’s plan', () => {
  it('counts Upcoming Due Dates in a future month, and warns when Budgets don’t fit', async () => {
    const cookie = await signInNewUser()
    const { Salary } = await categoryIds(cookie, 'income')
    const { Housing, Food } = await categoryIds(cookie, 'expense')
    const salary = await added(cookie, {
      categoryId: Salary,
      amount: 500_000,
      schedule: { frequency: 'monthly', day: 25 },
    })
    const rent = await added(cookie, {
      categoryId: Housing,
      amount: 150_000,
      note: 'Rent',
      schedule: { frequency: 'monthly', day: 1 },
    })
    const lunch = await postTransaction(cookie, { categoryId: Food, amount: 10_000, date: `${NEXT_MONTH}-02` })
    expect(lunch.status).toBe(201)

    const body = await dashboardFor(cookie, NEXT_MONTH)

    expect(body.upcoming).toEqual([
      {
        recurringTransactionId: rent,
        dueDate: `${NEXT_MONTH}-01`,
        amount: 150_000,
        estimate: false,
        note: 'Rent',
        category: { id: Housing, name: 'Housing', kind: 'expense', archived: false },
      },
      {
        recurringTransactionId: salary,
        dueDate: `${NEXT_MONTH}-25`,
        amount: 500_000,
        estimate: false,
        note: null,
        category: { id: Salary, name: 'Salary', kind: 'income', archived: false },
      },
    ])
    expect(body.plan).toEqual({
      expectedIncome: 500_000,
      commitments: 150_000,
      freeToSpend: 350_000,
      remaining: 340_000,
    })
    expect(body.commitmentsByCategory).toEqual({ [Housing]: 150_000 })
    expect(body.budgetsOverBy).toBeNull()

    await putBudgets(cookie, { month: NEXT_MONTH }, { limits: [{ categoryId: Food, limit: 400_000 }] })
    expect((await dashboardFor(cookie, NEXT_MONTH)).budgetsOverBy).toBe(50_000)
  })

  it('counts a created Commitment at its amount, not as Upcoming', async () => {
    const cookie = await signInNewUser()
    const { Housing } = await categoryIds(cookie, 'expense')
    const rent = await added(cookie, {
      categoryId: Housing,
      amount: 150_000,
      schedule: { frequency: 'monthly', day: 1 },
    })
    await backdate(rent, firstDayOf(MONTH))

    const body = await dashboardFor(cookie, MONTH)

    expect(body.upcoming).toEqual([])
    expect(body.plan).toEqual({ expectedIncome: 0, commitments: 150_000, freeToSpend: -150_000, remaining: -150_000 })
    expect(body.commitmentsByCategory).toEqual({ [Housing]: 150_000 })
  })

  // v1-spec: a created Transaction follows its own date and Category.
  it('counts a created Transaction where it is moved to', async () => {
    const cookie = await signInNewUser()
    const { Housing } = await categoryIds(cookie, 'expense')
    const { Other } = await categoryIds(cookie, 'income')
    const rent = await added(cookie, {
      categoryId: Housing,
      amount: 150_000,
      schedule: { frequency: 'monthly', day: 1 },
    })
    await backdate(rent, firstDayOf(MONTH))
    await dashboardFor(cookie, MONTH)
    const [created] = await db.select({ id: transactions.id }).from(transactions)

    // Into next month, where the next month's own rent is still to come.
    await patchTransaction(cookie, created!.id, { date: `${NEXT_MONTH}-03` })
    expect((await dashboardFor(cookie, MONTH)).plan.commitments).toBe(0)
    expect((await dashboardFor(cookie, NEXT_MONTH)).plan).toMatchObject({ expectedIncome: 0, commitments: 300_000 })

    // Under an Income Category, it counts towards Expected Income instead.
    await patchTransaction(cookie, created!.id, { categoryId: Other })
    expect((await dashboardFor(cookie, NEXT_MONTH)).plan).toMatchObject({
      expectedIncome: 150_000,
      commitments: 150_000,
    })
  })
})

describe('another user’s Recurring Transactions', () => {
  it('never appear, and give 404 for edit and stop', async () => {
    const theirs = await signInNewUser(OTHER_USER)
    const { Food: theirFood } = await categoryIds(theirs, 'expense')
    const id = await added(theirs, { categoryId: theirFood, amount: 2_000, schedule: ON_TODAYS_WEEKDAY })
    const cookie = await signInNewUser()

    expect(await listing(cookie)).toEqual({ active: [], stopped: [] })
    expect((await dashboardFor(cookie, NEXT_MONTH)).upcoming).toEqual([])
    for (const res of [await patchRecurring(cookie, id, { amount: 1 }), await stopRecurring(cookie, id)]) {
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ code: 'RECURRING_NOT_FOUND' })
    }
    expect((await listing(theirs)).active).toMatchObject([{ id, amount: 2_000 }])
  })

  it('give 404 for an ID that isn’t an ID', async () => {
    const cookie = await signInNewUser()

    expect((await patchRecurring(cookie, 'not-an-id', { amount: 1 })).status).toBe(404)
    expect((await stopRecurring(cookie, 'not-an-id')).status).toBe(404)
  })

  it('can’t be linked to a Transaction by the database', async () => {
    const theirs = await signInNewUser(OTHER_USER)
    const { Food: theirFood } = await categoryIds(theirs, 'expense')
    const id = await added(theirs, {
      categoryId: theirFood,
      amount: 2_000,
      schedule: ON_TODAYS_WEEKDAY,
      startDate: addDays(TODAY, 1),
    })
    const cookie = await signInNewUser()
    const { Food } = await categoryIds(cookie, 'expense')
    const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, NEW_USER.email))

    await expect(
      db.insert(transactions).values({
        userId: me!.id,
        categoryId: Food,
        amount: 2_000,
        date: TODAY,
        recurringTransactionId: id,
        dueDate: TODAY,
      }),
    ).rejects.toThrow()
  })
})
