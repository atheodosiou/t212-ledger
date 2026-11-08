import type { ExportState } from '../db/schema.js';

/** A day after the running year was last fetched, it is fetched again (new activity). */
export const REFRESH_MS = 24 * 60 * 60 * 1000;

/** The instant a calendar year starts in a time zone (e.g. 2025 in Athens = 2024-12-31T22:00Z). */
export function startOfYear(year: number, timeZone: string): Date {
  const utc = Date.UTC(year, 0, 1);
  // The zone's offset at that moment: format the UTC instant as local time and diff.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utc));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return new Date(utc - (local - utc));
}

export function yearOf(date: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric' }).format(
      date,
    ),
  );
}

export interface ExportRequest {
  year: number;
  from: Date;
  to: Date;
}

/**
 * Which years to ask Trading 212 for, oldest first. A year is fetched once it has
 * ended and never again (its history does not change); the running year is fetched
 * up to now, and again a day later at the earliest. A year last fetched while it was
 * still running is fetched once more, in full, after it ends.
 */
export function plannedExports(
  firstActivity: Date | null,
  state: ExportState | null | undefined,
  now: Date,
  timeZone: string,
): ExportRequest[] {
  if (!firstActivity) return [];
  const first = yearOf(firstActivity, timeZone);
  const current = yearOf(now, timeZone);
  const plan: ExportRequest[] = [];
  for (let year = first; year <= current; year++) {
    const from = startOfYear(year, timeZone);
    const end = new Date(startOfYear(year + 1, timeZone).getTime() - 1000);
    const to =
      year < current ? end : new Date(Math.floor(now.getTime() / 1000) * 1000);
    const done = state?.years?.[String(year)];
    if (!done) {
      plan.push({ year, from, to });
      continue;
    }
    const complete = new Date(done.coveredTo) >= end;
    if (complete) continue;
    if (year < current) plan.push({ year, from, to });
    else if (now.getTime() - new Date(done.fetchedAt).getTime() >= REFRESH_MS)
      plan.push({ year, from, to });
  }
  return plan;
}

/**
 * The period every fetched export covers without gaps, from the first year on: what
 * the API history can be checked against. null when the first year is missing.
 */
export function coveredPeriod(
  firstActivity: Date | null,
  state: ExportState | null | undefined,
  timeZone: string,
): { from: Date; to: Date } | null {
  if (!firstActivity || !state?.years) return null;
  const first = yearOf(firstActivity, timeZone);
  let to: Date | null = null;
  for (let year = first; ; year++) {
    const done = state.years[String(year)];
    if (!done) break;
    to = new Date(done.coveredTo);
    const end = new Date(startOfYear(year + 1, timeZone).getTime() - 1000);
    if (to < end) break;
  }
  return to ? { from: startOfYear(first, timeZone), to } : null;
}
