import { todayIn } from '@for-wealth/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../src/db/client.js'
import { writeLimit } from '../src/write-limit.js'
import {
  deleteTransaction,
  getCategories,
  getTransaction,
  getTransactions,
  NEW_USER,
  OTHER_USER,
  patchTransaction,
  postTransaction,
  signInNewUser,
  startFresh,
} from './helpers.js'

const TODAY = todayIn(NEW_USER.timeZone)

// The clock the limit reads, moved by hand.
let now = 0

async function signInWithFood(user = NEW_USER) {
  const cookie = await signInNewUser(user)
  const { expense } = (await (await getCategories(cookie)).json()) as { expense: { id: string }[] }
  return { cookie, food: expense[0]!.id }
}

async function writeTimes(times: number, cookie: string, categoryId: string) {
  const statuses = []
  for (let i = 0; i < times; i++) {
    statuses.push((await postTransaction(cookie, { categoryId, amount: 100, date: TODAY })).status)
  }
  return statuses
}

beforeEach(async () => {
  await startFresh()
  now = 1_000_000
  writeLimit.now = () => now
})
afterAll(() => pool.end())

describe('the per-user write limit', () => {
  it('refuses the 61st write in a minute with 429', async () => {
    const { cookie, food } = await signInWithFood()

    const statuses = await writeTimes(61, cookie, food)

    expect(statuses.slice(0, 60).every((s) => s === 201)).toBe(true)
    const refused = await postTransaction(cookie, { categoryId: food, amount: 100, date: TODAY })
    expect(statuses[60]).toBe(429)
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('60')
    const day = (await (await getTransactions(cookie, { period: 'day', date: TODAY })).json()) as { transactions: unknown[] }
    expect(day.transactions).toHaveLength(60)
  })

  it('counts refused and invalid writes too', async () => {
    const { cookie, food } = await signInWithFood()

    for (let i = 0; i < 60; i++) await postTransaction(cookie, { categoryId: food, amount: 0, date: TODAY })

    expect(await writeTimes(1, cookie, food)).toEqual([429])
  })

  it('lets writes through again once the oldest is a minute old', async () => {
    const { cookie, food } = await signInWithFood()
    await writeTimes(30, cookie, food)
    now += 30_000
    await writeTimes(30, cookie, food)

    now += 29_999
    expect(await writeTimes(1, cookie, food)).toEqual([429])
    now += 1
    expect(await writeTimes(30, cookie, food)).toEqual(Array(30).fill(201))
    expect(await writeTimes(1, cookie, food)).toEqual([429])
  })

  it('counts each user on their own', async () => {
    const aisyah = await signInWithFood(NEW_USER)
    const weiMing = await signInWithFood(OTHER_USER)
    await writeTimes(60, aisyah.cookie, aisyah.food)

    expect(await writeTimes(1, weiMing.cookie, weiMing.food)).toEqual([201])
  })

  it('doesn’t count or limit reads', async () => {
    const { cookie, food } = await signInWithFood()
    await writeTimes(60, cookie, food)

    expect((await getTransactions(cookie, { period: 'day', date: TODAY })).status).toBe(200)
    expect((await getCategories(cookie)).status).toBe(200)
  })

  it('counts edits and deletes, and refuses them over the limit', async () => {
    const { cookie, food } = await signInWithFood()
    const added = await postTransaction(cookie, { categoryId: food, amount: 100, date: TODAY })
    const { id } = (await added.json()) as { id: string }
    for (let i = 0; i < 29; i++) expect((await patchTransaction(cookie, id, { amount: 200 + i })).status).toBe(200)
    for (let i = 0; i < 30; i++) await deleteTransaction(cookie, '00000000-0000-4000-8000-000000000000')

    const edited = await patchTransaction(cookie, id, { amount: 999 })
    const deleted = await deleteTransaction(cookie, id)

    expect([edited.status, deleted.status]).toEqual([429, 429])
    expect(await (await getTransaction(cookie, id)).json()).toMatchObject({ amount: 228 })
  })
})
