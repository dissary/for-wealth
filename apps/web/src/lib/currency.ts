import type { CurrencyCode } from '@for-wealth/shared'

const names = new Intl.DisplayNames(['en'], { type: 'currency' })

// "Malaysian Ringgit (MYR)"
export function currencyLabel(code: CurrencyCode) {
  return `${names.of(code) ?? code} (${code})`
}
