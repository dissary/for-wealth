import { addMonths, addYears, MAX_AMOUNT, STARTER_CATEGORIES, todayIn } from '@for-wealth/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, pool } from '../src/db/client.js'
import { budgets, categories } from '../src/db/schema/index.js'
import { writeLimit } from '../src/write-limit.js'
import {
  getBudgets,
  getCategories,
  getMe,
  NEW_USER,
  OTHER_USER,
  putBudgets,
  signInNewUser,
  startFresh,
} from './helpers.js'

// The Dashboard's bounds: the months holding 2000-01-01 and one year after
// today, with today taken in the user's zone (Kuala Lumpur).
const LATEST_MONTH = addYears(todayIn(NEW_USER.timeZone), 1).slice(0, 7)
const AFTER_LATEST = addMonths(`${LATEST_MONTH}-01`, 1).slice(0, 7)

type Categories = { income: { id: string; name: string }[]; expense: { id: string; name: string }[] }

// The signed-in user's Categories of one kind, by name.
async function categoryIds(cookie: string, kind: keyof Categories) {
  const all = (await (await getCategories(cookie)).json()) as Categories
  return Object.fromEntries(all[kind].map((c) => [c.name, c.id])) as Record<string, string>
}

async function userId(cookie: string) {
  return ((await (await getMe(cookie)).json()) as { id: string }).id
}

// Each Category's limit by name, leaving out those with none.
function limitsByName(list: Budgets) {
  return Object.fromEntries(list.filter((b) => b.limit !== null).map((b) => [b.category.name, b.limit]))
}

type Budgets = { category: { id: string; name: string }; limit: number | null }[]

// One month's Budgets for the signed-in user.
async function budgetsIn(cookie: string, month: string) {
  const res = await getBudgets(cookie, { month })
  if (res.status !== 200) throw new Error(`Loading Budgets failed: ${res.status}`)
  return (await res.json()) as Budgets
}

// Sets limits from a month on, as the dialog does.
async function save(cookie: string, month: string, limits: { categoryId: string; limit: number | null }[]) {
  const res = await putBudgets(cookie, { month }, { limits })
  if (res.status !== 204) throw new Error(`Saving Budgets failed: ${res.status}`)
}

// Every change stored for the user, oldest month first.
function storedChanges(user: string) {
  return db
    .select({ categoryId: budgets.categoryId, month: budgets.month, limit: budgets.limit })
    .from(budgets)
    .where(eq(budgets.userId, user))
    .orderBy(budgets.month)
}

beforeEach(async () => {
  await startFresh()
})
afterAll(() => pool.end())

describe('GET /api/budgets', () => {
  // A new user has no Budgets: there is no starter set.
  it('lists every Expense Category that isn’t archived, in position order, with no limit', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    await db.update(categories).set({ archived: true }).where(eq(categories.id, expense.Health!))

    const res = await getBudgets(cookie, { month: '2026-10' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(
      STARTER_CATEGORIES.expense
        .filter((name) => name !== 'Health')
        .map((name) => ({ category: { id: expense[name], name }, limit: null })),
    )
  })

  // ADR 0007: the latest change at or before the month, for each Category.
  it('takes each limit from the latest stored change at or before the month', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    const user = await userId(cookie)
    await db.insert(budgets).values([
      { userId: user, categoryId: expense.Food!, month: '2026-08-01', limit: 50_000 },
      { userId: user, categoryId: expense.Food!, month: '2026-10-01', limit: 60_000 },
      { userId: user, categoryId: expense.Food!, month: '2026-12-01', limit: 70_000 },
      { userId: user, categoryId: expense.Transport!, month: '2026-09-01', limit: 20_000 },
      { userId: user, categoryId: expense.Transport!, month: '2026-11-01', limit: null },
      { userId: user, categoryId: expense.Shopping!, month: '2026-12-01', limit: 10_000 },
    ])

    expect(limitsByName(await budgetsIn(cookie, '2026-07'))).toEqual({})
    expect(limitsByName(await budgetsIn(cookie, '2026-09'))).toEqual({ Food: 50_000, Transport: 20_000 })
    expect(limitsByName(await budgetsIn(cookie, '2026-10'))).toEqual({ Food: 60_000, Transport: 20_000 })
    expect(limitsByName(await budgetsIn(cookie, '2026-11'))).toEqual({ Food: 60_000 })
    expect(limitsByName(await budgetsIn(cookie, '2027-04'))).toEqual({ Food: 70_000, Shopping: 10_000 })
  })
})

