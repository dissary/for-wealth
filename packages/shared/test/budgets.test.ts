import { describe, expect, it } from 'vitest'
import {
  budgetLimitsSchema,
  budgetPerDay,
  budgetProgress,
  formatAmount,
  limitIn,
  limitInputSchema,
  MAX_AMOUNT,
  savingLimit,
} from '../src/index.js'

describe('limitIn', () => {
  it('has no limit before any change', () => {
    expect(limitIn([], '2026-10')).toBeNull()
  })

  it('carries a change forward from its month', () => {
    const changes = [{ month: '2026-10', limit: 50_000 }]

    expect(limitIn(changes, '2026-09')).toBeNull()
    expect(limitIn(changes, '2026-10')).toBe(50_000)
    expect(limitIn(changes, '2027-03')).toBe(50_000)
  })

  it('takes a later change from its own month on, leaving the months before it', () => {
    const changes = [
      { month: '2026-10', limit: 50_000 },
      { month: '2026-12', limit: 70_000 },
    ]

    expect(limitIn(changes, '2026-11')).toBe(50_000)
    expect(limitIn(changes, '2026-12')).toBe(70_000)
    expect(limitIn(changes, '2027-01')).toBe(70_000)
  })

  it('has no limit from a removal on', () => {
    const changes = [
      { month: '2026-10', limit: 50_000 },
      { month: '2026-12', limit: null },
    ]

    expect(limitIn(changes, '2026-11')).toBe(50_000)
    expect(limitIn(changes, '2026-12')).toBeNull()
    expect(limitIn(changes, '2027-06')).toBeNull()
  })

  // Reaches the months up to the next change, and never past it.
  it('takes a change to an earlier month up to the next change', () => {
    const changes = [
      { month: '2026-12', limit: 70_000 },
      { month: '2026-10', limit: 50_000 },
    ]

    expect(limitIn(changes, '2026-09')).toBeNull()
    expect(limitIn(changes, '2026-11')).toBe(50_000)
    expect(limitIn(changes, '2026-12')).toBe(70_000)
  })
})

describe('savingLimit', () => {
  const changes = [
    { month: '2026-10', limit: 50_000 },
    { month: '2026-12', limit: 70_000 },
  ]

  it('stores nothing for the limit the month already has', () => {
    expect(savingLimit(changes, '2026-11', 50_000)).toBe('nothing')
    expect(savingLimit(changes, '2026-12', 70_000)).toBe('nothing')
    expect(savingLimit([], '2026-10', null)).toBe('nothing')
  })

  it('stores a change for a new limit or a removal', () => {
    expect(savingLimit(changes, '2026-11', 60_000)).toBe('store')
    expect(savingLimit(changes, '2026-11', null)).toBe('store')
    expect(savingLimit([], '2026-10', 50_000)).toBe('store')
  })

  // A Category has at most one change per month, so this replaces it.
  it('stores a change over the month’s own', () => {
    expect(savingLimit(changes, '2026-12', 60_000)).toBe('store')
  })

  // Without its own change, the month carries the earlier limit anyway.
  it('drops the month’s own change when the new limit is the one carried into it', () => {
    expect(savingLimit(changes, '2026-12', 50_000)).toBe('drop')
    expect(savingLimit(changes, '2026-10', null)).toBe('drop')
  })
})

describe('limitInputSchema', () => {
  it('reads a blank field as no limit', () => {
    expect(limitInputSchema('MYR').parse('')).toBeNull()
    expect(limitInputSchema('MYR').parse('  ')).toBeNull()
  })

  // v1-spec "Budgets": the same rules as a Transaction's amount.
  it('reads a limit as a Transaction’s amount', () => {
    expect(limitInputSchema('MYR').parse('1,234.50')).toBe(123_450)
    expect(limitInputSchema('JPY').parse('1,500')).toBe(1_500)
  })

  it.each([
    ['0', 'Enter an amount above zero'],
    ['12.505', 'Use at most 2 decimal places'],
    ['12,50', 'Enter an amount such as 12.50'],
    ['1000000000.01', 'Enter at most RM1,000,000,000.00'],
  ])('refuses %j in MYR, saying why', (typed, message) => {
    const result = limitInputSchema('MYR').safeParse(typed)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([message])
  })
})

