import { createHash } from 'node:crypto'
import { vi } from 'vitest'

// Runs before every test file (vitest.config.ts → setupFiles). The suite
// never reaches the internet: the one outside service the API calls, Have I
// Been Pwned's password range API, is answered here, and any other request
// fails the test.

// The stub treats this password, and only this one, as found in a breach.
export const BREACHED_PASSWORD = 'password1234'

const RANGE_API = 'https://api.pwnedpasswords.com/range/'

function sha1(text: string) {
  return createHash('sha1').update(text).digest('hex').toUpperCase()
}

// Answers like the real API: every hash suffix under the 5-character prefix,
// with a count, plus zero-count padding lines (the API's Add-Padding option).
function rangeResponse(prefix: string) {
  const breached = sha1(BREACHED_PASSWORD)
  const lines = ['0018A45C4D1DEF81644B54AB7F969B88D65:0']
  if (breached.startsWith(prefix)) lines.push(`${breached.slice(5)}:52579`)
  return new Response(lines.join('\r\n'), {
    headers: { 'content-type': 'text/plain' },
  })
}

vi.stubGlobal(
  'fetch',
  vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith(RANGE_API)) return rangeResponse(url.slice(RANGE_API.length))
    throw new Error(`Tests must not reach the network: ${url}`)
  }),
)
