import { seasonDay, weekday } from './calendar.js';
import { LEAGUE_DATES } from './db/cups-2026.js';
import { Rng } from './rng.js';
import type { Fixture } from './types.js';

/**
 * Double round-robin using the canonical 1-factorisation (de Werra), which keeps home and
 * away alternating: in the first half nearly every club goes H-A-H-A, with at most one
 * "break" (two home or two away games in a row). The second half repeats the first with
 * venues swapped, starting from its second round: that avoids three in a row at the turn
 * and never pairs the same clubs on consecutive matchdays. Nobody plays more than two home
 * or two away games running. Clubs are shuffled first so patterns change every season.
 * Returns rounds of [home, away] pairs.
 */
export function roundRobin(clubIds: number[], rng: Rng): [number, number][][] {
  const teams = rng.shuffle([...clubIds]);
  if (teams.length % 2 === 1) teams.push(-1); // bye
  const n = teams.length;
  const m = n - 1;
  const fixed = teams[m];
  const half: [number, number][][] = [];
  for (let r = 0; r < m; r++) {
    const round: [number, number][] = [];
    const t = teams[r];
    round.push(r % 2 === 0 ? [t, fixed] : [fixed, t]);
    for (let k = 1; k < n / 2; k++) {
      const a = teams[(r + k) % m];
      const b = teams[(r - k + m) % m];
      round.push(k % 2 === 1 ? [a, b] : [b, a]);
    }
    half.push(round.filter(([h, a]) => h !== -1 && a !== -1));
  }
  const order = half.map((_, i) => (i + 1) % m);
  return [...half, ...order.map((i) => half[i].map(([h, a]) => [a, h] as [number, number]))];
}

/** Days (since 1 August) of the 38 league Saturdays, starting the third weekend of August. */
export function leagueSaturdays(seasonYear: number, count = 38): number[] {
  const start = new Date(Date.UTC(seasonYear, 7, 1));
  const d = new Date(Date.UTC(seasonYear, 7, 16));
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  const first = Math.round((d.getTime() - start.getTime()) / 86400000);
  return Array.from({ length: count }, (_, i) => first + i * 7);
}

/** The real matchday dates of a league (weekends and midweek rounds), for any season. */
export function leagueDates(comp: string, seasonYear: number, rounds: number): number[] {
  const list = LEAGUE_DATES[comp];
  if (!list || list.length < rounds) return leagueSaturdays(seasonYear, rounds);
  return list.slice(0, rounds).map((iso) => seasonDay(iso, seasonYear));
}

/**
 * League fixtures for one competition, on the league's real calendar. A weekend round belongs
 * to its Saturday (a round dated on a Sunday too); a midweek round to its Wednesday.
 */
export function makeFixtures(clubIds: number[], rng: Rng, comp: string, seasonYear: number, firstId: number): Fixture[] {
  const rounds = roundRobin(clubIds, rng);
  const days = leagueDates(comp, seasonYear, rounds.length);
  const fixtures: Fixture[] = [];
  let id = firstId;
  rounds.forEach((rd, r) => {
    const date = days[r];
    const wd = weekday(seasonYear, date);
    const midweek = wd >= 1 && wd <= 4;
    const weekend = wd === 0 ? date - 1 : wd === 5 ? date + 1 : date;
    const plan = midweek ? MIDWEEK[comp] ?? MIDWEEK.ENG : KICKOFFS[comp] ?? KICKOFFS.ENG;
    for (const [homeId, awayId] of rd) {
      fixtures.push({ id: id++, comp, round: r, weekend, day: weekend + plan.base[0], time: plan.base[1], tbc: true, homeId, awayId, result: null });
    }
  });
  return fixtures;
}

/* ───────────────────────── Kick-off times ─────────────────────────
 * Each league has a traditional kick-off (Saturday 3pm in England) and a set of TV slots
 * across Friday night to Monday night. About five weeks ahead, the broadcasters pick the
 * most attractive matches for the best slots; the rest stay at the traditional time.
 * Slots are listed best first; the third number is how often that slot is used.
 * Offsets are days from the Saturday (-1 Friday, 1 Sunday, 2 Monday).
 */
export interface KickoffPlan {
  base: [number, string];
  tv: [number, string, number][];
}