describe('PUT /api/budgets', () => {
  it('sets limits from the month on, and answers 204', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')

    const res = await putBudgets(
      cookie,
      { month: '2026-10' },
      {
        limits: [
          { categoryId: expense.Food, limit: 50_000 },
          { categoryId: expense.Transport, limit: 20_000 },
          { categoryId: expense.Health, limit: null },
        ],
      },
    )

    expect(res.status).toBe(204)
    expect(limitsByName(await budgetsIn(cookie, '2026-09'))).toEqual({})
    expect(limitsByName(await budgetsIn(cookie, '2026-10'))).toEqual({ Food: 50_000, Transport: 20_000 })
    expect(limitsByName(await budgetsIn(cookie, '2027-10'))).toEqual({ Food: 50_000, Transport: 20_000 })
  })

  it('leaves October unchanged when editing November, and reaches December', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    await save(cookie, '2026-10', [{ categoryId: expense.Food!, limit: 50_000 }])

    await save(cookie, '2026-11', [{ categoryId: expense.Food!, limit: 60_000 }])

    expect(limitsByName(await budgetsIn(cookie, '2026-10'))).toEqual({ Food: 50_000 })
    expect(limitsByName(await budgetsIn(cookie, '2026-11'))).toEqual({ Food: 60_000 })
    expect(limitsByName(await budgetsIn(cookie, '2026-12'))).toEqual({ Food: 60_000 })
  })

  it('stops an earlier month’s edit at the next change', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    await save(cookie, '2026-12', [{ categoryId: expense.Food!, limit: 70_000 }])

    await save(cookie, '2026-10', [{ categoryId: expense.Food!, limit: 50_000 }])

    expect(limitsByName(await budgetsIn(cookie, '2026-11'))).toEqual({ Food: 50_000 })
    expect(limitsByName(await budgetsIn(cookie, '2026-12'))).toEqual({ Food: 70_000 })
  })

  it('stores nothing for the limit a month already has', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    const user = await userId(cookie)
    await save(cookie, '2026-10', [{ categoryId: expense.Food!, limit: 50_000 }])

    // November carries October's limit; Transport has none to clear.
    await save(cookie, '2026-11', [
      { categoryId: expense.Food!, limit: 50_000 },
      { categoryId: expense.Transport!, limit: null },
    ])

    expect(await storedChanges(user)).toEqual([{ categoryId: expense.Food, month: '2026-10-01', limit: 50_000 }])
  })

  it('replaces the month’s change when a Category is saved again that month', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    const user = await userId(cookie)
    await save(cookie, '2026-10', [{ categoryId: expense.Food!, limit: 50_000 }])

    await save(cookie, '2026-10', [{ categoryId: expense.Food!, limit: 55_000 }])

    expect(await storedChanges(user)).toEqual([{ categoryId: expense.Food, month: '2026-10-01', limit: 55_000 }])
    expect(limitsByName(await budgetsIn(cookie, '2026-10'))).toEqual({ Food: 55_000 })
  })

  it('removes a carried limit from the month on when it is cleared', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    await save(cookie, '2026-10', [{ categoryId: expense.Food!, limit: 50_000 }])

    await save(cookie, '2026-12', [{ categoryId: expense.Food!, limit: null }])

    expect(limitsByName(await budgetsIn(cookie, '2026-11'))).toEqual({ Food: 50_000 })
    expect(limitsByName(await budgetsIn(cookie, '2026-12'))).toEqual({})
    expect(limitsByName(await budgetsIn(cookie, '2027-06'))).toEqual({})
  })

  // The month would carry the earlier limit anyway, so its own change goes.
  it('drops the month’s change when it is saved back to the limit carried into it', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    const user = await userId(cookie)
    await save(cookie, '2026-10', [{ categoryId: expense.Food!, limit: 50_000 }])
    await save(cookie, '2026-11', [
      { categoryId: expense.Food!, limit: 60_000 },
      { categoryId: expense.Transport!, limit: 20_000 },
    ])

    await save(cookie, '2026-11', [
      { categoryId: expense.Food!, limit: 50_000 },
      { categoryId: expense.Transport!, limit: null },
    ])

    expect(limitsByName(await budgetsIn(cookie, '2026-11'))).toEqual({ Food: 50_000 })
    expect(await storedChanges(user)).toEqual([{ categoryId: expense.Food, month: '2026-10-01', limit: 50_000 }])
  })

  it('takes an empty list and stores nothing', async () => {
    const cookie = await signInNewUser()

    const res = await putBudgets(cookie, { month: '2026-10' }, { limits: [] })

    expect(res.status).toBe(204)
    expect(await storedChanges(await userId(cookie))).toEqual([])
  })
})

