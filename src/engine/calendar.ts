/**
 * Calendar helpers. The real 2026/27 dates are the pattern for every season: a later season
 * uses the same week of the year, moved to the same day of the week.
 */

const BASE_SEASON = 2026;
const DAY = 86_400_000;

/** Days since 1 August of the season's first year. */
export function dayOfDate(season: number, date: Date): number {
  return Math.round((date.getTime() - Date.UTC(season, 7, 1)) / DAY);
}

/** Day of the week of a season day (0 = Sunday … 6 = Saturday). */
export function weekday(season: number, day: number): number {
  return new Date(Date.UTC(season, 7, 1 + day)).getUTCDay();
}

/** A 2026/27 date ('YYYY-MM-DD') as a day of `season`, on the same day of the week. */
export function seasonDay(iso: string, season: number): number {
  const [y, m, d] = iso.split('-').map(Number);
  const base = dayOfDate(BASE_SEASON, new Date(Date.UTC(y, m - 1, d)));
  if (season === BASE_SEASON) return base;
  const want = weekday(BASE_SEASON, base);
  const got = weekday(season, base);
  let shift = (want - got + 7) % 7;
  if (shift > 3) shift -= 7;
  return Math.max(1, base + shift);
}

export const isSaturday = (season: number, day: number) => weekday(season, day) === 6;
export const isMidweek = (season: number, day: number) => [1, 2, 3, 4].includes(weekday(season, day));

/**
 * The summer, in season days (days since 1 August). A game begins on 15 June: the
 * transfer window is already open, the squad is on holiday, and pre-season starts when
 * the players report back on 1 July.
 */
export const START_DAY = -47; // 15 June
export const REPORT_DAY = -31; // 1 July: players report back
export const CAMP_FROM = -20; // 12 July
export const CAMP_TO = -8; // 24 July
