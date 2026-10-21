import { createMiddleware } from 'hono/factory'

// Sign-up must not reveal whether an email already has an account, and the
// answer's body doesn't. Its timing would, without this: a new email also
// writes the user and their account. Every answer is held back until the
// floor has passed, as Better Auth does for resending a verification email.
// The floor sits above a normal sign-up (password hash plus the breach check's
// network call) so both cases finish under it. Tests lower it.
export const signUpTiming = { minimumMs: 1000 }

export const signUpResponseFloor = createMiddleware(async (_c, next) => {
  const start = performance.now()
  try {
    await next()
  } finally {
    // A timer can fire a fraction of a millisecond early, so wait until the
    // floor has really passed.
    let remaining: number
    while ((remaining = signUpTiming.minimumMs - (performance.now() - start)) > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(remaining)))
    }
  }
})
