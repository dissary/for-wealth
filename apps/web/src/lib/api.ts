import type { AppType } from '@for-wealth/api'
import { hc } from 'hono/client'
import { noticingEndedSession } from '@/lib/session'

let sessionEnded = () => {}

// What to do when a call finds the session has ended. main.tsx loads the page
// again, and the signed-in layout then sends the user to sign in.
export function whenSessionEnds(handler: () => void) {
  sessionEnded = handler
}

// Typed client for the API. Same origin: Vite proxies /api in dev, and the
// API serves this app in production. Only types come from the API package.
export const api = hc<AppType>(window.location.origin, {
  fetch: noticingEndedSession(
    (input, init) => fetch(input, init),
    () => sessionEnded(),
  ),
}).api

// Asking who is signed in is the one call where 401 is an answer ("no one"),
// not a session that has ended, so it goes around the check above.
export const meApi = hc<AppType>(window.location.origin).api.me
