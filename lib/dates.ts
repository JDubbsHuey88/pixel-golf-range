// All dates are local time America/Denver, stored as ISO YYYY-MM-DD.
export const TZ = 'America/Denver';
export const PROGRAM_START = '2026-07-13'; // Monday, week 1

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in America/Denver as YYYY-MM-DD. */
export function localToday(): string {
  return fmt.format(new Date());
}

/** Current time HH:MM in America/Denver. */
export function localTime(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

/** Treat a YYYY-MM-DD string as a UTC-noon Date for safe day arithmetic. */
function toDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

/** Program week (1-36) containing the given date, clamped to the program bounds. */
export function weekForDate(iso: string): number {
  const w = Math.floor(daysBetween(PROGRAM_START, iso) / 7) + 1;
  return Math.min(36, Math.max(1, w));
}

/** Monday of program week n. */
export function weekStart(n: number): string {
  return addDays(PROGRAM_START, (n - 1) * 7);
}

/** 1=Mon ... 7=Sun for a YYYY-MM-DD date. */
export function isoDayOfWeek(iso: string): number {
  const d = toDate(iso).getUTCDay(); // 0=Sun
  return d === 0 ? 7 : d;
}
