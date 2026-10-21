import { currencyCodeSchema } from '@for-wealth/shared'
import { Hono } from 'hono'
import { requireSession, type SignedInEnv } from '../require-session.js'

// The signed-in user's own details.
export const me = new Hono<SignedInEnv>().use(requireSession).get('/', (c) => {
  const { id, name, email, currency, timeZone } = c.get('user')
  // Sign-up only stores a listed currency, but Better Auth types the field as
  // a plain string. Parsed so the web app gets the CurrencyCode type.
  return c.json({ id, name, email, currency: currencyCodeSchema.parse(currency), timeZone })
})
