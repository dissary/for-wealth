import { addMonths, monthOf, periodRange, todayIn } from '@for-wealth/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/db/client.js'
import {
  getCategories,
  getTrends,
  NEW_USER,
  OTHER_USER,
  postTransaction,
  signInNewUser,
  startFresh,
} from './helpers.js'

type Categories = { income: { id: string; name: string }[]; expense: { id: string; name: string }[] }

// The signed-in user's Categories of one kind, by name.
async function categoryIds(cookie: string, kind: keyof Categories) {
  const all = (await (await getCategories(cookie)).json()) as Categories
  return Object.fromEntries(all[kind].map((c) => [c.name, c.id]))
}

// Today and this month in the user's zone (Kuala Lumpur).
const TODAY = todayIn(NEW_USER.timeZone)
const MONTH = monthOf(TODAY)
const FIRST = `${MONTH}-01`

// The month `months` before this one, and its first day.
const monthsAgo = (months: number) => monthOf(addMonths(FIRST, -months))
const firstOf = (months: number) => `${monthsAgo(months)}-01`

async function add(cookie: string, categoryId: string | undefined, amount: number, date: string) {
  const res = await postTransaction(cookie, { categoryId, amount, date })
  if (res.status !== 201) throw new Error(`Adding a Transaction failed: ${res.status}`)
}

type Trends = {
  to: string
  first: string | null
  months: { month: string; income: number; expense: number }[]
}

async function trendsFor(cookie: string, to = MONTH) {
  const res = await getTrends(cookie, { to })
  if (res.status !== 200) throw new Error(`Loading Trends failed: ${res.status}`)
  return (await res.json()) as Trends
}

beforeEach(async () => {
  await startFresh()
})
afterAll(() => pool.end())

describe('GET /api/trends', () => {
  it('totals each month’s Income and Expenses, from the first Transaction’s month, with empty months at 0', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    const income = await categoryIds(cookie, 'income')
    await add(cookie, income.Salary, 500_000, firstOf(3))
    await add(cookie, expense.Food, 1_250, firstOf(3))
    await add(cookie, expense.Transport, 4_000, firstOf(3))
    await add(cookie, income.Bonus, 20_000, firstOf(1))
    await add(cookie, expense.Food, 80_750, FIRST)

    const res = await getTrends(cookie, { to: MONTH })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      to: MONTH,
      first: monthsAgo(3),
      months: [
        { month: monthsAgo(3), income: 500_000, expense: 5_250 },
        { month: monthsAgo(2), income: 0, expense: 0 },
        { month: monthsAgo(1), income: 20_000, expense: 0 },
        { month: MONTH, income: 0, expense: 80_750 },
      ],
    })
  })

  it('shows 12 months once there is more than a year of Transactions, counting none from before them', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    await add(cookie, expense.Food, 9_999, firstOf(12))
    await add(cookie, expense.Food, 1_250, firstOf(11))

    const body = await trendsFor(cookie)

    expect(body.first).toBe(monthsAgo(12))
    expect(body.months.map((m) => m.month)).toEqual(Array.from({ length: 12 }, (_, i) => monthsAgo(11 - i)))
    expect(body.months[0]).toEqual({ month: monthsAgo(11), income: 0, expense: 1_250 })
    expect(body.months.reduce((sum, m) => sum + m.expense, 0)).toBe(1_250)
  })

  // The last day of the month is later than today on every day but that one.
  it('counts Transactions dated later this month', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    await add(cookie, expense.Food, 1_250, periodRange('month', FIRST).to)

    const body = await trendsFor(cookie)

    expect(body.months).toEqual([{ month: MONTH, income: 0, expense: 1_250 }])
  })

  it('ends with `to`, leaving out later months', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    await add(cookie, expense.Food, 1_250, firstOf(2))
    await add(cookie, expense.Food, 2_500, firstOf(1))

    const body = await trendsFor(cookie, monthsAgo(2))

    expect(body).toEqual({
      to: monthsAgo(2),
      first: monthsAgo(2),
      months: [{ month: monthsAgo(2), income: 0, expense: 1_250 }],
    })
  })

  it('has no months with no Transactions', async () => {
    const cookie = await signInNewUser()

    expect(await trendsFor(cookie)).toEqual({ to: MONTH, first: null, months: [] })
  })

  it('has no months when the first Transaction is after `to`', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    await add(cookie, expense.Food, 1_250, FIRST)

    expect(await trendsFor(cookie, monthsAgo(1))).toEqual({ to: monthsAgo(1), first: MONTH, months: [] })
  })
})

describe('GET /api/trends: the month', () => {
  it.each([
    ['no `to`', {}],
    ['a malformed month', { to: '2026-13' }],
    ['a month without its zero', { to: '2026-1' }],
    ['a date', { to: FIRST }],
    ['the month before 2000-01-01', { to: '1999-12' }],
    // This month is taken in the user's zone (Kuala Lumpur).
    ['the month after this one', { to: monthOf(addMonths(FIRST, 1)) }],
  ])('gives 400 for %s', async (_, query) => {
    const cookie = await signInNewUser()

    const res = await getTrends(cookie, query)

    expect(res.status).toBe(400)
    expect(Object.keys(((await res.json()) as { fields: object }).fields)).toEqual(['to'])
  })

  it('gives 400 for any other parameter', async () => {
    const cookie = await signInNewUser()

    const res = await getTrends(cookie, { to: MONTH, month: MONTH })

    expect(res.status).toBe(400)
  })

  it.each([['2000-01'], [MONTH]])('accepts %s, at a bound', async (to) => {
    const cookie = await signInNewUser()

    const res = await getTrends(cookie, { to })

    expect(res.status).toBe(200)
  })
})

describe('GET /api/trends: whose data', () => {
  it('never counts another user’s Transactions, in a total or in `first`', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const herExpenses = await categoryIds(aisyah, 'expense')
    const hisExpenses = await categoryIds(weiMing, 'expense')
    const hisIncome = await categoryIds(weiMing, 'income')
    await add(aisyah, herExpenses.Food, 1_250, firstOf(1))
    // Earlier than hers, so it would move `first` if it were counted.
    await add(weiMing, hisExpenses.Food, 9_000, firstOf(5))
    await add(weiMing, hisExpenses.Food, 9_000, firstOf(1))
    await add(weiMing, hisIncome.Salary, 300_000, FIRST)

    const body = await trendsFor(aisyah)

    expect(body).toEqual({
      to: MONTH,
      first: monthsAgo(1),
      months: [
        { month: monthsAgo(1), income: 0, expense: 1_250 },
        { month: MONTH, income: 0, expense: 0 },
      ],
    })
  })

  it('gives 401 with no session', async () => {
    const res = await getTrends(undefined, { to: MONTH })

    expect(res.status).toBe(401)
  })
})
