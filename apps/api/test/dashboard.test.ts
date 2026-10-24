import { addDays, addMonths, addYears, periodRange, todayIn } from '@for-wealth/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, pool } from '../src/db/client.js'
import { categories } from '../src/db/schema/index.js'
import {
  getCategories,
  getDashboard,
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

// This month in the user's zone (Kuala Lumpur), and its first day, which is
// never later than today.
const TODAY = todayIn(NEW_USER.timeZone)
const MONTH = TODAY.slice(0, 7)
const FIRST = `${MONTH}-01`

async function add(cookie: string, categoryId: string | undefined, amount: number, date = FIRST) {
  const res = await postTransaction(cookie, { categoryId, amount, date })
  if (res.status !== 201) throw new Error(`Adding a Transaction failed: ${res.status}`)
}

type Dashboard = {
  month: string
  totals: { income: number; expense: number }
  expenseCategories: { category: { id: string; name: string; archived: boolean }; total: number }[]
}

// This month's Dashboard for the signed-in user.
async function dashboardFor(cookie: string) {
  const res = await getDashboard(cookie, { month: MONTH })
  if (res.status !== 200) throw new Error(`Loading the Dashboard failed: ${res.status}`)
  return (await res.json()) as Dashboard
}

beforeEach(async () => {
  await startFresh()
})
afterAll(() => pool.end())

describe('GET /api/dashboard', () => {
  it('totals the month and lists Expenses by Category, largest first', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    const income = await categoryIds(cookie, 'income')
    await add(cookie, expense.Food, 1_250)
    await add(cookie, expense.Food, 80_750)
    // Equal totals: Transport comes before Housing in position order.
    await add(cookie, expense.Housing, 50_000)
    await add(cookie, expense.Transport, 50_000)
    await add(cookie, expense.Health, 300)
    await add(cookie, income.Salary, 500_000)
    await add(cookie, income.Bonus, 20_000)

    const res = await getDashboard(cookie, { month: MONTH })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      month: MONTH,
      totals: { income: 520_000, expense: 182_300 },
      // Categories with no Expenses this month are left out.
      expenseCategories: [
        { category: { id: expense.Food, name: 'Food', archived: false }, total: 82_000 },
        { category: { id: expense.Transport, name: 'Transport', archived: false }, total: 50_000 },
        { category: { id: expense.Housing, name: 'Housing', archived: false }, total: 50_000 },
        { category: { id: expense.Health, name: 'Health', archived: false }, total: 300 },
      ],
    })
  })

  it('lists an archived Category with Expenses that month', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    await add(cookie, expense.Food, 1_250)
    await db.update(categories).set({ archived: true }).where(eq(categories.id, expense.Food!))

    const body = await dashboardFor(cookie)

    expect(body.expenseCategories).toEqual([
      { category: { id: expense.Food, name: 'Food', archived: true }, total: 1_250 },
    ])
  })

  // The last day of the month is later than today on every day but that one.
  it('counts Transactions dated later this month', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    const income = await categoryIds(cookie, 'income')
    const last = periodRange('month', FIRST).to
    await add(cookie, expense.Food, 1_250, last)
    await add(cookie, income.Salary, 500_000, last)

    const body = await dashboardFor(cookie)

    expect(body.totals).toEqual({ income: 500_000, expense: 1_250 })
    expect(body.expenseCategories).toEqual([
      { category: { id: expense.Food, name: 'Food', archived: false }, total: 1_250 },
    ])
  })

  it('leaves out the months before and after', async () => {
    const cookie = await signInNewUser()
    const expense = await categoryIds(cookie, 'expense')
    const { to } = periodRange('month', FIRST)
    await add(cookie, expense.Food, 1_250, addDays(FIRST, -1))
    await add(cookie, expense.Food, 2_500, addDays(to, 1))

    const body = await dashboardFor(cookie)

    expect(body).toEqual({ month: MONTH, totals: { income: 0, expense: 0 }, expenseCategories: [] })
  })
})

describe('GET /api/dashboard: the month', () => {
  // Bounds are the months holding 2000-01-01 and one year after today, with
  // today taken in the user's zone (Kuala Lumpur).
  const LATEST_MONTH = addYears(TODAY, 1).slice(0, 7)
  const AFTER_LATEST = addMonths(`${LATEST_MONTH}-01`, 1).slice(0, 7)

  it.each([
    ['no month', {}],
    ['a malformed month', { month: '2026-13' }],
    ['a month without its zero', { month: '2026-1' }],
    ['a date', { month: '2026-10-01' }],
    ['a month name', { month: 'October' }],
    ['the month before 2000-01-01', { month: '1999-12' }],
    ['the month after one year from today', { month: AFTER_LATEST }],
  ])('gives 400 for %s', async (_, query) => {
    const cookie = await signInNewUser()

    const res = await getDashboard(cookie, query)

    expect(res.status).toBe(400)
    expect(Object.keys(((await res.json()) as { fields: object }).fields)).toEqual(['month'])
  })

  it('gives 400 for any other parameter', async () => {
    const cookie = await signInNewUser()

    const res = await getDashboard(cookie, { month: MONTH, period: 'month' })

    expect(res.status).toBe(400)
  })

  it.each([['2000-01'], [LATEST_MONTH]])('accepts %s, at a bound', async (month) => {
    const cookie = await signInNewUser()

    const res = await getDashboard(cookie, { month })

    expect(res.status).toBe(200)
  })
})

describe('GET /api/dashboard: whose data', () => {
  it('never counts or lists another user’s Transactions', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    const herExpenses = await categoryIds(aisyah, 'expense')
    const hisExpenses = await categoryIds(weiMing, 'expense')
    const hisIncome = await categoryIds(weiMing, 'income')
    await add(aisyah, herExpenses.Food, 1_250)
    await add(weiMing, hisExpenses.Food, 9_000)
    await add(weiMing, hisExpenses.Transport, 4_000)
    await add(weiMing, hisIncome.Salary, 300_000)

    const body = await dashboardFor(aisyah)

    expect(body.totals).toEqual({ income: 0, expense: 1_250 })
    expect(body.expenseCategories).toEqual([
      { category: { id: herExpenses.Food, name: 'Food', archived: false }, total: 1_250 },
    ])
  })

  it('gives 401 with no session', async () => {
    const res = await getDashboard(undefined, { month: MONTH })

    expect(res.status).toBe(401)
  })
})
