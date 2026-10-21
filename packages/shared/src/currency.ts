import { z } from 'zod'

// The currencies offered at signup (v1-spec "Money"). Amounts are stored in
// minor units, and decimalPlaces says how many of them make one major unit
// (JPY has none). Adding a currency is one line here plus its test.
export const CURRENCIES = [
  { code: 'MYR', decimalPlaces: 2 },
  { code: 'SGD', decimalPlaces: 2 },
  { code: 'USD', decimalPlaces: 2 },
  { code: 'EUR', decimalPlaces: 2 },
  { code: 'GBP', decimalPlaces: 2 },
  { code: 'AUD', decimalPlaces: 2 },
  { code: 'JPY', decimalPlaces: 0 },
] as const

export type Currency = (typeof CURRENCIES)[number]
export type CurrencyCode = Currency['code']

export const DEFAULT_CURRENCY: CurrencyCode = 'MYR'

export const currencyCodeSchema = z.enum(
  CURRENCIES.map((c) => c.code) as [CurrencyCode, ...CurrencyCode[]],
  { error: 'Choose a currency from the list' },
)
