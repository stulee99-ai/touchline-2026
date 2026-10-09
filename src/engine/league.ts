import type { Competition, Fixture, GameState } from './types.js';

export interface TableRow {
  clubId: number;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  /** Points deducted for breaking spending rules. */
  ded: number;
  /** Last five results, oldest first: 'W' | 'D' | 'L'. */
  form: string[];
}

const FRIENDLY: Competition = { id: 'FRI', name: 'Friendly', kind: 'league', country: '', nation: '', clubIds: [] };

export function comp(state: GameState, id: string): Competition {
  return state.comps.find((c) => c.id === id) ?? (id === 'FRI' ? FRIENDLY : undefined!);
}

export function leagueTable(state: GameState, compId: string): TableRow[] {
  const rows = new Map<number, TableRow>();
  for (const id of comp(state, compId).clubIds) rows.set(id, { clubId: id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, ded: 0, form: [] });
  const played = state.fixtures.filter((f) => f.comp === compId && f.result).sort((a, b) => a.day - b.day);
  for (const f of played) {
    const r = f.result!;
    const h = rows.get(f.homeId)!;
    const a = rows.get(f.awayId)!;
    h.p++; a.p++;
    h.gf += r.hg; h.ga += r.ag; a.gf += r.ag; a.ga += r.hg;
    if (r.hg > r.ag) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
    else if (r.hg < r.ag) { a.w++; h.l++; a.pts += 3; h.form.push('L'); a.form.push('W'); }
    else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
  }
  const list = [...rows.values()];
  for (const r of list) {
    r.gd = r.gf - r.ga;
    r.form = r.form.slice(-5);
  }
  for (const r of list) {
    const ded = state.clubs[r.clubId - 1]?.finance?.deduction ?? 0;
    r.ded = ded;
    r.pts -= ded;
  }
  const names = new Map(state.clubs.map((c) => [c.id, c.name]));
  list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || names.get(x.clubId)!.localeCompare(names.get(y.clubId)!));
  return list;
}

export function fixturesForRound(state: GameState, compId: string, round: number): Fixture[] {
  return state.fixtures.filter((f) => f.comp === compId && f.round === round);
}

export function clubFixtures(state: GameState, clubId: number): Fixture[] {
  return state.fixtures.filter((f) => f.homeId === clubId || f.awayId === clubId).sort((a, b) => a.day - b.day);
}
