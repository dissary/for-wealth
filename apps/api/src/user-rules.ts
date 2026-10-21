import { nameSchema } from '@for-wealth/shared'
import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'

// Listed as the plugin's error codes, so they appear in the Auth type and the
// web app can match on them without repeating the strings.
const ERROR_CODES = {
  INVALID_NAME: { code: 'INVALID_NAME', message: 'Invalid name' },
  CURRENCY_LOCKED: {
    code: 'CURRENCY_LOCKED',
    message: "Currency can't be changed after signup",
  },
} as const

// Rules about the user record that Better Auth's field options can't express.
// `name` is a core field, so it can't take a validator like currency and time
// zone do; it is checked with the schema the signup form uses.
export const userRules = () =>
  ({
    id: 'user-rules',
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === '/sign-up/email' || ctx.path === '/update-user',
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.path === '/update-user' && !(ctx.body && 'name' in ctx.body)) return
            const name = nameSchema.safeParse(ctx.body?.name)
            if (!name.success) {
              throw APIError.from('BAD_REQUEST', {
                ...ERROR_CODES.INVALID_NAME,
                message: name.error.issues[0]?.message ?? ERROR_CODES.INVALID_NAME.message,
              })
            }
            return { context: { body: { ...ctx.body, name: name.data } } }
          }),
        },
        {
          // Each amount is stored in the currency's minor units, so changing
          // it would silently change the value of every past amount (v1-spec
          // "Money").
          matcher: (ctx) => ctx.path === '/update-user',
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.body && 'currency' in ctx.body) {
              throw APIError.from('BAD_REQUEST', ERROR_CODES.CURRENCY_LOCKED)
            }
          }),
        },
      ],
    },
    $ERROR_CODES: ERROR_CODES,
  }) satisfies BetterAuthPlugin
