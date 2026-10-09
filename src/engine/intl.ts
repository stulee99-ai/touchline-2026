/**
 * International football: FIFA windows, call-ups, national-team matches and the Asian Cup.
 *
 * National teams are rated with World Football Elo ratings, and results come from those
 * ratings (national sides are mostly made of players from outside the game's six leagues).
 * What matters to the clubs is who goes: each window, every nation with a game calls up its
 * best players, who leave their clubs for the window and come back tired, sometimes injured,
 * with caps and goals to their name. The Asian Cup in January takes players away for up to a
 * month, in the middle of the season.
 *
 * 2026/27 uses the real fixtures (Nations League, AFCON and CONCACAF qualifiers, announced
 * friendlies). What isn't published yet (the Nations League knockouts, the Euro 2028
 * qualifying draw, CONCACAF quarter-finals, most friendlies) is drawn in the game from the
 * tables and ratings, and later seasons generate their own qualifying groups.
 */
import { seasonDay } from './calendar.js';
import { INJURIES, injuryWeights } from './data.js';
import {
  ASIAN_CUP_DATES, ASIAN_CUP_GROUPS, CNL_GROUPS, CNL_SEEDS, CONFED, ELO_2026, INTL_FIXTURES_2026, NATION_NAMES,
  UNL_GROUPS, WINDOWS_2026,
} from './db/intl-2026.js';
import { POS_ROLE } from './attributes.js';
import { isExtPlayer } from './ext.js';
import { roundRobin } from './fixtures.js';
import { addNews, dayLabel } from './game.js';
import { clamp, Rng } from './rng.js';
import type { GameState, IntlGroupComp, IntlMatch, IntlState, Player, Pos } from './types.js';

export const nationName = (code: string): string => NATION_NAMES[code] ?? code;

/** Competition names for the screens. */
export const INTL_COMP_NAMES: Record<string, string> = {
  UNL: 'UEFA Nations League', AFCQ: 'AFCON 2027 qualifying', CNL: 'CONCACAF Nations League', FR: 'Friendly', GULF: 'Arabian Gulf Cup',
  ASEAN: 'FIFA ASEAN Cup', KIRIN: 'Kirin Cup', AC: 'AFC Asian Cup', EQ28: 'Euro 2028 qualifying',
};

export function intlCompName(state: GameState, id: string): string {
  return state.intl.comps.find((c) => c.id === id)?.name ?? INTL_COMP_NAMES[id] ?? id;
}

/** Matchdays of each window (the Nations League's own dates), as 2026/27 dates. */
const WINDOW_DAYS = [
  ['2026-09-25', '2026-09-28', '2026-10-02', '2026-10-05'],
  ['2026-11-13', '2026-11-16'],
  ['2027-03-26', '2027-03-29'],
  ['2027-06-11', '2027-06-14'],
];

interface Window { from: number; to: number; days: number[] }

export function windows(season: number): Window[] {
  return WINDOWS_2026.map((w, i) => ({ from: seasonDay(w.from, season), to: seasonDay(w.to, season), days: WINDOW_DAYS[i].map((d) => seasonDay(d, season)) }));
}

/* ───────────────────────── Set-up ───────────────────────── */

export function emptyIntl(season: number): IntlState {
  return { season, matches: [], elo: { ...ELO_2026 }, squads: {}, comps: [], winners: [], nextId: 1 };
}

/** The level of player a nation calls up, on the ability scale, from its rating. */
export function callUpLevel(elo: number): number {
  return 60 + (elo - 1000) * 0.085;
}

/** Roughly how many caps a player has won before the game starts (no public data for all). */
function seedCaps(state: GameState): void {
  for (const p of Object.values(state.players)) {
    if (p.intl || isExtPlayer(p)) continue;
    const elo = state.intl.elo[p.nation] ?? 1300;
    const thr = callUpLevel(elo) - 20;
    const years = Math.max(0, p.age - 19);
    const f = clamp((p.ca - thr) / 25, 0, 1);
    const caps = p.ca < thr - 8 ? 0 : Math.round(years * f * (5 + (p.attrs.consistency % 4)));
    const role = POS_ROLE[primary(p)];
    const rate = role === 'ST' ? 0.33 : role === 'AW' || role === 'AM' ? 0.2 : role === 'CM' || role === 'WM' ? 0.08 : role === 'GK' ? 0 : 0.03;
    p.intl = { caps, goals: Math.round(caps * rate * (p.attrs.finishing / 14)) };
  }
}

function primary(p: Player): Pos {
  return (Object.keys(p.pos) as Pos[]).find((k) => p.pos[k] === 20) ?? 'MC';
}

/** Start international football for a new game (or an upgraded save). */
export function initIntl(state: GameState, rng: Rng): void {
  state.intl = emptyIntl(state.season);
  seedCaps(state);
  buildIntlSeason(state, rng);
}

/** Nations with players in the game. */
function ourNations(state: GameState): Set<string> {
  const s = new Set<string>();
  for (const p of Object.values(state.players)) if (p.clubId !== null && !isExtPlayer(p)) s.add(p.nation);
  return s;
}

function addMatch(state: GameState, m: Omit<IntlMatch, 'id' | 'result'>): IntlMatch {
  const x: IntlMatch = { ...m, id: state.intl.nextId++, result: null };
  state.intl.matches.push(x);
  return x;
}

