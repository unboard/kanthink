// All calendar dates are plain 'YYYY-MM-DD' strings in local time — no timezone
// drift, no Date parsing surprises.

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_MIN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return dateToIso(new Date());
}

export function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function isoToDate(iso: string): Date {
  const { y, m, d } = parseIso(iso);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + n);
  return dateToIso(d);
}

export function isToday(iso: string): boolean {
  return iso === todayIso();
}

export function isPast(iso: string): boolean {
  return iso < todayIso();
}

export function sameMonth(iso: string, year: number, monthIndex: number): boolean {
  const { y, m } = parseIso(iso);
  return y === year && m - 1 === monthIndex;
}

// 6-week (42-day) grid for a month, starting on Sunday.
export function monthGrid(year: number, monthIndex: number): string[] {
  const first = new Date(year, monthIndex, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // back up to Sunday
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(dateToIso(d));
  }
  return days;
}

// The 7 days (Sun–Sat) of the week containing `iso`.
export function weekDays(iso: string): string[] {
  const d = isoToDate(iso);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(start);
    dd.setDate(start.getDate() + i);
    days.push(dateToIso(dd));
  }
  return days;
}

export function formatFullDate(iso: string): string {
  const { d } = parseIso(iso);
  const date = isoToDate(iso);
  return `${WEEKDAYS_SHORT[date.getDay()]}, ${MONTHS[parseIso(iso).m - 1]} ${d}, ${parseIso(iso).y}`;
}

export function formatShortDate(iso: string): string {
  const { m, d } = parseIso(iso);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

// ISO week label like "Week of Jul 20"
export function weekLabel(iso: string): string {
  const days = weekDays(iso);
  return `Week of ${formatShortDate(days[0])}`;
}

// Group ideas' dates into ISO-week buckets keyed by the Sunday of that week.
export function weekKey(iso: string): string {
  return weekDays(iso)[0];
}
