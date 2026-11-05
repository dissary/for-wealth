// Wraps fetch so an API answer of 401 is reported as the session having
// ended (signed out elsewhere, or expired). The API only answers 401 for that
// (require-session). The answer still goes back to the caller unchanged.
export function noticingEndedSession(fetchFn: typeof fetch, onEnded: () => void): typeof fetch {
  return async (input, init) => {
    const res = await fetchFn(input, init)
    if (res.status === 401) onEnded()
    return res
  }
}