/** The season's international calendar: real fixtures for 2026/27, generated groups after that. */
export function buildIntlSeason(state: GameState, rng: Rng): void {
  const I = state.intl;
  I.season = state.season;
  I.matches = [];
  I.squads = {};
  if (state.season === 2026) {
    for (const row of INTL_FIXTURES_2026) {
      const [date, home, away, comp, group] = row.split('|');
      addMatch(state, { day: seasonDay(date, 2026), home, away, comp, group: group || undefined, neutral: comp === 'GULF' || comp === 'ASEAN' });
    }
    // The Asian Cup group stage (knockouts are drawn as it goes).
    for (const [g, teams] of Object.entries(ASIAN_CUP_GROUPS)) {
      const pairs: [number, number][] = [[0, 1], [2, 3], [0, 2], [3, 1], [3, 0], [1, 2]];
      pairs.forEach(([a, b], i) => addMatch(state, { day: seasonDay(ASIAN_CUP_DATES.groups[Math.floor(i / 2)], 2026), home: teams[a], away: teams[b], comp: 'AC', group: g, neutral: teams[a] !== 'KSA' }));
    }
  } else {
    ensureComps(state, rng);
    const w = windows(state.season);
    scheduleRounds(state, w[0].days, 4, true);
    scheduleRounds(state, w[1].days, 2, true);
    scheduleRounds(state, w[2].days, 2, true);
  }
  friendlies(state, rng, 0);
  if (state.season !== 2026) {
    friendlies(state, rng, 1);
    friendlies(state, rng, 2);
  }
}

/* ───────────────────────── Generated competitions ───────────────────────── */

/** Qualifying groups for each confederation, when it has none running. */
function ensureComps(state: GameState, rng: Rng): void {
  const s = state.season;
  const yy = String((s + 1) % 100).padStart(2, '0');
  const active = (c: string) => state.intl.comps.some((x) => x.confed === c && x.groups.some((g) => g.next < g.rounds.length));
  const plan: [string, string, string, number][] = [];
  if (!active('UEFA')) {
    const year = s + 1;
    if (s % 2 === 0) plan.push(['UEFA', `UNL${s}`, `UEFA Nations League ${s}–${yy}`, 4]);
    else plan.push(['UEFA', `Q${year}`, year % 4 === 0 ? `Euro ${year} qualifying` : `World Cup ${year} qualifying`, 5]);
  }
  if (!active('CONMEBOL') && s % 4 === 3) plan.push(['CONMEBOL', `SAQ${s + 3}`, `World Cup ${s + 3} qualifying (CONMEBOL)`, 10]);
  if (!active('CAF')) plan.push(['CAF', `CAF${s}`, s % 2 ? `World Cup qualifying (CAF)` : `AFCON ${s + 1} qualifying`, 4]);
  if (!active('CONCACAF')) plan.push(['CONCACAF', `CNL${s}`, `CONCACAF Nations League ${s}–${yy}`, 4]);
  if (!active('AFC')) plan.push(['AFC', `AFC${s}`, s % 2 ? `World Cup qualifying (AFC)` : `Asian Cup qualifying`, 4]);
  for (const [confed, id, name, size] of plan) {
    const teams = Object.keys(state.intl.elo).filter((n) => CONFED[n] === confed && n !== 'RUS').sort((a, b) => state.intl.elo[b] - state.intl.elo[a]);
    state.intl.comps.push(drawGroups(rng, id, name, confed, teams, size));
  }
}

/** Draw groups from pots of equal strength; each group plays a double round-robin. */
function drawGroups(rng: Rng, id: string, name: string, confed: string, teams: string[], size: number): IntlGroupComp {
  const count = Math.max(1, Math.ceil(teams.length / size));
  const groups: string[][] = Array.from({ length: count }, () => []);
  for (let p = 0; p * count < teams.length; p++) {
    const pot = rng.shuffle(teams.slice(p * count, p * count + count));
    pot.forEach((t, i) => groups[i].push(t));
  }
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return {
    id, name, confed,
    groups: groups.map((g, i) => ({ name: count > 1 ? letters[i] : '', teams: g, rounds: rounds(rng, g), next: 0 })),
  };
}

/** Double round-robin rounds for nation codes (via the league scheduler). */
function rounds(rng: Rng, teams: string[]): [string, string][][] {
  const rr = roundRobin(teams.map((_, i) => i + 1), rng);
  return rr.map((r) => r.map(([h, a]) => [teams[h - 1], teams[a - 1]] as [string, string]));
}

/** Put the next rounds of every running group competition on these matchdays. */
function scheduleRounds(state: GameState, days: number[], max: number, fixturesOnly: boolean, only?: (g: IntlGroupComp['groups'][number]) => boolean): void {
  void fixturesOnly;
  for (const comp of state.intl.comps) {
    for (const g of comp.groups) {
      if (only && !only(g)) continue;
      for (let k = 0; k < Math.min(max, days.length) && g.next < g.rounds.length; k++) {
        for (const [home, away] of g.rounds[g.next]) addMatch(state, { day: days[k], home, away, comp: comp.id, group: g.name || undefined });
        g.next++;
      }
    }
  }
}