describe('PUT /api/budgets: refused', () => {
  // v1-spec "Budgets": a Transaction amount's rules, in minor units. A
  // fraction of a minor unit is more decimal places than the currency has.
  it.each([
    ['zero', 0],
    ['a negative limit', -1],
    ['more than the largest amount', MAX_AMOUNT + 1],
    ['a fraction of a minor unit', 1_250.5],
    ['a string', '50000'],
    ['no limit given', undefined],
  ])('gives 400 for %s, and saves nothing', async (_, limit) => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')

    const res = await putBudgets(
      cookie,
      { month: '2026-10' },
      {
        limits: [
          { categoryId: expense.Transport, limit: 20_000 },
          { categoryId: expense.Food, limit },
        ],
      },
    )

    expect(res.status).toBe(400)
    expect(await storedChanges(await userId(cookie))).toEqual([])
  })

  it.each([[1], [MAX_AMOUNT]])('accepts a limit of %i, at a bound', async (limit) => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')

    await save(cookie, '2026-10', [{ categoryId: expense.Food!, limit }])

    expect(limitsByName(await budgetsIn(cookie, '2026-10'))).toEqual({ Food: limit })
  })

  it('gives 400 for the same Category twice, and saves nothing', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')

    const res = await putBudgets(
      cookie,
      { month: '2026-10' },
      {
        limits: [
          { categoryId: expense.Food, limit: 50_000 },
          { categoryId: expense.Food, limit: 60_000 },
        ],
      },
    )

    expect(res.status).toBe(400)
    expect(await storedChanges(await userId(cookie))).toEqual([])
  })

  // The same answer for each, so nobody can probe for other users' IDs.
  it.each([
    ['another user’s Category', 'theirs'],
    ['an archived Category', 'archived'],
    ['an Income Category', 'income'],
    ['a Category that doesn’t exist', 'missing'],
    ['an ID that isn’t an ID', 'malformed'],
  ] as const)('gives 404 CATEGORY_NOT_FOUND for %s, and saves nothing', async (_, which) => {
    const cookie = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const expense = await categoryIds(cookie, 'expense')
    await db.update(categories).set({ archived: true }).where(eq(categories.id, expense.Health!))
    const categoryId = {
      theirs: (await categoryIds(weiMing, 'expense')).Food,
      archived: expense.Health,
      income: (await categoryIds(cookie, 'income')).Salary,
      missing: '00000000-0000-4000-8000-000000000000',
      malformed: 'food',
    }[which]

    const res = await putBudgets(
      cookie,
      { month: '2026-10' },
      {
        limits: [
          { categoryId: expense.Food, limit: 50_000 },
          { categoryId, limit: 20_000 },
        ],
      },
    )

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'CATEGORY_NOT_FOUND' })
    expect(await storedChanges(await userId(cookie))).toEqual([])
  })

  it('is refused by the database when inserted straight in with another user’s Category', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const hisFood = (await categoryIds(weiMing, 'expense')).Food!

    const insert = db
      .insert(budgets)
      .values({ userId: await userId(aisyah), categoryId: hisFood, month: '2026-10-01', limit: 50_000 })

    await expect(insert).rejects.toMatchObject({
      cause: { constraint: 'budgets_user_id_category_id_categories_fk' },
    })
  })

  it('refuses the 61st write in a minute with 429', async () => {
    const cookie = await signInNewUser()
    const food = (await categoryIds(cookie, 'expense')).Food!
    writeLimit.now = () => 1_000_000
    // Each counts, though it saves nothing.
    for (let i = 0; i < 60; i++) await save(cookie, '2026-10', [])

    const res = await putBudgets(cookie, { month: '2026-10' }, { limits: [{ categoryId: food, limit: 50_000 }] })

    expect(res.status).toBe(429)
    expect(await storedChanges(await userId(cookie))).toEqual([])
  })

  it('gives 401 with no session', async () => {
    const res = await putBudgets(undefined, { month: '2026-10' }, { limits: [] })

    expect(res.status).toBe(401)
  })
})

