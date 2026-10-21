import { createMiddleware } from 'hono/factory'
import { auth } from './auth.js'

type AuthSession = typeof auth.$Infer.Session

// What a route behind requireSession can read from the context. `user.id` is
// the user ID every query on user data takes.
export interface SignedInEnv {
  Variables: { user: AuthSession['user']; session: AuthSession['session'] }
}

// Answers 401 unless the request carries a valid session, so handlers always
// get a signed-in user. The session is looked up in the database on every
// request (no cookie cache), so a signed-out or revoked one stops working at
// once.
export const requireSession = createMiddleware<SignedInEnv>(async (c, next) => {
  const { headers, response } = await auth.api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  })
  // Better Auth sets a cookie when it extends the session, or clears it when
  // the session has ended. Passed on so the browser's copy keeps up.
  for (const cookie of headers.getSetCookie()) c.header('set-cookie', cookie, { append: true })
  // The user's own details: never kept by a browser or proxy cache.
  c.header('cache-control', 'no-store')

  if (!response) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Sign in to continue' }, 401)
  }
  c.set('user', response.user)
  c.set('session', response.session)
  await next()
})
