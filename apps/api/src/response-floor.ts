import { createMiddleware } from 'hono/factory'

// Sign-up and asking for a password reset must not reveal whether an email
// has an account, and their answers' bodies don't. Their timing would,
// without this: for a new email, sign-up also writes the user and their
// account, and a reset request for a known email writes a reset token. Every
// answer is held back until the floor has passed, as Better Auth does for
// resending a verification email. The floor sits above a normal sign-up
// (password hash plus the breach check's network call), the slower of the
// two, so a known and an unknown email both finish under it on either path.
// Tests lower it.
export const responseFloor = { minimumMs: 1000 }

export const holdToResponseFloor = createMiddleware(async (_c, next) => {
  const start = performance.now()
  try {
    await next()
  } finally {
    // A timer can fire a fraction of a millisecond early, so wait until the
    // floor has really passed.
    let remaining: number
    while ((remaining = responseFloor.minimumMs - (performance.now() - start)) > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(remaining)))
    }
  }
})
