import { z } from 'zod'
import { emailSchema } from './sign-up.js'

// No length rules here: a password set under older rules must still work,
// and a wrong one gets the same answer from the API whatever its length.
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
})

export type SignInInput = z.infer<typeof signInSchema>