/** Friendlies for nations with players in the game who have fewer than two games in a window. */
function friendlies(state: GameState, rng: Rng, w: number): void {
  const win = windows(state.season)[w];
  if (!win) return;
  const inWindow = (m: IntlMatch) => m.day >= win.from && m.day <= win.to;
  const games = new Map<string, number[]>();
  for (const m of state.intl.matches) if (inWindow(m)) for (const n of [m.home, m.away]) games.set(n, [...(games.get(n) ?? []), m.day]);
  const ours = ourNations(state);
  const need = [...ours].filter((n) => (games.get(n)?.length ?? 0) < 2 && n !== 'GLP' && n !== 'MTQ');
  const elo = (n: string) => state.intl.elo[n] ?? 1300;
  const free = (n: string, day: number) => !(games.get(n) ?? []).some((d) => Math.abs(d - day) < 2);
  const played = new Set<string>();
  for (const m of state.intl.matches) if (inWindow(m)) played.add([m.home, m.away].sort().join('-'));
  const others = Object.keys(state.intl.elo).filter((n) => n !== 'GLP' && n !== 'MTQ');
  for (const n of rng.shuffle(need)) {
    for (const day of rng.shuffle([...win.days])) {
      if ((games.get(n)?.length ?? 0) >= 2) break;
      if (!free(n, day)) continue;
      // Similar strength, often from another continent (friendlies are a chance to test yourselves).
      const cands = others.filter((o) => o !== n && free(o, day) && !played.has([n, o].sort().join('-')) && (games.get(o)?.length ?? 0) < 2 && Math.abs(elo(o) - elo(n)) < 260);
      if (!cands.length) continue;
      const wts = cands.map((o) => (ours.has(o) ? 2 : 1) * (CONFED[o] === CONFED[n] ? 1 : 1.3) / (1 + Math.abs(elo(o) - elo(n)) / 80));
      const o = cands[rng.weighted(wts)];
      const [home, away] = rng.chance(0.5) ? [n, o] : [o, n];
      addMatch(state, { day, home, away, comp: 'FR' });
      games.set(n, [...(games.get(n) ?? []), day]);
      games.set(o, [...(games.get(o) ?? []), day]);
      played.add([n, o].sort().join('-'));
    }
  }
}

/* ───────────────────────── Results ───────────────────────── */

function poisson(rng: Rng, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L && k < 12);
  return k - 1;
}

/** Goals from the two sides' ratings: about 1.3 each between equals, a heavy win for a much stronger side. */
function score(rng: Rng, eh: number, ea: number, scale = 1): [number, number] {
  const sup = (eh - ea) / 250;
  return [poisson(rng, Math.max(0.2, 1.3 + sup / 2) * scale), poisson(rng, Math.max(0.2, 1.3 - sup / 2) * scale)];
}

function updateElo(I: IntlState, m: IntlMatch, hg: number, ag: number): void {
  const eh = (I.elo[m.home] ?? 1300) + (m.neutral ? 0 : 100);
  const ea = I.elo[m.away] ?? 1300;
  const we = 1 / (10 ** (-(eh - ea) / 400) + 1);
  const w = hg > ag ? 1 : hg === ag ? 0.5 : 0;
  const diff = Math.abs(hg - ag);
  const g = diff <= 1 ? 1 : diff === 2 ? 1.5 : (11 + diff) / 8;
  const k = (m.comp === 'FR' ? 20 : m.ko ? 50 : 40) * g;
  const d = k * (w - we);
  I.elo[m.home] = Math.round((I.elo[m.home] ?? 1300) + d);
  I.elo[m.away] = Math.round((I.elo[m.away] ?? 1300) - d);
}

/** First-leg score from this match's home side's point of view (for second legs). */
function firstLeg(I: IntlState, m: IntlMatch): [number, number] | null {
  if (m.leg !== 2) return null;
  const f = I.matches.find((x) => x.tie === m.tie && x.leg === 1);
  return f?.result ? [f.result.ag, f.result.hg] : null;
}

/** Winner of a knockout match or two-legged tie (after the deciding match). */
export function koWinner(I: IntlState, m: IntlMatch): string | null {
  if (!m.result || !m.ko || m.leg === 1) return null;
  const f = firstLeg(I, m) ?? [0, 0];
  const h = m.result.hg + f[0];
  const a = m.result.ag + f[1];
  if (h !== a) return h > a ? m.home : m.away;
  const p = m.result.pens;
  return p ? (p[0] > p[1] ? m.home : m.away) : null;
}

interface PlayOpts {
  /** Summer games: results and caps only; players are on holiday, not at their clubs. */
  summer?: boolean;
  news?: string[];
}

/** Play one international and apply it to the players involved. */
function play(state: GameState, rng: Rng, m: IntlMatch, opts: PlayOpts = {}): void {
  const I = state.intl;
  const eh = (I.elo[m.home] ?? 1300) + (m.neutral ? 0 : 70);
  const ea = I.elo[m.away] ?? 1300;
  let [hg, ag] = score(rng, eh, ea);
  let aet = false;
  let pens: [number, number] | undefined;
  if (m.ko && m.leg !== 1) {
    const f = firstLeg(I, m) ?? [0, 0];
    if (hg + f[0] === ag + f[1]) {
      aet = true;
      const [x, y] = score(rng, eh, ea, 0.3);
      hg += x;
      ag += y;
      if (hg + f[0] === ag + f[1]) {
        let a = 0;
        let b = 0;
        for (let k = 0; k < 5; k++) { a += rng.chance(0.76) ? 1 : 0; b += rng.chance(0.74) ? 1 : 0; }
        while (a === b) { a += rng.chance(0.75) ? 1 : 0; b += rng.chance(0.75) ? 1 : 0; }
        pens = [a, b];
      }
    }
  }
  const scorers: [number, 0 | 1][] = [];
  const sides: [string, number][] = [[m.home, hg], [m.away, ag]];
  sides.forEach(([nation, goals], idx) => {
    const got = involve(state, rng, m, nation, goals, (goals > sides[1 - idx][1] ? 1 : goals < sides[1 - idx][1] ? -1 : 0), opts);
    for (const id of got) scorers.push([id, idx as 0 | 1]);
  });
  m.result = { hg, ag, scorers, ...(aet ? { aet } : {}), ...(pens ? { pens } : {}) };
  updateElo(I, m, hg, ag);
}

