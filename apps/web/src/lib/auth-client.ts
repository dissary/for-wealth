import type { Auth } from '@for-wealth/api/auth'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// No baseURL: the API is on this origin (Vite proxies /api in dev). Only the
// server's type comes from the API package, for the currency and time zone
// fields on the user.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
})

// Every error code the API's auth routes can answer with, its own rules and
// plugins included.
export type AuthErrorCode = keyof Auth['$ERROR_CODES']
