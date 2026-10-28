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
import { writeStarterCategories } from './categories.js'
import { db } from './db/client.js'
import * as schema from './db/schema/auth.js'
import { sendInBackground } from './email.js'
import { env } from './env.js'
import { passwordHashing } from './password-hashing.js'
import { resetTokenStorage, spendResetTokens } from './reset-tokens.js'
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

  // Better Auth's defaults: a session lasts 7 days and is extended once it's
  // a day old and still in use. The cookie cache would save a database lookup
  // per request, but a signed-out or revoked session would keep working until
  // the cache expired, so it stays off (as it is by default) and every request
  // checks the database.
  session: {
    cookieCache: { enabled: false },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    // Looked up on each call, so tests can swap the hash.
    password: {
      hash: (password) => passwordHashing.hash(password),
      verify: (data) => passwordHashing.verify(data),
    },
    // Also makes sign-up answer the same way whether or not the email
    // already has an account.
    requireEmailVerification: true,
    // Better Auth answers the same whether or not the email has an account.
    // Not awaited, so the response time doesn't show it either.
    sendResetPassword: async ({ user, url }) => {
      sendInBackground({
        to: user.email,
        subject: 'Reset your For Wealth password',
        text: `Open this link to choose a new password. It works once, within an hour:\n${url}\n\nIf you didn't ask for this, ignore this email. Your password stays the same.`,
      })
    },
    resetPasswordTokenExpiresIn: 60 * 60,
    // Whoever had the old password is signed out too. Better Auth spends the
    // token, deletes the sessions and saves the new password in one
    // transaction (the adapter's `transaction: true`), so a failure in any
    // step leaves all three as they were.
    revokeSessionsOnPasswordReset: true,
    // Runs once the reset has been saved, outside its transaction. If it
    // fails the new password still stands, so the user is told it worked and
    // the failure is only logged.
    onPasswordReset: async ({ user }) => {
      await spendResetTokens(user.id).catch((error: unknown) => {
        console.error('Other reset links could not be spent after a reset', error)
      })
    },
  },

  verification: {
    storeIdentifier: { default: 'plain', overrides: resetTokenStorage },
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

  databaseHooks: {
    user: {
      create: {
        // Runs once the sign-up transaction has committed, still inside the
        // request and so under its response floor. A failure must not change
        // the answer, or a new email would get an error that a known one
        // doesn't. It is logged, and loading the Categories writes the
        // starter sets later.
        after: async (user) => {
          await writeStarterCategories(user.id).catch((error: unknown) => {
            console.error('Starter Categories could not be written at sign-up', error)
          })
        },
      },
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
