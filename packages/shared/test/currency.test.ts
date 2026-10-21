import { describe, expect, it } from 'vitest'
import { CURRENCIES, currencyCodeSchema } from '../src/index.js'

describe('CURRENCIES', () => {
  it('offers the signup currencies, MYR first', () => {
    expect(CURRENCIES.map((c) => c.code)).toEqual([
      'MYR',
      'SGD',
      'USD',
      'EUR',
      'GBP',
      'AUD',
      'JPY',
    ])
  })

  it('gives JPY no decimal places and the rest two', () => {
    const decimalPlaces = Object.fromEntries(
      CURRENCIES.map((c) => [c.code, c.decimalPlaces]),
    )
    expect(decimalPlaces).toEqual({
      MYR: 2,
      SGD: 2,
      USD: 2,
      EUR: 2,
      GBP: 2,
      AUD: 2,
      JPY: 0,
    })
  })

  // ISO 4217 as the JavaScript runtime knows it, so a typo in a new entry
  // fails here instead of shifting every amount by a factor of ten.
  it.each(CURRENCIES)('$code agrees with ISO 4217', ({ code, decimalPlaces }) => {
    const iso = new Intl.NumberFormat('en', { style: 'currency', currency: code })
    expect(iso.resolvedOptions().maximumFractionDigits).toBe(decimalPlaces)
  })
})

describe('currencyCodeSchema', () => {
  it('accepts a listed currency', () => {
    expect(currencyCodeSchema.parse('JPY')).toBe('JPY')
  })

  it.each(['KWD', 'myr', '', 'MYR '])('rejects %j', (value) => {
    expect(currencyCodeSchema.safeParse(value).success).toBe(false)
  })
})