/** Who plays for a nation (from its players in the game), and what it does to them. Returns the scorers. */
function involve(state: GameState, rng: Rng, m: IntlMatch, nation: string, goals: number, res: number, opts: PlayOpts): number[] {
  const I = state.intl;
  let squad = (I.squads[nation] ?? []).map((id) => state.players[id]).filter((p): p is Player => !!p && !p.injury && p.away?.nation === nation);
  if (opts.summer) squad = pickSquad(state, nation, 23);
  if (!squad.length) return [];
  // The side: the best keeper and the ten best outfielders, with some rotation later in a window.
  const nth = I.matches.filter((x) => x.result && x.day < m.day && x.day > m.day - 12 && (x.home === nation || x.away === nation)).length;
  const jitter = nth ? 7 : 3;
  const sorted = squad.map((p) => ({ p, k: p.ca + rng.normal() * jitter + (p.condition - 90) * 0.3 })).sort((a, b) => b.k - a.k).map((x) => x.p);
  const gks = sorted.filter((p) => (p.pos.GK ?? 0) >= 15);
  const outs = sorted.filter((p) => !(p.pos.GK ?? 0));
  const xi = [...gks.slice(0, 1), ...outs.slice(0, 10)];
  const bench = outs.slice(10);
  const minutes = new Map<Player, number>();
  let subs = 0;
  for (const p of xi) {
    const off = p.pos.GK ? false : rng.chance(0.35);
    minutes.set(p, off ? rng.int(60, 80) : 90);
    if (off) subs++;
  }
  for (const p of bench) {
    if (subs >= 5 || !rng.chance(0.3)) continue;
    minutes.set(p, rng.int(10, 30));
    subs++;
  }
  // Goals: each is scored by one of eleven players, some of them from outside the game.
  const weight = (p: Player) => ({ GK: 0, CB: 0.25, FB: 0.25, DM: 0.45, CM: 0.9, WM: 0.9, AW: 1.7, AM: 1.8, ST: 2.3 })[POS_ROLE[primary(p)]] * (p.attrs.finishing / 12);
  const onPitch = [...minutes.keys()];
  const unknown = Math.max(0, 11 - xi.length) * 0.81;
  const scorers: number[] = [];
  for (let gI = 0; gI < goals; gI++) {
    const wts = [...onPitch.map((p) => weight(p) * (minutes.get(p)! / 90)), unknown];
    const i = rng.weighted(wts);
    if (i < onPitch.length) scorers.push(onPitch[i].id);
  }
  const tag = nationName(nation);
  for (const [p, mins] of minutes) {
    p.intl ??= { caps: 0, goals: 0 };
    p.intl.caps++;
    const g = scorers.filter((id) => id === p.id).length;
    p.intl.goals += g;
    p.stats.intlApps = (p.stats.intlApps ?? 0) + 1;
    p.stats.intlGoals = (p.stats.intlGoals ?? 0) + g;
    if (opts.summer) continue;
    if (p.away) {
      p.away.apps = (p.away.apps ?? 0) + 1;
      p.away.goals = (p.away.goals ?? 0) + g;
    }
    p.morale = clamp(p.morale + res * 2 + g * 3, 15, 98);
    const drain = mins * Math.max(0.06, 0.28 - p.attrs.stamina * 0.011) * ((p.pos.GK ?? 0) >= 15 ? 0.35 : 0.95);
    p.condition = clamp(p.condition - drain, 30, 100);
    const risk = 0.016 * (mins / 90) * (0.4 + p.attrs.injuryProneness / 12) * (p.condition < 60 ? 1.6 : 1);
    if (rng.chance(risk)) {
      const def = INJURIES[rng.weighted(injuryWeights())];
      p.injury = { name: def.name, days: rng.int(def.min * 7 - 3, def.max * 7) };
      // Sent back to his club for treatment.
      if (p.away) p.away.until = state.day + 1;
      if (p.clubId === state.userClubId) {
        const wk = Math.max(1, Math.ceil(p.injury.days / 7));
        addNews(state, {
          kind: 'injury',
          title: `${fullName(p)} injured on international duty`,
          body: `${fullName(p)} picked up a ${p.injury.name.toLowerCase()} playing for ${tag} and returns to the club for treatment. He'll be out for about ${wk} week${wk > 1 ? 's' : ''}.`,
        });
      }
    }
  }
  return scorers;
}

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();

/* ───────────────────────── Call-ups ───────────────────────── */

