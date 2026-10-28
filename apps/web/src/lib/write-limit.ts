export const TOO_MANY_WRITES = 'That’s a lot of changes in one minute. Wait a moment, then try again.'

// From the write limit, a middleware, so the RPC types don't list it.
export function isTooManyWrites(res: Response) {
  return res.status === 429
}
