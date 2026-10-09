import { club } from './game.js';
import type { Fixture, GameState, Player } from './types.js';

/**
 * Bans and yellow-card totals are kept per competition, as in the real game: a red card in the
 * FA Cup costs you FA Cup matches, not league ones. The three UEFA competitions share one record.
 * `Player.suspended` is a cache of the ban in the club's next competition, refreshed by
 * `refreshBans`, so screens and squad selection can keep asking one simple question.
 */
export function banKey(comp: string): string {
  return comp === 'UCL' || comp === 'UEL' || comp === 'UECL' ? 'UEFA' : comp;
}

export function compLabel(state: GameState, key: string): string {
  if (key === 'UEFA') return 'Europe';
  if (key === 'FRI') return 'Friendly';
  return state.comps.find((c) => c.id === key)?.name ?? state.cups.find((c) => c.id === key)?.name ?? key;
}

/** Yellows in a league that bring a one-match ban (every this many), and in a cup or Europe. */
export function yellowLimit(state: GameState, key: string): number {
  return state.comps.some((c) => c.id === key) ? 5 : 3;
}

export function banIn(p: Player, comp: string): number {
  return p.bans?.[banKey(comp)] ?? 0;
}

/** Add a booking; returns true if it brings a ban. */
export function addYellow(state: GameState, p: Player, comp: string): boolean {
  const key = banKey(comp);
  const ycs = (p.ycs ??= {});
  ycs[key] = (ycs[key] ?? 0) + 1;
  if (ycs[key] % yellowLimit(state, key) === 0) {
    (p.bans ??= {})[key] = (p.bans[key] ?? 0) + 1;
    return true;
  }
  return false;
}

export function addBan(p: Player, comp: string, matches: number): void {
  const key = banKey(comp);
  (p.bans ??= {})[key] = (p.bans[key] ?? 0) + matches;
}

/** One served match: bans in this competition count down for both squads. */
export function serveBans(state: GameState, f: Fixture): void {
  const key = banKey(f.comp);
  for (const cid of [f.homeId, f.awayId]) {
    for (const id of club(state, cid).playerIds) {
      const p = state.players[id];
      if (p.bans && p.bans[key] > 0) p.bans[key]--;
    }
  }
}

/** Point every player's `suspended` at the ban that applies to his club's next match. */
export function refreshBans(state: GameState): void {
  const next = new Map<number, Fixture>();
  for (const f of state.fixtures) {
    if (f.result || f.comp === 'FRI') continue;
    for (const id of [f.homeId, f.awayId]) {
      const cur = next.get(id);
      if (!cur || f.day < cur.day) next.set(id, f);
    }
  }
  for (const [cid, f] of next) {
    const key = banKey(f.comp);
    for (const id of club(state, cid).playerIds) {
      const p = state.players[id];
      if (p) p.suspended = p.bans?.[key] ?? 0;
    }
  }
}

/** Human-readable list of what a player is banned from, for his profile. */
export function banSummary(state: GameState, p: Player): string {
  const parts = Object.entries(p.bans ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${compLabel(state, k)} (${n})`);
  return parts.join(', ');
}

/** Yellow-card totals per competition, with the limit that brings the next ban. */
export function bookingSummary(state: GameState, p: Player): { label: string; yellows: number; limit: number }[] {
  return Object.entries(p.ycs ?? {}).map(([k, n]) => {
    const limit = yellowLimit(state, k);
    return { label: compLabel(state, k), yellows: n % limit, limit };
  }).filter((x) => x.yellows > 0);
}