describe('budgetLimitsSchema', () => {
  const FOOD = '6f1c1e0a-3b7d-4c55-9a1e-2f4b8c9d0e1f'
  const TRANSPORT = '0b6c5d1e-8f2a-4c3b-9d7e-1a2b3c4d5e6f'

  it('takes a limit or null for each Category', () => {
    const limits = [
      { categoryId: FOOD, limit: 50_000 },
      { categoryId: TRANSPORT, limit: null },
    ]
    expect(budgetLimitsSchema.parse({ limits })).toEqual({ limits })
  })

  it.each([0, -1, MAX_AMOUNT + 1, 12.5, '50000', undefined])('refuses a limit of %j', (limit) => {
    expect(budgetLimitsSchema.safeParse({ limits: [{ categoryId: FOOD, limit }] }).success).toBe(false)
  })

  it('accepts a limit of 1 minor unit up to the largest amount', () => {
    for (const limit of [1, MAX_AMOUNT]) {
      expect(budgetLimitsSchema.safeParse({ limits: [{ categoryId: FOOD, limit }] }).success).toBe(true)
    }
  })

  it('refuses the same Category twice', () => {
    const limits = [
      { categoryId: FOOD, limit: 50_000 },
      { categoryId: FOOD, limit: 60_000 },
    ]
    expect(budgetLimitsSchema.safeParse({ limits }).success).toBe(false)
  })
})

describe('budgetProgress', () => {
  it('fills the bar to the share of the limit spent, with the rest left', () => {
    expect(budgetProgress(8_000, 50_000)).toEqual({ fill: 0.16, overspent: false, left: 42_000 })
  })

  it('leaves the bar empty with nothing spent', () => {
    expect(budgetProgress(0, 50_000)).toEqual({ fill: 0, overspent: false, left: 50_000 })
  })

  // v1-spec "Budgets": spending exactly the limit is not Overspent.
  it('fills the bar with nothing left at exactly the limit', () => {
    expect(budgetProgress(50_000, 50_000)).toEqual({ fill: 1, overspent: false, left: 0 })
  })

  it('is Overspent past the limit, by how much, with the bar no wider than full', () => {
    expect(budgetProgress(54_000, 50_000)).toEqual({ fill: 1, overspent: true, by: 4_000 })
    expect(budgetProgress(50_001, 50_000)).toEqual({ fill: 1, overspent: true, by: 1 })
  })
})

describe('budgetPerDay', () => {
  // v1-spec "Budgets": RM420 left ÷ 12 days = RM35/day, counting today.
  it('spreads the money left over the days left in the month, counting today', () => {
    expect(budgetPerDay(42_000, '2026-10', '2026-10-20')).toBe(3_500)
  })

  // So it never shows more than is really left.
  it('rounds down to a whole minor unit', () => {
    expect(budgetPerDay(42_011, '2026-10', '2026-10-20')).toBe(3_500)
    expect(budgetPerDay(100, '2026-10', '2026-10-29')).toBe(33)
  })

  it('is all the money left on the last day of the month', () => {
    expect(budgetPerDay(42_011, '2026-10', '2026-10-31')).toBe(42_011)
    expect(budgetPerDay(42_011, '2026-02', '2026-02-28')).toBe(42_011)
  })

  it('is 0 with nothing left', () => {
    expect(budgetPerDay(0, '2026-10', '2026-10-20')).toBe(0)
  })

  // A whole minor unit is a whole yen, as JPY has no decimal places: ¥1,000
  // over 3 days shows as ¥333, never ¥333.33.
  it('reads as whole yen in JPY', () => {
    expect(formatAmount(budgetPerDay(1_000, '2026-10', '2026-10-29')!, 'JPY')).toBe('JP¥333')
  })

  // v1-spec "Budgets": for this month only, so the user's today is in it.
  it('has no figure for a past or future month', () => {
    expect(budgetPerDay(42_000, '2026-09', '2026-10-20')).toBeNull()
    expect(budgetPerDay(42_000, '2026-11', '2026-10-20')).toBeNull()
  })
})
