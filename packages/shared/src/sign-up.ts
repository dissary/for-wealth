import { z } from 'zod'
import { currencyCodeSchema } from './currency.js'
import { timeZoneSchema } from './time-zone.js'

// Length is the only password rule (v1-spec "Data and security"). The API
// gives Better Auth the same limits.
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128
export const NAME_MAX_LENGTH = 100

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your name')
  .max(NAME_MAX_LENGTH, `Use ${NAME_MAX_LENGTH} characters or fewer`)

export const emailSchema = z.email('Enter a valid email address')

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use ${PASSWORD_MAX_LENGTH} characters or fewer`)

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  currency: currencyCodeSchema,
  timeZone: timeZoneSchema,
})

// What the form holds, and what it sends once parsed (name trimmed, time
// zone in its canonical spelling).
export type SignUpInput = z.input<typeof signUpSchema>
export type SignUpOutput = z.output<typeof signUpSchema>