/** A nation's squad from its players in the game: its best, in proportion to its level. */
export function pickSquad(state: GameState, nation: string, size = 26): Player[] {
  const thr = callUpLevel(state.intl.elo[nation] ?? 1300) - 20;
  const pool = Object.values(state.players).filter((p) => p.nation === nation && p.clubId !== null && !isExtPlayer(p) && !p.injury && p.age >= 17 && p.ca >= thr);
  const key = (p: Player) => p.ca + (p.age <= 18 ? -8 : p.age >= 35 ? -6 : 0) + (p.morale - 60) / 10;
  pool.sort((a, b) => key(b) - key(a));
  const gks = pool.filter((p) => (p.pos.GK ?? 0) >= 15).slice(0, 3);
  const outs = pool.filter((p) => !(p.pos.GK ?? 0)).slice(0, size - 3);
  return [...gks, ...outs];
}

/** Squads for every nation with a game between these days. */
function callUps(state: GameState, from: number, to: number, what: string): void {
  const I = state.intl;
  I.squads = {};
  const nations = new Set<string>();
  for (const m of I.matches) if (m.day >= from && m.day <= to) { nations.add(m.home); nations.add(m.away); }
  for (const n of nations) {
    const squad = pickSquad(state, n);
    if (squad.length) I.squads[n] = squad.map((p) => p.id);
  }
  // The manager hears who's going.
  const mine = Object.entries(I.squads).flatMap(([n, ids]) => ids.filter((id) => state.players[id].clubId === state.userClubId).map((id) => [n, state.players[id]] as [string, Player]));
  if (mine.length) {
    const by = new Map<string, string[]>();
    for (const [n, p] of mine) by.set(n, [...(by.get(n) ?? []), p.lastName]);
    const list = [...by].map(([n, names]) => `${names.join(', ')} (${nationName(n)})`).join('; ');
    addNews(state, {
      kind: 'squad',
      title: `${mine.length} player${mine.length > 1 ? 's' : ''} called up for ${what}`,
      body: `Called up: ${list}. They join their national squads on ${dayLabel(state.season, from)} and are unavailable until they return.`,
      link: { label: 'Internationals', screen: 'intl' },
    });
  }
}

/** The squads leave their clubs. */
function depart(state: GameState, until: number, what: string): void {
  for (const [n, ids] of Object.entries(state.intl.squads)) {
    for (const id of ids) {
      const p = state.players[id];
      if (!p || p.injury || p.clubId === null) continue;
      p.away = { nation: n, until, what };
    }
  }
}

/** Players back from international duty: tired from the games and the travel. */
function returns(state: GameState): void {
  const back: Player[] = [];
  for (const p of Object.values(state.players)) {
    if (!p.away || p.away.until > state.day) continue;
    // Long trips home (outside Europe) take more out of them.
    const far = CONFED[p.away.nation] !== 'UEFA';
    p.condition = clamp(p.condition - (far ? 8 : 2), 30, 100);
    if (p.clubId === state.userClubId) back.push({ ...p, away: { ...p.away } } as Player);
    p.away = null;
  }
  if (!back.length) return;
  const lines = back.map((p) => {
    const apps = p.away?.apps ?? 0;
    const goals = p.away?.goals ?? 0;
    const bits = [`${fullName(p)} (${nationName(p.away?.nation ?? p.nation)}): ${apps ? `${apps} game${apps > 1 ? 's' : ''}${goals ? `, ${goals} goal${goals > 1 ? 's' : ''}` : ''}` : 'did not play'}`];
    if (p.injury) bits.push(`injured, ${p.injury.name.toLowerCase()}`);
    else if (p.condition < 80) bits.push(`tired (${Math.round(p.condition)}% condition)`);
    return bits.join(', ');
  });
  addNews(state, {
    kind: 'squad',
    title: `${back.length} player${back.length > 1 ? 's' : ''} back from international duty`,
    body: `Back at the club: ${lines.join('; ')}.`,
    link: { label: 'Internationals', screen: 'intl' },
  });
}

/* ───────────────────────── Knockouts drawn in the game ───────────────────────── */

export interface NationRow { nation: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }

