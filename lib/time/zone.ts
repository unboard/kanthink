/**
 * Wall-clock time in a named timezone, without a date library.
 *
 * Schedules are written as "06:00" by a person in their own timezone, but the
 * server runs in UTC. Computing them with the server's clock is how a 6 AM shroom
 * ended up at 1 AM, or, computed in a browser, at a time the once-a-day cron had
 * already passed. These turn "06:00 in America/Chicago" into the right instant.
 */

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export type ZoneParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

/** The calendar date and clock time at `date`, as seen in `tz`. weekday: 0 = Sunday. */
export function zoneParts(date: Date, tz: string): ZoneParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: weekdays.indexOf(get('weekday')),
  }
}

/** Minutes `tz` is ahead of UTC at `date`. */
function offsetMinutes(date: Date, tz: string): number {
  const p = zoneParts(date, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000)
}

/** The instant when the clock in `tz` reads year-month-day hour:minute. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  // Twice, because the offset at the guess can differ from the offset at the answer around DST.
  let t = guess - offsetMinutes(new Date(guess), tz) * 60000
  t = guess - offsetMinutes(new Date(t), tz) * 60000
  return new Date(t)
}

/** The next time the clock in `tz` reads hh:mm, strictly after `after`; on `weekday` if given. */
export function nextWallClock(hhmm: string, tz: string, after: Date, weekday?: number): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const today = zoneParts(after, tz)
  for (let add = 0; add < 8; add++) {
    // Calendar arithmetic on the local date: Date.UTC handles month and year roll-over.
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + add))
    if (weekday !== undefined && d.getUTCDay() !== weekday) continue
    const at = zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h || 0, m || 0, tz)
    if (at > after) return at
  }
  return new Date(after.getTime() + 24 * 3600 * 1000)
}

/** The local calendar day of `date` in `tz`, as YYYY-MM-DD. */
export function zoneDay(date: Date, tz: string): string {
  const p = zoneParts(date, tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
