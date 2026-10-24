import { describe, expect, it } from 'vitest'
import { amountForInput, amountInputSchema, formatAmount, MAX_AMOUNT } from '../src/index.js'

describe('amountInputSchema', () => {
  it.each([
    ['12.50', 1250],
    ['12.5', 1250],
    ['12', 1200],
    ['0.01', 1],
    ['1,234.50', 123450],
    ['1,000,000,000', 100_000_000_000],
    [' 7.25 ', 725],
  ])('reads %j in MYR as %i sen', (typed, minorUnits) => {
    expect(amountInputSchema('MYR').parse(typed)).toBe(minorUnits)
  })

  it.each([
    ['1500', 1500],
    ['1,500', 1500],
  ])('reads %j in JPY as %i yen', (typed, minorUnits) => {
    expect(amountInputSchema('JPY').parse(typed)).toBe(minorUnits)
  })

  // Rounding would record a different amount from the one typed.
  it('refuses more decimal places than MYR has, instead of rounding', () => {
    expect(messageFor('MYR', '12.505')).toBe('Use at most 2 decimal places')
  })

  it('refuses any decimal places in JPY', () => {
    expect(messageFor('JPY', '1500.5')).toBe('Use a whole number: JPY has no decimal places')
  })

  it('refuses zero', () => {
    expect(messageFor('MYR', '0.00')).toBe('Enter an amount above zero')
  })

  it('refuses more than RM1,000,000,000.00', () => {
    expect(messageFor('MYR', '1,000,000,000.01')).toBe('Enter at most RM1,000,000,000.00')
    expect(messageFor('MYR', '99999999999999999999')).toBe('Enter at most RM1,000,000,000.00')
  })

  it('asks for an amount when the field is blank', () => {
    expect(messageFor('MYR', '  ')).toBe('Enter an amount')
  })

  // Commas only separate thousands, so "12,50" can't be read as 12.50.
  it.each(['12,50', '1,2345', ',100', '-5', '12.', 'RM12', '1e3', '12.50.1', 'twelve'])(
    'refuses %j as not an amount',
    (typed) => {
      expect(messageFor('MYR', typed)).toBe('Enter an amount such as 12.50')
    },
  )

  it('gives a JPY example without decimals', () => {
    expect(messageFor('JPY', 'abc')).toBe('Enter an amount such as 1,500')
  })
})

describe('formatAmount', () => {
  it('formats an Expense in English (Malaysia) with no sign', () => {
    expect(formatAmount(123450, 'MYR', 'expense')).toBe('RM1,234.50')
  })

  it('puts a "+" on Income', () => {
    expect(formatAmount(300000, 'MYR', 'income')).toBe('+RM3,000.00')
  })

  it('has no sign without a kind', () => {
    expect(formatAmount(300000, 'MYR')).toBe('RM3,000.00')
  })

  it('uses the currency’s own decimal places', () => {
    expect(formatAmount(1500, 'JPY', 'expense')).toBe('JP¥1,500')
    expect(formatAmount(5, 'MYR', 'expense')).toBe('RM0.05')
  })

  // A space after a currency code reads better than "SGD1,234.50". It's a
  // non-breaking one, so the code never ends a line on its own.
  it('keeps the space after a three-letter currency code', () => {
    expect(formatAmount(123450, 'SGD', 'expense')).toBe('SGD 1,234.50')
  })

  it('formats the largest amount exactly', () => {
    expect(formatAmount(MAX_AMOUNT, 'MYR', 'expense')).toBe('RM1,000,000,000.00')
  })
})

function messageFor(currency: 'MYR' | 'JPY', typed: string) {
  const result = amountInputSchema(currency).safeParse(typed)
  return result.success ? undefined : result.error.issues[0]?.message
}

describe('amountForInput', () => {
  it.each([
    [123450, 'MYR', '1234.50'],
    [1, 'MYR', '0.01'],
    [100_000_000_000, 'MYR', '1000000000.00'],
    [1500, 'JPY', '1500'],
  ] as const)('writes %i in %s as %j, which reads back the same', (minorUnits, currency, typed) => {
    expect(amountForInput(minorUnits, currency)).toBe(typed)
    expect(amountInputSchema(currency).parse(typed)).toBe(minorUnits)
  })
})
