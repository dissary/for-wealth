import type { Context } from 'hono'
import { z } from 'zod'
import type { SignedInEnv } from './require-session.js'

// Parses with the schema for this user, or answers 400 saying which fields
// are wrong and why.
export function parseFor<T extends z.ZodType>(schemaFor: (timeZone: string) => T) {
  return (value: unknown, c: Context<SignedInEnv>) => {
    const parsed = schemaFor(c.get('user').timeZone).safeParse(value)
    if (parsed.success) return parsed.data as z.output<T>
    return c.json(
      {
        code: 'INVALID_INPUT' as const,
        message: 'Check the highlighted fields',
        fields: z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>,
      },
      400,
    )
  }
}
