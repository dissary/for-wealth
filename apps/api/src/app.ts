import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { health } from './routes/health.js'

// Built apart from the server in index.ts, so tests can call app.request()
// without starting one. Chain .route() calls so the RPC client sees the types.
const app = new Hono()
  .basePath('/api')
  .use(secureHeaders())
  .route('/health', health)

export type AppType = typeof app
export default app
