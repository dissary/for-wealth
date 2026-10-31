import { addDays, isoWeekday, todayIn } from '@for-wealth/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import app from '../src/app.js'
import { pool } from '../src/db/client.js'
import {
  APP_ORIGIN,
  getCategories,
  getRecurring,
  getTransaction,
  NEW_USER,
  postRecurring,
  postTransaction,
  signInNewUser,
  startFresh,
} from './helpers.js'

beforeEach(async () => {
  await startFresh()
})
afterAll(() => pool.end())

function updateUser(cookie: string, body: Record<string, unknown>) {
  return app.request('/api/auth/update-user', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_ORIGIN, cookie },
    body: JSON.stringify(body),
  })
}

async function signedInUser(cookie: string) {
  const res = await app.request('/api/auth/get-session', { headers: { cookie } })
  return ((await res.json()) as { user: Record<string, unknown> }).user
}

describe('changing your details after signup', () => {
  it('refuses a new currency and keeps the old one', async () => {
    const cookie = await signInNewUser()

    const res = await updateUser(cookie, { currency: 'USD' })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'CURRENCY_LOCKED' })
    expect(await signedInUser(cookie)).toMatchObject({ currency: 'SGD' })
  })

  it('refuses a currency sent alongside other changes, changing nothing', async () => {
    const cookie = await signInNewUser()

    const res = await updateUser(cookie, { name: 'Aisyah R', currency: 'SGD' })

    expect(res.status).toBe(400)
    expect(await signedInUser(cookie)).toMatchObject({ name: 'Aisyah' })
  })

  it('refuses a blank name and keeps the old one', async () => {
    const cookie = await signInNewUser()

    const res = await updateUser(cookie, { name: '  ' })

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_NAME' })
    expect(await signedInUser(cookie)).toMatchObject({ name: 'Aisyah' })
  })

  // Settings (slice 6) lets people change it.
  it('accepts a new time zone, in its canonical spelling', async () => {
    const cookie = await signInNewUser()

    const res = await updateUser(cookie, { timeZone: 'europe/london' })

    expect(res.status).toBe(200)
    expect(await signedInUser(cookie)).toMatchObject({ timeZone: 'Europe/London' })
  })

  it('refuses an unknown time zone', async () => {
    const cookie = await signInNewUser()

    const res = await updateUser(cookie, { timeZone: 'Mars/Olympus_Mons' })

    expect(res.status).toBe(400)
    expect(await signedInUser(cookie)).toMatchObject({ timeZone: 'Asia/Kuala_Lumpur' })
  })

  it('refuses a fixed offset', async () => {
    const cookie = await signInNewUser()

    const res = await updateUser(cookie, { timeZone: '+09:00' })

    expect(res.status).toBe(400)
    expect(await signedInUser(cookie)).toMatchObject({ timeZone: 'Asia/Kuala_Lumpur' })
  })
})

// Pago Pago is UTC-11 and Kiritimati UTC+14, neither with daylight saving, so
// at any moment Kiritimati's date is a day or two after Pago Pago's.
const BEHIND = 'Pacific/Pago_Pago'
const AHEAD = 'Pacific/Kiritimati'

type Listing = { active: { id: string; nextDueDate: string }[] }

describe('after changing the time zone', () => {
  async function expenseCategoryId(cookie: string) {
    const all = (await (await getCategories(cookie)).json()) as { expense: { id: string }[] }
    return all.expense[0]!.id
  }

  function addRecurring(cookie: string, categoryId: string, startDate: string) {
    return postRecurring(cookie, {
      categoryId,
      amount: 5_000,
      note: null,
      varies: false,
      schedule: { frequency: 'weekly', weekday: isoWeekday(startDate) },
      startDate,
    })
  }

  it('takes today in the new zone', async () => {
    const cookie = await signInNewUser({ ...NEW_USER, timeZone: BEHIND })
    const categoryId = await expenseCategoryId(cookie)
    const yesterdayAhead = addDays(todayIn(AHEAD), -1)
    expect(yesterdayAhead >= todayIn(BEHIND)).toBe(true)

    expect((await updateUser(cookie, { timeZone: AHEAD })).status).toBe(200)

    // A Recurring Transaction can't start before today.
    const refused = await addRecurring(cookie, categoryId, yesterdayAhead)
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ fields: { startDate: ['Start today or later'] } })
    expect((await addRecurring(cookie, categoryId, todayIn(AHEAD))).status).toBe(201)
  })

  it('catches up Recurring Transactions to today in the new zone', async () => {
    const cookie = await signInNewUser({ ...NEW_USER, timeZone: BEHIND })
    const categoryId = await expenseCategoryId(cookie)
    // Due on today in Kiritimati, still to come in Pago Pago.
    const dueDate = todayIn(AHEAD)
    const added = await addRecurring(cookie, categoryId, dueDate)
    expect(added.status).toBe(201)
    const { id } = (await added.json()) as { id: string }

    const before = (await (await getRecurring(cookie)).json()) as Listing
    expect(before.active).toMatchObject([{ id, nextDueDate: dueDate }])

    expect((await updateUser(cookie, { timeZone: AHEAD })).status).toBe(200)

    const after = (await (await getRecurring(cookie)).json()) as Listing
    expect(after.active).toMatchObject([{ id, nextDueDate: addDays(dueDate, 7) }])
  })

  it('leaves the dates of Transactions as they were', async () => {
    const cookie = await signInNewUser({ ...NEW_USER, timeZone: BEHIND })
    const categoryId = await expenseCategoryId(cookie)
    const date = todayIn(BEHIND)
    const posted = await postTransaction(cookie, { categoryId, amount: 1_250, date, note: null })
    const { id } = (await posted.json()) as { id: string }

    expect((await updateUser(cookie, { timeZone: AHEAD })).status).toBe(200)

    expect(await (await getTransaction(cookie, id)).json()).toMatchObject({ date })
  })
})
