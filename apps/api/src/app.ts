import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import { auth } from './auth.js'
import { env } from './env.js'
import { categories } from './routes/categories.js'
import { health } from './routes/health.js'
import { me } from './routes/me.js'
import { holdToResponseFloor } from './response-floor.js'

// Built apart from the server in index.ts, so tests can call app.request()
// without starting one. Chain .route() calls so the RPC client sees the types.
const app = new Hono()
  .basePath('/api')
  .use(secureHeaders())
  // Nothing the app sends comes near 16 KB. A larger body is refused from its
  // declared length before any of it is read, or, without one, as soon as
  // the bytes read pass the limit (v1-spec "Data and security").
  .use(
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json({ code: 'PAYLOAD_TOO_LARGE', message: 'Request too large' }, 413),
    }),
  )
  // Rejects form posts from any other site, Better Auth's routes included.
  // Other cross-site posts (JSON) need the API's CORS permission, which it
  // never gives; Better Auth's own origin check and SameSite=Lax cookies sit
  // behind both.
  .use(csrf({ origin: new URL(env.BETTER_AUTH_URL).origin }))
  .use('/auth/sign-up/email', holdToResponseFloor)
  .use('/auth/request-password-reset', holdToResponseFloor)
  // Better Auth's routes live under /api/auth (its default basePath).
  .on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))
  .route('/health', health)
  .route('/me', me)
  .route('/categories', categories)

export type AppType = typeof app
export default app
