import { describe, expect, it } from 'vitest'
import { budgetLimitsSchema, limitIn, limitInputSchema, MAX_AMOUNT, savingLimit } from '../src/index.js'

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
