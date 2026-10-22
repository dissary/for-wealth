import { addYears, MAX_AMOUNT, todayIn } from '@for-wealth/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../src/app.js'
import { db, pool } from '../src/db/client.js'
import { categories, transactions, users } from '../src/db/schema/index.js'
import {
  getCategories,
  getDay,
  getMe,
  NEW_USER,
  OTHER_USER,
  postTransaction,
  signInNewUser,
  startFresh,
} from './helpers.js'

type Categories = { income: { id: string; name: string }[]; expense: { id: string; name: string }[] }

// The signed-in user's Category with this name and kind.
async function categoryId(cookie: string, kind: keyof Categories, name: string) {
  const all = (await (await getCategories(cookie)).json()) as Categories
  const category = all[kind].find((c) => c.name === name)
  if (!category) throw new Error(`No ${kind} Category called ${name}`)
  return category.id
}

const TODAY = todayIn(NEW_USER.timeZone)

function dayAfter(date: string) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

beforeEach(async () => {
  await startFresh()
})
afterAll(() => pool.end())

describe('POST /api/transactions', () => {
  it('adds a Transaction that then shows on its day', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')

    const res = await postTransaction(cookie, { categoryId: food, amount: 1250, date: TODAY, note: ' Lunch ' })

    expect(res.status).toBe(201)
    const day = await (await getDay(cookie, TODAY)).json()
    expect(day).toEqual({
      period: 'day',
      date: TODAY,
      totals: { income: 0, expense: 1250 },
      transactions: [
        {
          id: expect.any(String),
          amount: 1250,
          date: TODAY,
          note: 'Lunch',
          category: { id: food, name: 'Food', kind: 'expense' },
        },
      ],
    })
  })
})

describe('POST /api/transactions: bounds', () => {
  async function refusedFields(body: Record<string, unknown>) {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')

    const res = await postTransaction(cookie, { categoryId: food, amount: 1250, date: TODAY, ...body })

    expect(res.status).toBe(400)
    expect(await db.$count(transactions)).toBe(0)
    return ((await res.json()) as { fields: Record<string, string[]> }).fields
  }

  it.each([0, MAX_AMOUNT + 1, 12.5, '1250'])('refuses the amount %j', async (amount) => {
    expect(Object.keys(await refusedFields({ amount }))).toEqual(['amount'])
  })

  it.each(['1999-12-31', '2026-02-30', 'yesterday'])(
    'refuses the date %j',
    async (date) => {
      expect(Object.keys(await refusedFields({ date }))).toEqual(['date'])
    },
  )

  // Today is taken in the user's zone (Kuala Lumpur), not the server's.
  it('refuses a date more than a year after today', async () => {
    const fields = await refusedFields({ date: dayAfter(addYears(TODAY, 1)) })

    expect(fields.date?.[0]).toMatch(/^Use a date up to /)
  })

  it('refuses a note over 200 characters', async () => {
    expect(await refusedFields({ note: 'a'.repeat(201) })).toEqual({ note: ['Use 200 characters or fewer'] })
  })

  it('refuses a body that is not JSON', async () => {
    const cookie = await signInNewUser()

    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: '{"amount": 12',
    })

    expect(res.status).toBe(400)
  })

  it('accepts one year after today and a 200-character note', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')

    const res = await postTransaction(cookie, {
      categoryId: food,
      amount: MAX_AMOUNT,
      date: addYears(TODAY, 1),
      note: 'a'.repeat(200),
    })

    expect(res.status).toBe(201)
  })
})

describe('POST /api/transactions: Categories', () => {
  it('gives 404 for another user’s Category, the same as for one that doesn’t exist', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const hisFood = await categoryId(weiMing, 'expense', 'Food')

    const theirs = await postTransaction(aisyah, { categoryId: hisFood, amount: 1250, date: TODAY })
    const missing = await postTransaction(aisyah, {
      categoryId: '00000000-0000-4000-8000-000000000000',
      amount: 1250,
      date: TODAY,
    })

    expect(theirs.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await theirs.json()).toEqual(await missing.json())
    expect(await db.$count(transactions)).toBe(0)
  })

  // Archived Categories are hidden from pickers, so nothing new is filed
  // under one.
  it('gives 404 for an archived Category', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    await db.update(categories).set({ archived: true }).where(eq(categories.id, food))

    const res = await postTransaction(cookie, { categoryId: food, amount: 1250, date: TODAY })

    expect(res.status).toBe(404)
  })

  it('is refused by the database when inserted straight in with another user’s Category', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const { id: aisyahId } = (await (await getMe(aisyah)).json()) as { id: string }
    const hisFood = await categoryId(weiMing, 'expense', 'Food')

    const insert = db.insert(transactions).values({ userId: aisyahId, categoryId: hisFood, amount: 1250, date: TODAY })

    await expect(insert).rejects.toMatchObject({
      cause: { constraint: 'transactions_user_id_category_id_categories_fk' },
    })
  })

  it('needs a session', async () => {
    const res = await postTransaction(undefined, { amount: 1250, date: TODAY })

    expect(res.status).toBe(401)
  })
})

describe('GET /api/transactions?period=day', () => {
  it('lists the day most recently added first, with Income and Expense totals', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    const transport = await categoryId(cookie, 'expense', 'Transport')
    const salary = await categoryId(cookie, 'income', 'Salary')
    for (const [categoryId, amount] of [
      [food, 1250],
      [salary, 300000],
      [transport, 450],
    ] as const) {
      expect((await postTransaction(cookie, { categoryId, amount, date: TODAY })).status).toBe(201)
    }
    await postTransaction(cookie, { categoryId: food, amount: 999, date: '2026-01-01' })

    const day = (await (await getDay(cookie, TODAY)).json()) as {
      totals: unknown
      transactions: { amount: number; category: { name: string } }[]
    }

    expect(day.totals).toEqual({ income: 300000, expense: 1700 })
    expect(day.transactions.map((t) => [t.category.name, t.amount])).toEqual([
      ['Transport', 450],
      ['Salary', 300000],
      ['Food', 1250],
    ])
  })

  it('shows user B none of user A’s Transactions', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const food = await categoryId(aisyah, 'expense', 'Food')
    await postTransaction(aisyah, { categoryId: food, amount: 1250, date: TODAY })

    const day = await (await getDay(weiMing, TODAY)).json()

    expect(day).toMatchObject({ totals: { income: 0, expense: 0 }, transactions: [] })
  })

  it.each([
    ['an unknown Period', 'period=year&date=2026-10-22'],
    ['a missing date', 'period=day'],
    ['a date before 2000', 'period=day&date=1999-12-31'],
    ['a date that does not exist', 'period=day&date=2026-02-30'],
  ])('gives 400 for %s', async (_, query) => {
    const cookie = await signInNewUser()

    const res = await app.request(`/api/transactions?${query}`, { headers: { cookie } })

    expect(res.status).toBe(400)
  })

  it('needs a session', async () => {
    const res = await getDay(undefined, TODAY)

    expect(res.status).toBe(401)
  })
})

describe('deleting a user', () => {
  it('removes their Transactions with them', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    await postTransaction(cookie, { categoryId: food, amount: 1250, date: TODAY })

    await db.delete(users).where(eq(users.email, NEW_USER.email))

    expect(await db.$count(transactions)).toBe(0)
  })
})
