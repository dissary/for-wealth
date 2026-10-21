import { createHash } from 'node:crypto'
import { and, eq, like } from 'drizzle-orm'
import { db } from './db/client.js'
import { verifications } from './db/schema/index.js'

// How Better Auth starts the identifier of a password reset token's row in
// `verifications`. The row's `value` is the user's ID.
const PREFIX = 'reset-password:'

// Better Auth stores reset tokens as they appear in the link, so anyone who
// could read the table could use a live one. This keeps a SHA-256 of the
// token instead (the token is random, so a fast hash is enough), with the
// prefix kept in front so the user's reset tokens can still be found.
// Better Auth hashes the token in the link the same way to look it up.
export const resetTokenStorage = {
  [PREFIX]: {
    hash: async (identifier: string) =>
      PREFIX + createHash('sha256').update(identifier).digest('base64url'),
  },
}

// Better Auth spends only the token that was used. Any other reset link the
// user asked for would still work for the rest of its hour, so those go too.
export async function spendResetTokens(userId: string) {
  await db
    .delete(verifications)
    .where(and(like(verifications.identifier, `${PREFIX}%`), eq(verifications.value, userId)))
}
