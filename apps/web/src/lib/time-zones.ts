// Every zone this browser knows, plus the ones in `include` (the saved zone
// and the device's), in case the browser spells or lists them differently
// from the API. Browsers leave out UTC, which the API accepts.
export function timeZoneChoices(available: readonly string[], include: readonly string[]) {
  return [...new Set([...available, ...include, 'UTC'])].sort()
}

// The zones whose name contains `query`, ignoring case. Names are shown with
// spaces for underscores ("Asia/Kuala Lumpur"), so either one matches.
export function searchTimeZones(zones: readonly string[], query: string) {
  const wanted = query.trim().toLowerCase().replaceAll(' ', '_')
  return zones.filter((zone) => zone.toLowerCase().includes(wanted))
}

// "Asia/Kuala_Lumpur" as "Asia/Kuala Lumpur".
export function timeZoneLabel(zone: string) {
  return zone.replaceAll('_', ' ')
}
