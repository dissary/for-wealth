import { addYears, MAX_AMOUNT, todayIn } from '@for-wealth/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../src/app.js'
import { db, pool } from '../src/db/client.js'
import { categories, transactions, users } from '../src/db/schema/index.js'
import {
  deleteTransaction,
  getCategories,
  getMe,
  getTransaction,
  getTransactions,
  NEW_USER,
  OTHER_USER,
  patchTransaction,
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
    const day = await (await getTransactions(cookie, { period: 'day', date: TODAY })).json()
    expect(day).toEqual({
      period: 'day',
      date: TODAY,
      category: null,
      totals: { income: 0, expense: 1250 },
      transactions: [
        {
          id: expect.any(String),
          amount: 1250,
          date: TODAY,
          note: 'Lunch',
          recurringTransactionId: null,
          estimate: false,
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

    const day = (await (await getTransactions(cookie, { period: 'day', date: TODAY })).json()) as {
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

    const day = await (await getTransactions(weiMing, { period: 'day', date: TODAY })).json()

    expect(day).toMatchObject({ totals: { income: 0, expense: 0 }, transactions: [] })
  })

  it.each([
    ['an unknown Period', 'period=year&date=2026-10-22'],
    ['a missing date', 'period=day'],
    ['a date before 2000', 'period=day&date=1999-12-31'],
    ['a date that does not exist', 'period=day&date=2026-02-30'],
    ['a date more than a year after today', `period=week&date=${dayAfter(addYears(TODAY, 1))}`],
    ['a range instead of a Period', 'period=week&date=2026-10-22&from=2026-01-01&to=2026-12-31'],
    ['a Category that is not an ID', 'period=day&date=2026-10-22&category=food'],
  ])('gives 400 for %s', async (_, query) => {
    const cookie = await signInNewUser()

    const res = await app.request(`/api/transactions?${query}`, { headers: { cookie } })

    expect(res.status).toBe(400)
  })

  it('needs a session', async () => {
    const res = await getTransactions(undefined, { period: 'day', date: TODAY })

    expect(res.status).toBe(401)
  })
})

type Listing = {
  totals: { income: number; expense: number }
  transactions: { amount: number; date: string; category: { name: string } }[]
}

async function list(cookie: string, query: Record<string, string>) {
  const res = await getTransactions(cookie, query)
  expect(res.status).toBe(200)
  return (await res.json()) as Listing
}

function rows(listing: Listing) {
  return listing.transactions.map((t) => [t.date, t.category.name, t.amount])
}

describe('GET /api/transactions?period=week', () => {
  // Mon 2 Mar to Sun 8 Mar 2026, with a Transaction just outside each end.
  it('lists Monday to Sunday, newest date first, with the week’s totals', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    const salary = await categoryId(cookie, 'income', 'Salary')
    for (const [categoryId, amount, date] of [
      [food, 100, '2026-03-01'],
      [food, 1250, '2026-03-02'],
      [salary, 300000, '2026-03-08'],
      [food, 450, '2026-03-02'],
      [food, 200, '2026-03-09'],
    ] as const) {
      expect((await postTransaction(cookie, { categoryId, amount, date })).status).toBe(201)
    }

    const week = await list(cookie, { period: 'week', date: '2026-03-04' })

    expect(week.totals).toEqual({ income: 300000, expense: 1700 })
    expect(rows(week)).toEqual([
      ['2026-03-08', 'Salary', 300000],
      ['2026-03-02', 'Food', 450],
      ['2026-03-02', 'Food', 1250],
    ])
  })
})

describe('GET /api/transactions?period=month', () => {
  it('lists the calendar month with its totals', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    const bonus = await categoryId(cookie, 'income', 'Bonus')
    for (const [categoryId, amount, date] of [
      [food, 100, '2026-01-31'],
      [food, 1250, '2026-02-01'],
      [bonus, 50000, '2026-02-14'],
      [food, 450, '2026-02-28'],
      [food, 200, '2026-03-01'],
    ] as const) {
      expect((await postTransaction(cookie, { categoryId, amount, date })).status).toBe(201)
    }

    const month = await list(cookie, { period: 'month', date: '2026-02-10' })

    expect(month.totals).toEqual({ income: 50000, expense: 1700 })
    expect(rows(month)).toEqual([
      ['2026-02-28', 'Food', 450],
      ['2026-02-14', 'Bonus', 50000],
      ['2026-02-01', 'Food', 1250],
    ])
  })
})

