import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import { auth } from './auth.js'
import { env } from './env.js'
import { health } from './routes/health.js'
import { me } from './routes/me.js'
import { signUpResponseFloor } from './sign-up-timing.js'

// Built apart from the server in index.ts, so tests can call app.request()
// without starting one. Chain .route() calls so the RPC client sees the types.
const app = new Hono()
  .basePath('/api')
  .use(secureHeaders())
  // Rejects form posts from any other site, Better Auth's routes included.
  // Other cross-site posts (JSON) need the API's CORS permission, which it
  // never gives; Better Auth's own origin check and SameSite=Lax cookies sit
  // behind both.
  .use(csrf({ origin: new URL(env.BETTER_AUTH_URL).origin }))
  .use('/auth/sign-up/email', signUpResponseFloor)
  // Better Auth's routes live under /api/auth (its default basePath).
  .on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))
  .route('/health', health)
  .route('/me', me)

export type AppType = typeof app
export default app
