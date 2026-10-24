import { z } from 'zod'
import type { CategoryKind } from './categories.js'
import { CURRENCIES, type CurrencyCode } from './currency.js'

// The largest amount one Transaction can have, in minor units (RM1,000,000,000.00).
// The smallest is 1. Both fit a Postgres bigint and a JavaScript number exactly.
export const MAX_AMOUNT = 100_000_000_000

export function decimalPlacesOf(code: CurrencyCode): number {
  const currency = CURRENCIES.find((c) => c.code === code)
  if (!currency) throw new Error(`Unknown currency ${code}`)
  return currency.decimalPlaces
}

// Digits with optional thousands separators, then an optional fraction.
// Commas only ever separate thousands, so "12,50" isn't read as 12.50.
const TYPED_AMOUNT = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/

// What a person types into an amount field ("1,234.50"), read as minor units
// (123450 sen) with the currency's own decimal places. More decimal places
// than the currency has is refused, never rounded.
export function amountInputSchema(currency: CurrencyCode) {
  const decimalPlaces = decimalPlacesOf(currency)
  const example = decimalPlaces === 0 ? '1,500' : `12.${'50'.padEnd(decimalPlaces, '0')}`

  return z.string().transform((typed, ctx) => {
    const trimmed = typed.trim()
    if (trimmed === '') return refuse(ctx, 'Enter an amount')

    const match = TYPED_AMOUNT.exec(trimmed)
    if (!match) return refuse(ctx, `Enter an amount such as ${example}`)

    const whole = match[1]!.replaceAll(',', '')
    const fraction = match[2] ?? ''
    if (fraction.length > decimalPlaces) {
      return refuse(
        ctx,
        decimalPlaces === 0
          ? `Use a whole number: ${currency} has no decimal places`
          : `Use at most ${decimalPlaces} decimal places`,
      )
    }

    // In bigint, so a long string of digits can't lose precision before the
    // bound is checked.
    const minorUnits = BigInt(whole + fraction.padEnd(decimalPlaces, '0'))
    if (minorUnits === 0n) return refuse(ctx, 'Enter an amount above zero')
    if (minorUnits > BigInt(MAX_AMOUNT)) {
      return refuse(ctx, `Enter at most ${formatAmount(MAX_AMOUNT, currency)}`)
    }
    return Number(minorUnits)
  })
}

function refuse(ctx: z.RefinementCtx, message: string) {
  ctx.addIssue({ code: 'custom', message })
  return z.NEVER
}

const formatters = new Map<string, Intl.NumberFormat>()

// An amount in minor units for display, in English (Malaysia), the one format
// for everyone in v1: "RM1,234.50" for an Expense, "+RM3,000.00" for Income.
// Never red or green; the "+" alone tells them apart. Without a kind, as for
// a total under its own label, there's no sign.
export function formatAmount(minorUnits: number, currency: CurrencyCode, kind?: CategoryKind): string {
  const key = `${currency}:${kind ?? 'unsigned'}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency,
      signDisplay: kind === 'income' ? 'always' : 'auto',
    })
    formatters.set(key, formatter)
  }

  // Formatted from a decimal string, not minorUnits / 100, so no amount goes
  // through floating point on its way to the screen.
  const parts = formatter.formatToParts(toDecimalString(minorUnits, decimalPlacesOf(currency)))
  // en-MY writes "RM 1,234.50"; Malaysians write "RM1,234.50". The space stays
  // after a three-letter code ("SGD 1,234.50"), which would run into the digits.
  return parts
    .filter((part, i) => {
      const previous = parts[i - 1]
      return !(
        part.type === 'literal' &&
        part.value.trim() === '' &&
        previous?.type === 'currency' &&
        !/^[A-Z]{3}$/.test(previous.value)
      )
    })
    .map((part) => part.value)
    .join('')
}

// An amount in minor units as it starts in an amount field for editing:
// "1234.50" for 123450 sen, with no symbol or separators, which
// amountInputSchema reads back as the same amount.
export function amountForInput(minorUnits: number, currency: CurrencyCode): string {
  return toDecimalString(minorUnits, decimalPlacesOf(currency))
}

// 123450 with 2 decimal places is "1234.50".
function toDecimalString(minorUnits: number, decimalPlaces: number): `${number}` {
  if (!Number.isSafeInteger(minorUnits)) throw new Error(`Not a whole number of minor units: ${minorUnits}`)
  const sign = minorUnits < 0 ? '-' : ''
  const digits = String(Math.abs(minorUnits)).padStart(decimalPlaces + 1, '0')
  if (decimalPlaces === 0) return `${sign}${digits}` as `${number}`
  return `${sign}${digits.slice(0, -decimalPlaces)}.${digits.slice(-decimalPlaces)}` as `${number}`
}