describe('GET /api/transactions: Category filter', () => {
  it('narrows the list and the totals to that Category', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    const transport = await categoryId(cookie, 'expense', 'Transport')
    const salary = await categoryId(cookie, 'income', 'Salary')
    for (const [categoryId, amount, date] of [
      [food, 1250, '2026-03-02'],
      [transport, 450, '2026-03-03'],
      [salary, 300000, '2026-03-04'],
      [food, 800, '2026-03-05'],
    ] as const) {
      expect((await postTransaction(cookie, { categoryId, amount, date })).status).toBe(201)
    }

    const res = await getTransactions(cookie, { period: 'week', date: '2026-03-04', category: food })
    const week = (await res.json()) as Listing & { category: unknown }

    expect(week.category).toEqual({ id: food, name: 'Food', kind: 'expense' })
    expect(week.totals).toEqual({ income: 0, expense: 2050 })
    expect(rows(week)).toEqual([
      ['2026-03-05', 'Food', 800],
      ['2026-03-02', 'Food', 1250],
    ])
  })

  // Old Transactions keep an archived Category, so they can still be found.
  it('works for an archived Category', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    await postTransaction(cookie, { categoryId: food, amount: 1250, date: '2026-03-02' })
    await db.update(categories).set({ archived: true }).where(eq(categories.id, food))

    const week = await list(cookie, { period: 'week', date: '2026-03-02', category: food })

    expect(week.totals).toEqual({ income: 0, expense: 1250 })
  })

  it('gives 404 for another user’s Category, the same as for one that doesn’t exist', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const hisFood = await categoryId(weiMing, 'expense', 'Food')
    await postTransaction(weiMing, { categoryId: hisFood, amount: 1250, date: '2026-03-02' })
    const query = { period: 'week', date: '2026-03-02' }

    const theirs = await getTransactions(aisyah, { ...query, category: hisFood })
    const missing = await getTransactions(aisyah, { ...query, category: '00000000-0000-4000-8000-000000000000' })

    expect(theirs.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await theirs.json()).toEqual(await missing.json())
  })

  it('has no Category without a filter', async () => {
    const cookie = await signInNewUser()

    const res = await getTransactions(cookie, { period: 'week', date: '2026-03-02' })

    expect(await res.json()).toMatchObject({ category: null })
  })
})

// Adds a Transaction for the signed-in user and returns its ID.
async function added(cookie: string, body: Record<string, unknown>) {
  const res = await postTransaction(cookie, body)
  expect(res.status).toBe(201)
  return ((await res.json()) as { id: string }).id
}

describe('PATCH /api/transactions/:id', () => {
  it('changes the amount and leaves the rest as it was', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    const id = await added(cookie, { categoryId: food, amount: 1250, date: TODAY, note: 'Lunch' })

    const res = await patchTransaction(cookie, id, { amount: 980 })

    expect(res.status).toBe(200)
    expect(await (await getTransaction(cookie, id)).json()).toEqual({
      id,
      amount: 980,
      date: TODAY,
      note: 'Lunch',
      recurringTransactionId: null,
      estimate: false,
      category: { id: food, name: 'Food', kind: 'expense' },
    })
  })

  it('changes the date, the Category and the note', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    const transport = await categoryId(cookie, 'expense', 'Transport')
    const id = await added(cookie, { categoryId: food, amount: 1250, date: TODAY, note: 'Lunch' })

    const res = await patchTransaction(cookie, id, { date: '2026-03-02', categoryId: transport, note: ' Grab ' })

    expect(await res.json()).toEqual({
      id,
      amount: 1250,
      date: '2026-03-02',
      note: 'Grab',
      recurringTransactionId: null,
      estimate: false,
      category: { id: transport, name: 'Transport', kind: 'expense' },
    })
    expect(rows(await list(cookie, { period: 'day', date: TODAY }))).toEqual([])
    expect(rows(await list(cookie, { period: 'day', date: '2026-03-02' }))).toEqual([
      ['2026-03-02', 'Transport', 1250],
    ])
  })

  it.each([null, '  '])('removes the note when it is %j', async (note) => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    const id = await added(cookie, { categoryId: food, amount: 1250, date: TODAY, note: 'Lunch' })

    const res = await patchTransaction(cookie, id, { note })

    expect(await res.json()).toMatchObject({ note: null })
  })

  it('moves it from the Expense total to the Income total under an Income Category', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    const otherIncome = await categoryId(cookie, 'income', 'Other')
    await added(cookie, { categoryId: food, amount: 450, date: TODAY })
    const id = await added(cookie, { categoryId: food, amount: 1250, date: TODAY })

    await patchTransaction(cookie, id, { categoryId: otherIncome })

    expect((await list(cookie, { period: 'day', date: TODAY })).totals).toEqual({ income: 1250, expense: 450 })
  })

  it('refuses what adding refuses, and changes nothing', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    const id = await added(cookie, { categoryId: food, amount: 1250, date: TODAY })

    const res = await patchTransaction(cookie, id, {
      amount: 0,
      date: dayAfter(addYears(TODAY, 1)),
      note: 'a'.repeat(201),
      categoryId: 'food',
    })

    expect(res.status).toBe(400)
    const { fields } = (await res.json()) as { fields: Record<string, string[]> }
    expect(Object.keys(fields).sort()).toEqual(['amount', 'categoryId', 'date', 'note'])
    expect(await (await getTransaction(cookie, id)).json()).toMatchObject({ amount: 1250, date: TODAY })
  })

  it('refuses moving to an archived Category, but keeps an archived one it already has', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    const transport = await categoryId(cookie, 'expense', 'Transport')
    const id = await added(cookie, { categoryId: food, amount: 1250, date: TODAY })
    await db.update(categories).set({ archived: true }).where(eq(categories.id, food))
    const otherId = await added(cookie, { categoryId: transport, amount: 450, date: TODAY })

    const kept = await patchTransaction(cookie, id, { categoryId: food, amount: 980 })
    const moved = await patchTransaction(cookie, otherId, { categoryId: food })

    expect(kept.status).toBe(200)
    expect(await kept.json()).toMatchObject({ amount: 980, category: { id: food } })
    expect(moved.status).toBe(404)
    expect(await moved.json()).toMatchObject({ code: 'CATEGORY_NOT_FOUND' })
  })

  it('gives 404 for moving to another user’s Category, and changes nothing', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const food = await categoryId(aisyah, 'expense', 'Food')
    const hisFood = await categoryId(weiMing, 'expense', 'Food')
    const id = await added(aisyah, { categoryId: food, amount: 1250, date: TODAY })

    const theirs = await patchTransaction(aisyah, id, { categoryId: hisFood, amount: 1 })
    const missing = await patchTransaction(aisyah, id, { categoryId: '00000000-0000-4000-8000-000000000000' })

    expect(theirs.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await theirs.json()).toEqual(await missing.json())
    expect(await (await getTransaction(aisyah, id)).json()).toMatchObject({ amount: 1250, category: { id: food } })
  })

  it('gives user B 404 for user A’s Transaction, the same as for one that doesn’t exist, and A’s is unchanged', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const food = await categoryId(aisyah, 'expense', 'Food')
    const hisFood = await categoryId(weiMing, 'expense', 'Food')
    const id = await added(aisyah, { categoryId: food, amount: 1250, date: TODAY, note: 'Lunch' })

    const theirs = await patchTransaction(weiMing, id, { amount: 1, note: 'Mine now' })
    const moved = await patchTransaction(weiMing, id, { categoryId: hisFood })
    const missing = await patchTransaction(weiMing, '00000000-0000-4000-8000-000000000000', { amount: 1 })

    expect([theirs.status, moved.status, missing.status]).toEqual([404, 404, 404])
    expect(await theirs.json()).toEqual(await missing.json())
    expect(await (await getTransaction(aisyah, id)).json()).toMatchObject({
      amount: 1250,
      note: 'Lunch',
      category: { id: food },
    })
  })

  it('takes whichever save comes last', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    const id = await added(cookie, { categoryId: food, amount: 1250, date: TODAY })

    await patchTransaction(cookie, id, { amount: 900 })
    await patchTransaction(cookie, id, { amount: 1100 })

    expect(await (await getTransaction(cookie, id)).json()).toMatchObject({ amount: 1100 })
  })

  it('needs a session', async () => {
    const res = await patchTransaction(undefined, '00000000-0000-4000-8000-000000000000', { amount: 1 })

    expect(res.status).toBe(401)
  })
})