export const KICKOFFS: Record<string, KickoffPlan> = {
  ENG: { base: [0, '15:00'], tv: [[1, '16:30', 1], [0, '17:30', 1], [1, '14:00', 1], [0, '12:30', 1], [2, '20:00', 0.6], [-1, '20:00', 0.5], [1, '14:00', 0.6], [0, '20:00', 0.2]] },
  ESP: { base: [0, '16:15'], tv: [[0, '21:00', 1], [1, '21:00', 1], [0, '18:30', 1], [1, '18:30', 1], [1, '16:15', 1], [0, '14:00', 1], [1, '14:00', 1], [-1, '21:00', 0.8], [2, '21:00', 0.7]] },
  GER: { base: [0, '15:30'], tv: [[0, '18:30', 1], [1, '17:30', 1], [-1, '20:30', 1], [1, '15:30', 1], [1, '19:30', 0.4]] },
  ITA: { base: [1, '15:00'], tv: [[1, '20:45', 1], [0, '20:45', 1], [0, '18:00', 1], [1, '18:00', 1], [2, '20:45', 0.8], [1, '12:30', 1], [0, '15:00', 1], [-1, '20:45', 0.6], [2, '18:30', 0.5]] },
  FRA: { base: [1, '15:00'], tv: [[1, '20:45', 1], [0, '21:05', 1], [-1, '20:45', 1], [0, '17:00', 1], [1, '17:15', 1], [0, '19:00', 1]] },
  POR: { base: [1, '18:00'], tv: [[1, '20:30', 1], [0, '20:30', 1], [2, '20:15', 0.7], [-1, '20:15', 0.7], [0, '18:00', 1], [1, '15:30', 1], [0, '15:30', 1]] },
  // The EFL: Saturday 3pm, with Sky's Friday night, lunchtime and Sunday games.
  ES2: { base: [0, '18:00'], tv: [[0, '21:00', 0.8], [1, '20:00', 0.8], [1, '16:15', 0.8], [0, '16:15', 0.6], [-1, '21:00', 0.6]] },
  DE2: { base: [0, '13:00'], tv: [[0, '20:30', 1], [-1, '18:30', 1], [1, '13:30', 1], [1, '13:00', 0.8]] },
  IT2: { base: [0, '15:00'], tv: [[0, '20:30', 1], [1, '15:00', 1], [1, '17:15', 0.8], [-1, '20:30', 0.8]] },
  FR2: { base: [0, '19:00'], tv: [[-1, '20:00', 1], [0, '19:00', 0.8], [1, '15:00', 0.8]] },
  PT2: { base: [0, '18:00'], tv: [[-1, '20:15', 1], [0, '20:30', 0.8], [1, '18:00', 0.8]] },
  EN2: { base: [0, '15:00'], tv: [[-1, '19:45', 1], [0, '12:30', 1], [1, '12:30', 1], [0, '17:30', 0.8], [-1, '19:45', 0.6], [1, '15:00', 0.6]] },
  EN3: { base: [0, '15:00'], tv: [[-1, '19:45', 0.9], [0, '12:30', 0.9], [1, '12:30', 0.6]] },
  EN4: { base: [0, '15:00'], tv: [[-1, '19:45', 0.6], [0, '12:30', 0.6], [1, '12:30', 0.4]] },
};

/** Midweek rounds: split between Tuesday and Wednesday evenings (offsets from the Wednesday). */
export const MIDWEEK: Record<string, KickoffPlan> = {
  ENG: { base: [0, '20:00'], tv: [[0, '20:00', 1], [-1, '20:00', 1], [0, '19:30', 1], [-1, '19:30', 1], [0, '19:30', 1], [-1, '19:30', 1], [-1, '19:45', 1], [0, '19:45', 1]] },
  ESP: { base: [0, '19:00'], tv: [[0, '21:30', 1], [-1, '21:30', 1], [1, '21:30', 1], [0, '19:00', 1], [-1, '19:00', 1], [1, '19:00', 1], [-1, '20:00', 1], [0, '20:00', 1]] },
  GER: { base: [0, '20:30'], tv: [[0, '20:30', 1], [-1, '20:30', 1], [0, '18:30', 1], [-1, '18:30', 1], [0, '18:30', 1], [-1, '18:30', 1]] },
  ITA: { base: [0, '20:45'], tv: [[0, '20:45', 1], [-1, '20:45', 1], [0, '18:30', 1], [-1, '18:30', 1], [1, '20:45', 0.6], [0, '18:30', 1], [-1, '18:30', 1]] },
  FRA: { base: [0, '21:00'], tv: [[0, '21:00', 1], [-1, '21:00', 1], [0, '19:00', 1], [-1, '19:00', 1]] },
  POR: { base: [0, '20:15'], tv: [[0, '20:15', 1], [-1, '20:15', 1], [0, '18:00', 1], [-1, '18:00', 1], [1, '20:15', 0.7]] },
  ES2: { base: [0, '20:30'], tv: [[0, '21:00', 1], [-1, '21:00', 1]] },
  DE2: { base: [0, '18:30'], tv: [[0, '18:30', 1], [-1, '18:30', 1]] },
  IT2: { base: [0, '20:30'], tv: [[0, '20:30', 1], [-1, '20:30', 1]] },
  FR2: { base: [0, '20:00'], tv: [[0, '20:00', 1], [-1, '20:00', 1]] },
  PT2: { base: [0, '20:15'], tv: [[0, '20:15', 1], [-1, '20:15', 1]] },
  EN2: { base: [0, '19:45'], tv: [[0, '20:00', 1], [-1, '19:45', 1], [0, '19:45', 1], [-1, '20:00', 1]] },
  EN3: { base: [0, '19:45'], tv: [[0, '19:45', 1], [-1, '19:45', 1]] },
  EN4: { base: [0, '19:45'], tv: [[0, '19:45', 1], [-1, '19:45', 1]] },
};