describe('/api/budgets: the month', () => {
  it.each([
    ['no month', {}],
    ['a malformed month', { month: '2026-13' }],
    ['a date', { month: '2026-10-01' }],
    ['the month before 2000-01-01', { month: '1999-12' }],
    ['the month after one year from today', { month: AFTER_LATEST }],
  ])('gives 400 for %s', async (_, query) => {
    const cookie = await signInNewUser()
    const food = (await categoryIds(cookie, 'expense')).Food

    const read = await getBudgets(cookie, query)
    const written = await putBudgets(cookie, query, { limits: [{ categoryId: food, limit: 50_000 }] })

    expect([read.status, written.status]).toEqual([400, 400])
    expect(Object.keys(((await read.json()) as { fields: object }).fields)).toEqual(['month'])
    expect(await storedChanges(await userId(cookie))).toEqual([])
  })

  it('gives 400 for any other parameter', async () => {
    const cookie = await signInNewUser()

    const read = await getBudgets(cookie, { month: '2026-10', category: 'food' })
    const written = await putBudgets(cookie, { month: '2026-10', category: 'food' }, { limits: [] })

    expect([read.status, written.status]).toEqual([400, 400])
  })

  // Any month the Dashboard can show can be edited, past ones included.
  it.each([['2000-01'], [LATEST_MONTH]])('reads and edits %s, at a bound', async (month) => {
    const cookie = await signInNewUser()
    const food = (await categoryIds(cookie, 'expense')).Food!

    await save(cookie, month, [{ categoryId: food, limit: 50_000 }])

    expect(limitsByName(await budgetsIn(cookie, month))).toEqual({ Food: 50_000 })
  })
})

describe('GET /api/budgets: whose data', () => {
  it('never shows another user’s Budgets', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const hers = await categoryIds(aisyah, 'expense')
    const his = await categoryIds(weiMing, 'expense')
    await save(aisyah, '2026-10', [{ categoryId: hers.Food!, limit: 50_000 }])
    await save(weiMing, '2026-10', [
      { categoryId: his.Food!, limit: 9_000 },
      { categoryId: his.Transport!, limit: 4_000 },
    ])

    const list = await budgetsIn(aisyah, '2026-10')

    expect(limitsByName(list)).toEqual({ Food: 50_000 })
    expect(list.map((b) => b.category.id)).toEqual(Object.values(hers))
  })

  it('gives 401 with no session', async () => {
    const res = await getBudgets(undefined, { month: '2026-10' })

    expect(res.status).toBe(401)
  })
})
