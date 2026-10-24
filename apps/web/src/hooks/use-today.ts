import { todayIn } from '@for-wealth/shared'
import { useEffect, useState } from 'react'

// Today in the user's time zone, checked every minute, so a page left open
// past midnight moves on to the new day.
export function useToday(timeZone: string) {
  const [today, setToday] = useState(() => todayIn(timeZone))
  useEffect(() => {
    const timer = setInterval(() => setToday(todayIn(timeZone)), 60_000)
    return () => clearInterval(timer)
  }, [timeZone])
  return today
}
