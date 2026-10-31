import { todayIn } from '@for-wealth/shared'
import { useCallback, useSyncExternalStore } from 'react'

function everyMinute(onChange: () => void) {
  const timer = setInterval(onChange, 60_000)
  return () => clearInterval(timer)
}

// Today in the user's time zone, checked every minute, so a page left open
// past midnight moves on to the new day. A new zone, saved in Settings, takes
// effect on the next render.
export function useToday(timeZone: string) {
  return useSyncExternalStore(
    everyMinute,
    useCallback(() => todayIn(timeZone), [timeZone]),
  )
}
