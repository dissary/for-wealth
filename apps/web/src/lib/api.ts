import type { AppType } from '@for-wealth/api'
import { hc } from 'hono/client'

// Typed client for the API. Same origin: Vite proxies /api in dev, and the
// API serves this app in production. Only types come from the API package.
export const api = hc<AppType>(window.location.origin).api
