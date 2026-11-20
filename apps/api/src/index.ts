import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { type Context, Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import app from './app.js'
import { pool } from './db/client.js'
import { env } from './env.js'

// In production the API also serves the built web app, so the browser sees
// one address: no CORS, and the login cookie is first-party.
const server = new Hono().route('/', app)

if (env.WEB_DIST_DIR) {
  const root = env.WEB_DIST_DIR
  const setCaching = (path: string, c: Context) => {
    // Vite puts a content hash in every file name under /assets, so a changed
    // file gets a new name and these can be cached for good. The page itself
    // is checked on every load, so a deploy shows up at once.
    if (path.includes('/assets/')) {
      c.header('Cache-Control', 'public, max-age=31536000, immutable')
    } else {
      c.header('Cache-Control', 'no-cache')
    }
  }
  server
    // An /api path the API doesn't have is a 404, not the web app's page.
    .all('/api/*', (c) => c.json({ code: 'NOT_FOUND', message: 'Not found' }, 404))
    .use(secureHeaders())
    .use('*', serveStatic({ root, onFound: setCaching }))
    // Any other path is a page of the web app, which routes in the browser.
    .get('*', serveStatic({ root, path: 'index.html', onFound: setCaching }))
}

const listener = serve({ fetch: server.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})

function shutDown() {
  listener.close(() => {
    pool.end().then(() => process.exit(0))
  })
}
process.on('SIGINT', shutDown)
process.on('SIGTERM', shutDown)