describe('GET /api/transactions/:id', () => {
  it('gives user B 404 for user A’s Transaction, the same as for one that doesn’t exist', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const food = await categoryId(aisyah, 'expense', 'Food')
    const id = await added(aisyah, { categoryId: food, amount: 1250, date: TODAY })

    const theirs = await getTransaction(weiMing, id)
    const missing = await getTransaction(weiMing, '00000000-0000-4000-8000-000000000000')
    const notAnId = await getTransaction(weiMing, 'not-an-id')

    expect([theirs.status, missing.status, notAnId.status]).toEqual([404, 404, 404])
    expect(await theirs.json()).toEqual(await missing.json())
    expect(await notAnId.json()).toEqual({ code: 'TRANSACTION_NOT_FOUND', message: 'That Transaction isn’t available' })
  })
})

describe('DELETE /api/transactions/:id', () => {
  it('removes it for good, from the list and the totals', async () => {
    const cookie = await signInNewUser()
    const food = await categoryId(cookie, 'expense', 'Food')
    await added(cookie, { categoryId: food, amount: 450, date: TODAY })
    const id = await added(cookie, { categoryId: food, amount: 1250, date: TODAY })

    const res = await deleteTransaction(cookie, id)

    expect(res.status).toBe(204)
    expect((await getTransaction(cookie, id)).status).toBe(404)
    const day = await list(cookie, { period: 'day', date: TODAY })
    expect(day.totals).toEqual({ income: 0, expense: 450 })
    expect(rows(day)).toEqual([[TODAY, 'Food', 450]])
    expect((await deleteTransaction(cookie, id)).status).toBe(404)
  })

  it('gives user B 404 for user A’s Transaction, the same as for one that doesn’t exist, and A’s stays', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const food = await categoryId(aisyah, 'expense', 'Food')
    const id = await added(aisyah, { categoryId: food, amount: 1250, date: TODAY })

    const theirs = await deleteTransaction(weiMing, id)
    const missing = await deleteTransaction(weiMing, '00000000-0000-4000-8000-000000000000')

    expect([theirs.status, missing.status]).toEqual([404, 404])
    expect(await theirs.json()).toEqual(await missing.json())
    expect((await getTransaction(aisyah, id)).status).toBe(200)
  })

  it('needs a session', async () => {
    const res = await deleteTransaction(undefined, '00000000-0000-4000-8000-000000000000')

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
