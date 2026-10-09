import { weekday } from './calendar.js';
import { windows } from './intl.js';
import { assignKickoffs, roundCount } from './fixtures.js';
import { leagueTable } from './league.js';
import type { Rng } from './rng.js';
import type { Fixture, GameState } from './types.js';

/** How far ahead the broadcasters confirm kick-off times (about five weeks). */
export const CONFIRM_AHEAD = 35;

/**
 * Confirm kick-off times for every league weekend up to `uptoDay` that is still to be
 * confirmed. The most attractive fixtures (big clubs, and clubs near the top once the
 * season is under way) get the best TV slots. `onMoved` hears about every fixture moved
 * away from its traditional kick-off.
 */
export function confirmKickoffs(state: GameState, rng: Rng, uptoDay: number, onMoved?: (f: Fixture) => void): void {
  const leagues = new Set(state.comps.map((c) => c.id));
  const pending = state.fixtures.filter((f) => f.tbc && !f.result && f.weekend <= uptoDay && leagues.has(f.comp));
  if (!pending.length) return;
  const byClub = new Map<number, Fixture[]>();
  for (const f of state.fixtures) {
    for (const id of [f.homeId, f.awayId]) {
      if (!byClub.has(id)) byClub.set(id, []);
      byClub.get(id)!.push(f);
    }
  }
  const wins = windows(state.season).slice(0, 3);
  const clash = (f: Fixture, day: number) => {
    if (day <= state.day) return true;
    // No league football in an international window.
    if (wins.some((w) => day >= w.from && day <= w.to)) return true;
    for (const id of [f.homeId, f.awayId]) {
      for (const o of byClub.get(id) ?? []) if (o !== f && Math.abs(o.day - day) < 3) return true;
    }
    return false;
  };
  const groups = new Map<string, Fixture[]>();
  for (const f of pending) {
    const k = `${f.comp}:${f.weekend}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(f);
  }
  const keys = [...groups.keys()].sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1]));
  const tables = new Map<string, Map<number, number>>();
  const posIn = (comp: string, clubId: number) => {
    if (!tables.has(comp)) {
      const played = state.fixtures.some((f) => f.comp === comp && f.result);
      tables.set(comp, new Map(played ? leagueTable(state, comp).map((r, i) => [r.clubId, i + 1] as [number, number]) : []));
    }
    return tables.get(comp)!.get(clubId);
  };
  const clubs = new Map(state.clubs.map((c) => [c.id, c]));
  const last = new Map<string, number>();
  const lastRound = (comp: string) => {
    if (!last.has(comp)) last.set(comp, roundCount(state.fixtures, comp) - 1);
    return last.get(comp)!;
  };
  for (const k of keys) {
    const list = groups.get(k)!;
    const appeal = new Map<Fixture, number>();
    for (const f of list) {
      let a = clubs.get(f.homeId)!.reputation + clubs.get(f.awayId)!.reputation + rng.next() * 2.5;
      for (const id of [f.homeId, f.awayId]) {
        const pos = posIn(f.comp, id);
        if (pos && pos <= 6) a += (7 - pos) * 0.5;
      }
      appeal.set(f, a);
    }
    const ranked = [...list].sort((x, y) => appeal.get(y)! - appeal.get(x)!);
    const f0 = list[0];
    const wd = weekday(state.season, f0.weekend);
    const kind = f0.round === lastRound(f0.comp) ? 'final' : wd >= 1 && wd <= 4 ? 'midweek' : 'weekend';
    const moved = assignKickoffs(ranked, rng, clash, kind);
    if (onMoved) for (const f of moved) onMoved(f);
  }
}
