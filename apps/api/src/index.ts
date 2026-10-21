import { serve } from '@hono/node-server'
import app from './app.js'
import { pool } from './db/client.js'
import { env } from './env.js'

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})

function shutDown() {
  server.close(() => {
    pool.end().then(() => process.exit(0))
  })
}
process.on('SIGINT', shutDown)
process.on('SIGTERM', shutDown)