/** A group table from its played matches. */
export function intlTable(state: GameState, comp: string, group: string | undefined, teams?: string[]): NationRow[] {
  const rows = new Map<string, NationRow>();
  const row = (n: string) => {
    if (!rows.has(n)) rows.set(n, { nation: n, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
    return rows.get(n)!;
  };
  for (const n of teams ?? []) row(n);
  for (const m of state.intl.matches) {
    if (m.comp !== comp || (group !== undefined && m.group !== group) || m.ko || !m.result) continue;
    const h = row(m.home);
    const a = row(m.away);
    const r = m.result;
    h.p++; a.p++; h.gf += r.hg; h.ga += r.ag; a.gf += r.ag; a.ga += r.hg;
    if (r.hg > r.ag) { h.w++; a.l++; h.pts += 3; } else if (r.hg < r.ag) { a.w++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || (state.intl.elo[y.nation] ?? 0) - (state.intl.elo[x.nation] ?? 0));
}

function twoLegs(state: GameState, comp: string, stage: string, tie: string, first: string, second: string, d1: number, d2: number): void {
  // `second` hosts the second leg.
  addMatch(state, { day: d1, home: first, away: second, comp, stage, tie, leg: 1, ko: true });
  addMatch(state, { day: d2, home: second, away: first, comp, stage, tie, leg: 2, ko: true });
}

/** CONCACAF Nations League quarter-finals (November): the four seeds against the League A group leaders. */
function cnlQuarterFinals(state: GameState): void {
  const s = state.season;
  const g1 = intlTable(state, 'CNL', 'A1', CNL_GROUPS.A1);
  const g2 = intlTable(state, 'CNL', 'A2', CNL_GROUPS.A2);
  const byPts = (a: NationRow, b: NationRow) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga);
  const winners = [g1[0], g2[0]].sort(byPts).map((r) => r.nation);
  const runners = [g1[1], g2[1]].sort(byPts).map((r) => r.nation);
  const opp = [winners[0], winners[1], runners[0], runners[1]];
  CNL_SEEDS.forEach((seed, i) => twoLegs(state, 'CNL', 'Quarter-finals', `CNLQF${i}`, opp[i], seed, seasonDay('2026-11-13', s), seasonDay('2026-11-17', s)));
}

/** March 2027: Nations League quarter-finals and promotion play-offs, and the Euro 2028 qualifying draw. */
function marchDraws(state: GameState, rng: Rng): void {
  const s = state.season;
  const d1 = seasonDay('2027-03-26', s);
  const d2 = seasonDay('2027-03-29', s);
  const table = (g: string) => intlTable(state, 'UNL', g, UNL_GROUPS[g]).map((r) => r.nation);
  const A = ['A1', 'A2', 'A3', 'A4'].map(table);
  const B = ['B1', 'B2', 'B3', 'B4'].map(table);
  const C = ['C1', 'C2', 'C3', 'C4'].map(table);
  // Quarter-finals: each group winner plays a runner-up from another group, hosting the second leg.
  const other = [1, 0, 3, 2];
  const busy: string[] = [];
  A.forEach((t, i) => {
    twoLegs(state, 'UNL', 'Quarter-finals', `UNLQF${i}`, A[other[i]][1], t[0], d1, d2);
    busy.push(t[0], A[other[i]][1]);
  });
  // Promotion/relegation play-offs: League A thirds v League B runners-up, B thirds v C runners-up.
  const perm = rng.shuffle([0, 1, 2, 3]);
  A.forEach((t, i) => { twoLegs(state, 'UNL', 'League A/B play-offs', `UNLAB${i}`, B[perm[i]][1], t[2], d1, d2); busy.push(t[2], B[perm[i]][1]); });
  const perm2 = rng.shuffle([0, 1, 2, 3]);
  B.forEach((t, i) => { twoLegs(state, 'UNL', 'League B/C play-offs', `UNLBC${i}`, C[perm2[i]][1], t[2], d1, d2); busy.push(t[2], C[perm2[i]][1]); });
  // Euro 2028 qualifying: 54 teams, six groups of five (they start in March) and six of four.
  const uefa = Object.keys(state.intl.elo).filter((n) => CONFED[n] === 'UEFA' && n !== 'RUS');
  const elo = (n: string) => state.intl.elo[n] ?? 1300;
  const rest = uefa.filter((n) => !busy.includes(n)).sort((a, b) => elo(a) - elo(b));
  const four = [...busy, ...rest.slice(0, Math.max(0, 24 - busy.length))].sort((a, b) => elo(b) - elo(a));
  const five = uefa.filter((n) => !four.includes(n)).sort((a, b) => elo(b) - elo(a));
  const pot = (list: string[], n: number) => {
    const gs: string[][] = Array.from({ length: n }, () => []);
    for (let p = 0; p * n < list.length; p++) rng.shuffle(list.slice(p * n, p * n + n)).forEach((t, i) => gs[i].push(t));
    return gs;
  };
  const g5 = pot(five, Math.round(five.length / 5));
  const g4 = pot(four, Math.round(four.length / 4));
  const letters = 'ABCDEFGHIJKL';
  const comp: IntlGroupComp = {
    id: 'EQ28', name: 'Euro 2028 qualifying', confed: 'UEFA',
    groups: [...g5, ...g4].map((g, i) => ({ name: letters[i], teams: g, rounds: rounds(rng, g), next: 0 })),
  };
  state.intl.comps.push(comp);
  scheduleRounds(state, [d1, d2], 2, true, (g) => g.teams.length === 5);
  const me = state.clubs.find((c) => c.id === state.userClubId);
  void me;
  addNews(state, {
    kind: 'season',
    title: 'Euro 2028 qualifying draw',
    body: `The draw for Euro 2028 qualifying has been made. ${comp.groups.slice(0, 12).map((g) => `Group ${g.name}: ${g.teams.map(nationName).join(', ')}`).join('. ')}. The five-team groups start in March; the four-team groups, full of teams busy with the Nations League knockouts and play-offs, start in September.`,
    link: { label: 'Internationals', screen: 'intl' },
  });
}

/** CONCACAF Nations League finals in Los Angeles (March). */
function cnlFinals(state: GameState): void {
  const qf = [0, 1, 2, 3].map((i) => state.intl.matches.find((m) => m.tie === `CNLQF${i}` && m.leg === 2)).map((m) => (m ? koWinner(state.intl, m) : null));
  if (qf.some((w) => !w)) return;
  const s = state.season;
  addMatch(state, { day: seasonDay('2027-03-25', s), home: qf[0]!, away: qf[3]!, comp: 'CNL', stage: 'Semi-finals', tie: 'CNLSF0', ko: true, neutral: true });
  addMatch(state, { day: seasonDay('2027-03-25', s), home: qf[1]!, away: qf[2]!, comp: 'CNL', stage: 'Semi-finals', tie: 'CNLSF1', ko: true, neutral: true });
}

/** After each day's games: knockout rounds that are now known. */
function progress(state: GameState, rng: Rng): void {
  const I = state.intl;
  const s = state.season;
  const find = (tie: string) => I.matches.find((m) => m.tie === tie && m.leg !== 1);
  // CONCACAF final.
  const sf = [find('CNLSF0'), find('CNLSF1')];
  if (sf.every((m) => m?.result) && !find('CNLF')) {
    addMatch(state, { day: seasonDay('2027-03-28', s), home: koWinner(I, sf[0]!)!, away: koWinner(I, sf[1]!)!, comp: 'CNL', stage: 'Final', tie: 'CNLF', ko: true, neutral: true });
  }
  const cf = find('CNLF');
  if (cf?.result && !I.winners.some((w) => w.season === s && w.comp === 'CNL')) winner(state, 'CNL', koWinner(I, cf)!);
  // Asian Cup: groups, then round of 16 to the final.
  asianCupProgress(state, rng);
}

function winner(state: GameState, comp: string, nation: string): void {
  state.intl.winners.push({ season: state.season, comp, nation });
  const mine = state.clubs.find((c) => c.id === state.userClubId)!;
  const ours = mine.playerIds.map((id) => state.players[id]).filter((p) => p.nation === nation && (p.stats.intlApps ?? 0) > 0).map((p) => p.lastName);
  addNews(state, {
    kind: 'award',
    title: `${nationName(nation)} win the ${intlCompName(state, comp)}`,
    body: `${nationName(nation)} are the ${intlCompName(state, comp)} winners.${ours.length ? ` Congratulations to ${ours.join(', ')} from your squad.` : ''}`,
  });
}

function asianCupProgress(state: GameState, rng: Rng): void {
  void rng;
  const I = state.intl;
  const s = state.season;
  const ac = I.matches.filter((m) => m.comp === 'AC');
  if (!ac.length) return;
  const groupsDone = ac.filter((m) => !m.ko).every((m) => m.result);
  const stage = (name: string) => ac.filter((m) => m.stage === name);
  const out = (nations: string[], day: number) => {
    for (const n of nations) for (const id of I.squads[n] ?? []) {
      const p = state.players[id];
      if (p?.away?.nation === n) p.away.until = Math.min(p.away.until, day + 2);
    }
  };
  if (groupsDone && !stage('Round of 16').length) {
    const tables = Object.entries(ASIAN_CUP_GROUPS).map(([g, t]) => intlTable(state, 'AC', g, t));
    const byRow = (a: NationRow, b: NationRow) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf;
    const thirds = tables.map((t) => t[2]).sort(byRow);
    const seeds = [...tables.map((t) => t[0]).sort(byRow), ...tables.map((t) => t[1]).sort(byRow), ...thirds.slice(0, 4)].map((r) => r.nation);
    const eliminated = [...tables.map((t) => t[3].nation), ...thirds.slice(4).map((r) => r.nation)];
    out(eliminated, state.day);
    const day = seasonDay(ASIAN_CUP_DATES.r16, s);
    for (let i = 0; i < 8; i++) addMatch(state, { day, home: seeds[i], away: seeds[15 - i], comp: 'AC', stage: 'Round of 16', tie: `ACR16${i}`, ko: true, neutral: seeds[i] !== 'KSA' });
    return;
  }
  const next: [string, string, string, number][] = [['Round of 16', 'Quarter-finals', ASIAN_CUP_DATES.qf, 4], ['Quarter-finals', 'Semi-finals', ASIAN_CUP_DATES.sf, 2], ['Semi-finals', 'Final', ASIAN_CUP_DATES.final, 1]];
  for (const [from, to, date, n] of next) {
    const prev = stage(from);
    if (!prev.length || !prev.every((m) => m.result) || stage(to).length) continue;
    const w = prev.map((m) => koWinner(I, m)!);
    out(prev.map((m) => (koWinner(I, m) === m.home ? m.away : m.home)), state.day);
    const day = seasonDay(date, s);
    // Bracket order: winners 1 and 8 meet, and so on.
    const order = n === 4 ? [[0, 7], [3, 4], [1, 6], [2, 5]] : n === 2 ? [[0, 1], [2, 3]] : [[0, 1]];
    for (const [a, b] of order) addMatch(state, { day, home: w[a], away: w[b], comp: 'AC', stage: to, tie: `AC${to}${a}`, ko: true, neutral: w[a] !== 'KSA' });
  }
  const fin = stage('Final')[0];
  if (fin?.result && !I.winners.some((x) => x.season === s && x.comp === 'AC')) {
    const w = koWinner(I, fin)!;
    out([fin.home, fin.away], state.day);
    winner(state, 'AC', w);
  }
}

/* ───────────────────────── The day loop ───────────────────────── */

/** Called for every day of the season, after the calendar has moved on. */
export function internationalDay(state: GameState, rng: Rng): void {
  const I = state.intl;
  if (!I) return;
  const s = state.season;
  const day = state.day;
  const ws = windows(s).slice(0, 3);
  ws.forEach((w, i) => {
    if (day === w.from - 6) callUps(state, w.from, w.to, i === 0 ? 'the September and October internationals' : i === 1 ? 'the November internationals' : 'the March internationals');
    if (day === w.from) depart(state, w.to + 1, 'internationals');
  });
  if (s === 2026) {
    const acFrom = seasonDay(ASIAN_CUP_DATES.callup, s);
    if (day === acFrom) {
      callUps(state, acFrom, seasonDay(ASIAN_CUP_DATES.final, s), 'the Asian Cup in Saudi Arabia');
      depart(state, seasonDay(ASIAN_CUP_DATES.final, s) + 2, 'the Asian Cup');
    }
  }
  const today = I.matches.filter((m) => m.day === day && !m.result);
  for (const m of today) play(state, rng, m);
  if (today.length) progress(state, rng);
  returns(state);
  // Between windows: the next window's knockouts and friendlies.
  if (s === 2026) {
    if (day === ws[0].to + 1) {
      cnlQuarterFinals(state);
      friendlies(state, rng, 1);
    }
    if (day === seasonDay('2026-12-06', s)) {
      marchDraws(state, rng);
      cnlFinals(state);
      friendlies(state, rng, 2);
    }
  }
  if (today.length) resultsNews(state, today);
}

/** A line in the news when nations with the manager's players have played. */
function resultsNews(state: GameState, today: IntlMatch[]): void {
  const mine = new Set(state.clubs.find((c) => c.id === state.userClubId)?.playerIds ?? []);
  const lines: string[] = [];
  for (const m of today) {
    const r = m.result!;
    const ours = r.scorers.filter(([id]) => mine.has(id)).map(([id]) => state.players[id]?.lastName).filter(Boolean);
    const playing = [...(state.intl.squads[m.home] ?? []), ...(state.intl.squads[m.away] ?? [])].some((id) => mine.has(id));
    if (!playing) continue;
    const pens = r.pens ? ` (${r.pens[0]}-${r.pens[1]} pens)` : r.aet ? ' (aet)' : '';
    lines.push(`${nationName(m.home)} ${r.hg}-${r.ag} ${nationName(m.away)}${pens}${ours.length ? `, ${countNames(ours)} scoring` : ''}`);
  }
  if (!lines.length) return;
  addNews(state, { kind: 'result', title: `International results: ${lines.length} game${lines.length > 1 ? 's' : ''} with your players`, body: `${lines.join('. ')}.`, link: { label: 'Internationals', screen: 'intl' } });
}

function countNames(names: string[]): string {
  const c = new Map<string, number>();
  for (const n of names) c.set(n, (c.get(n) ?? 0) + 1);
  return [...c].map(([n, k]) => (k > 1 ? `${n} (${k})` : n)).join(' and ');
}

/* ───────────────────────── Summer ───────────────────────── */

/**
 * The June window, played after the club season: results, caps and trophies only (players
 * are on their summer break, so no effect on the clubs). Then next season's calendar.
 */
export function intlSummer(state: GameState, rng: Rng): void {
  const I = state.intl;
  if (!I) return;
  const s = state.season;
  const w = windows(s)[3];
  // Anything left unplayed (the season ended early), then the June games.
  const leftover = I.matches.filter((m) => !m.result).sort((a, b) => a.day - b.day);
  for (const m of leftover) play(state, rng, m, { summer: true });
  const june = [w.days[0], w.days[1]];
  if (s === 2026) {
    // Nations League Finals.
    const qf = [0, 1, 2, 3].map((i) => I.matches.find((m) => m.tie === `UNLQF${i}` && m.leg === 2)).map((m) => (m ? koWinner(I, m) : null));
    if (qf.every(Boolean)) {
      const sf = [addMatch(state, { day: seasonDay('2027-06-09', s), home: qf[0]!, away: qf[1]!, comp: 'UNL', stage: 'Semi-finals', tie: 'UNLSF0', ko: true, neutral: true }),
        addMatch(state, { day: seasonDay('2027-06-10', s), home: qf[2]!, away: qf[3]!, comp: 'UNL', stage: 'Semi-finals', tie: 'UNLSF1', ko: true, neutral: true })];
      for (const m of sf) play(state, rng, m, { summer: true });
      const f = addMatch(state, { day: seasonDay('2027-06-13', s), home: koWinner(I, sf[0])!, away: koWinner(I, sf[1])!, comp: 'UNL', stage: 'Final', tie: 'UNLF', ko: true, neutral: true });
      play(state, rng, f, { summer: true });
      winner(state, 'UNL', koWinner(I, f)!);
    }
    scheduleRounds(state, june, 2, true, (g) => g.teams.length === 5);
  } else {
    scheduleRounds(state, june, 2, true, (g) => g.teams.length >= 5);
  }
  for (const m of I.matches.filter((x) => !x.result)) play(state, rng, m, { summer: true });
}

/** Next season: clear the calendar, build the new one. */
export function newIntlSeason(state: GameState, rng: Rng): void {
  if (!state.intl) return;
  for (const p of Object.values(state.players)) p.away = null;
  state.intl.comps = state.intl.comps.filter((c) => c.groups.some((g) => g.next < g.rounds.length));
  buildIntlSeason(state, rng);
}

/** How long a player is away with his country, for the screens. */
export function awayText(state: GameState, p: Player): string {
  if (!p.away) return '';
  return `With ${nationName(p.away.nation)} (${p.away.what}) until ${dayLabel(state.season, p.away.until)}`;
}

