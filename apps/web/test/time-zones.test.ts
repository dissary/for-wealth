import { describe, expect, it } from 'vitest'
import { searchTimeZones, timeZoneChoices } from '../src/lib/time-zones.ts'

const ZONES = ['America/New_York', 'Asia/Kuala_Lumpur', 'Asia/Tokyo', 'Europe/London']

describe('searchTimeZones', () => {
  it('lists every zone when there is nothing to search for', () => {
    expect(searchTimeZones(ZONES, '')).toEqual(ZONES)
    expect(searchTimeZones(ZONES, '   ')).toEqual(ZONES)
  })

  it('finds a zone by any part of its name, ignoring case', () => {
    expect(searchTimeZones(ZONES, 'TOKYO')).toEqual(['Asia/Tokyo'])
    expect(searchTimeZones(ZONES, 'asia/')).toEqual(['Asia/Kuala_Lumpur', 'Asia/Tokyo'])
    expect(searchTimeZones(ZONES, ' lon ')).toEqual(['Europe/London'])
  })

  // The list shows "Kuala Lumpur", so that's what people type.
  it('matches a space with an underscore', () => {
    expect(searchTimeZones(ZONES, 'kuala lumpur')).toEqual(['Asia/Kuala_Lumpur'])
    expect(searchTimeZones(ZONES, 'new_york')).toEqual(['America/New_York'])
  })

  it('finds nothing when no zone matches', () => {
    expect(searchTimeZones(ZONES, 'Mars')).toEqual([])
  })
})

describe('timeZoneChoices', () => {
  it('adds UTC and the given zones the list is missing, in order and once each', () => {
    expect(timeZoneChoices(['Europe/London', 'Asia/Tokyo'], ['Asia/Kolkata', 'Asia/Tokyo'])).toEqual([
      'Asia/Kolkata',
      'Asia/Tokyo',
      'Europe/London',
      'UTC',
    ])
  })
})
