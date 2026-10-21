import {
  currencyCodeSchema,
  DEFAULT_CURRENCY,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  timeZoneSchema,
} from '@for-wealth/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { haveIBeenPwned } from 'better-auth/plugins'
import { db } from './db/client.js'
import * as schema from './db/schema/auth.js'
import { sendInBackground } from './email.js'
import { env } from './env.js'
import { userRules } from './user-rules.js'

// After changing anything that affects the tables (fields, plugins), run
// `pnpm auth:generate`, then `pnpm db:generate` and `pnpm db:migrate`
// (from the repo root).
export const auth = betterAuth({
  appName: 'For Wealth',
  // The address the browser uses, so email links and the session cookie go
  // through the Vite proxy in development.
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    usePlural: true,
    transaction: true,
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    // Also makes sign-up answer the same way whether or not the email
    // already has an account.
    requireEmailVerification: true,
  },

  emailVerification: {
    sendOnSignUp: true,
    // Signing in before verifying is refused and sends a fresh link. It's the
    // way to replace an expired one, as signing up again sends nothing.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendInBackground({
        to: user.email,
        subject: 'Verify your email for For Wealth',
        text: `Open this link to verify your email and sign in:\n${url}`,
      })
    },
  },

  user: {
    additionalFields: {
      currency: {
        type: 'string',
        required: true,
        defaultValue: DEFAULT_CURRENCY,
        validator: { input: currencyCodeSchema },
      },
      // No default: a wrong zone silently shifts "today", so an email
      // sign-up must send the one its browser reports.
      timeZone: {
        type: 'string',
        required: true,
        validator: { input: timeZoneSchema },
      },
    },
  },

  plugins: [
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        'This password has appeared in a data breach. Choose a different one.',
    }),
    userRules(),
  ],

  advanced: {
    database: { generateId: 'uuid' },
    // Better Auth skips its own origin checks when NODE_ENV is "test". Keep
    // them on, so the tests exercise what production runs.
    disableOriginCheck: false,
  },
})

export type Auth = typeof auth