/** The last round of a season kicks off all at once. */
export const FINAL_DAY: Record<string, [number, string]> = {
  ENG: [1, '16:00'], ESP: [1, '18:30'], GER: [0, '15:30'], ITA: [1, '20:45'], FRA: [0, '21:00'], POR: [1, '18:00'],
  EN2: [0, '12:30'], EN3: [0, '12:30'], EN4: [0, '12:30'],
  ES2: [0, '18:30'], DE2: [0, '15:30'], IT2: [0, '15:00'], FR2: [0, '19:00'], PT2: [0, '18:00'],
};

/**
 * Confirm the kick-offs for one league round. `ranked` is the round's fixtures, most attractive
 * first; `clash(f, day)` says whether moving f to that day would leave a club with under three
 * days' rest. Clubs with a cup tie close by are moved off the traditional slot when it would
 * clash. Returns the fixtures whose date or time changed.
 */
export function assignKickoffs(ranked: Fixture[], rng: Rng, clash: (f: Fixture, day: number) => boolean, kind: 'weekend' | 'midweek' | 'final' = 'weekend'): Fixture[] {
  if (!ranked.length) return [];
  const comp = ranked[0].comp;
  const plan = kind === 'midweek' ? MIDWEEK[comp] ?? MIDWEEK.ENG : KICKOFFS[comp] ?? KICKOFFS.ENG;
  const left = [...ranked];
  const moved: Fixture[] = [];
  const place = (f: Fixture, offset: number, time: string) => {
    const day = f.weekend + offset;
    if (day !== f.day || time !== f.time) moved.push(f);
    f.day = day;
    f.time = time;
    f.tbc = false;
    left.splice(left.indexOf(f), 1);
  };
  if (kind === 'final') {
    const [off, time] = FINAL_DAY[comp] ?? FINAL_DAY.ENG;
    for (const f of [...left]) place(f, off, time);
    return moved;
  }
  for (const [offset, time, chance] of plan.tv) {
    if (!left.length) break;
    if (!rng.chance(chance)) continue;
    const f = left.find((x) => !clash(x, x.weekend + offset));
    if (f) place(f, offset, time);
  }
  for (const f of [...left]) {
    if (!clash(f, f.weekend + plan.base[0])) {
      place(f, plan.base[0], plan.base[1]);
      continue;
    }
    // A cup tie nearby: the latest slot that gives both clubs their rest, else the usual one.
    const slots = [...plan.tv].sort((a, b) => b[0] - a[0]);
    const ok = slots.find(([off]) => !clash(f, f.weekend + off));
    if (ok) place(f, ok[0], ok[1]);
    else place(f, plan.base[0], plan.base[1]);
  }
  return moved;
}

/** Order for listing fixtures: by day, then kick-off time. */
export function byKickoff(a: Fixture, b: Fixture): number {
  return a.day - b.day || a.time.localeCompare(b.time) || a.id - b.id;
}

export function roundCount(fixtures: Fixture[], comp?: string): number {
  let max = -1;
  for (const f of fixtures) if ((!comp || f.comp === comp) && f.round > max) max = f.round;
  return max + 1;
}
