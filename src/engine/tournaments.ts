/**
 * Summer tournaments: the World Cup, the Euros, the Copa América, the Africa Cup of Nations and the
 * Gold Cup, in their real years.
 *
 *  - World Cup: 2026 (USA, Canada, Mexico: the real draw), 2030 (Spain, Portugal, Morocco; Argentina,
 *    Uruguay and Paraguay also qualify automatically), 2034 (Saudi Arabia), then every four years.
 *    48 teams: twelve groups of four, the top two and the eight best thirds into a round of 32.
 *  - Euros: 2028 (England, Scotland, Wales, Ireland), 2032 (Italy, Turkey), every four years. 24 teams.
 *  - Copa América: 2028 (USA), every four years: ten CONMEBOL nations and six from CONCACAF.
 *  - Africa Cup of Nations: 2027 (Kenya, Tanzania, Uganda; 19 June – 18 July), then every four years
 *    from 2028. 24 teams.
 *  - Gold Cup: every odd year from 2027. 16 teams (Saudi Arabia are guests in 2027).
 *
 * They're played in June and July, before the club season. The squads leave their clubs until their
 * country is knocked out, then take three weeks' holiday, so a long run means missing pre-season.
 * Who qualifies comes from the qualifying the game plays (Euro qualifying, AFCON qualifying, the
 * Nations Leagues, World Cup qualifying), and from the world ratings where the game has none.
 * Results come from the ratings, as for every international; players in the game win caps, score,
 * get tired and sometimes injured. At the end: a player of the tournament and a young player of the
 * tournament (21 or under), from the players in the game.
 */
import { hashString } from './attributes.js';
import { dayOfDate } from './calendar.js';
import { AFCQ_GROUPS, CNL_GROUPS, CNL_SEEDS, CONFED, UNL_GROUPS } from './db/intl-2026.js';
import { isExtPlayer } from './ext.js';
import { addNews, dayLabel } from './game.js';
import { initContract } from './finance.js';
import { holidaySharp } from './training.js';
import { createPlayer, giveContract, rollPotential } from './generate.js';
import { clamp } from './rng.js';
import { available } from './tactics.js';
import type { Club, Pos } from './types.js';
import { addIntlMatch, intlTable, koWinner, nationName, pickSquad, playIntl, recordWinner } from './intl.js';
import { Rng } from './rng.js';
import type { AwardPick, GameState, IntlMatch, Player, TourKind, Tournament } from './types.js';

/** Days off after a country is knocked out (or after the final). */
export const HOLIDAY_DAYS = 21;

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
/** A season day for a date in the summer of year y (the summer before season y). */
const sday = (y: number, m: number, d: number) => dayOfDate(y, iso(y, m, d));

interface Plan {
  /** Start and length (days) of each group matchday. */
  md: [m: number, d: number, span: number][];
  /** Knockout rounds: name, first day, days it is spread over. */
  ko: [stage: string, m: number, d: number, span: number][];
  third?: [m: number, d: number];
}

const PLANS: Record<TourKind, Plan> = {
  WC: { md: [[6, 11, 6], [6, 17, 6], [6, 23, 5]], ko: [['Round of 32', 6, 28, 6], ['Round of 16', 7, 4, 4], ['Quarter-finals', 7, 9, 3], ['Semi-finals', 7, 14, 2], ['Final', 7, 19, 1]], third: [7, 18] },
  EURO: { md: [[6, 9, 5], [6, 14, 5], [6, 19, 4]], ko: [['Round of 16', 6, 24, 4], ['Quarter-finals', 6, 30, 2], ['Semi-finals', 7, 4, 2], ['Final', 7, 9, 1]] },
  COPA: { md: [[6, 12, 4], [6, 16, 4], [6, 20, 4]], ko: [['Quarter-finals', 6, 26, 2], ['Semi-finals', 7, 1, 2], ['Final', 7, 5, 1]], third: [7, 4] },
  AFCON: { md: [[6, 19, 4], [6, 23, 4], [6, 27, 4]], ko: [['Round of 16', 7, 3, 4], ['Quarter-finals', 7, 9, 2], ['Semi-finals', 7, 14, 1], ['Final', 7, 18, 1]], third: [7, 17] },
  GOLD: { md: [[6, 14, 3], [6, 18, 3], [6, 22, 3]], ko: [['Quarter-finals', 6, 27, 2], ['Semi-finals', 7, 1, 2], ['Final', 7, 6, 1]] },
};

const NAMES: Record<TourKind, string> = { WC: 'World Cup', EURO: 'Euro', COPA: 'Copa América', AFCON: 'Africa Cup of Nations', GOLD: 'Gold Cup' };
const SIZE: Record<TourKind, [teams: number, groups: number, thirds: number]> = { WC: [48, 12, 8], EURO: [24, 6, 4], COPA: [16, 4, 0], AFCON: [24, 6, 4], GOLD: [16, 4, 0] };

/** The real 2026 World Cup draw (with the play-off winners), in draw order. */
const WC2026_GROUPS: string[][] = [
  ['MEX', 'RSA', 'KOR', 'CZE'], ['CAN', 'BIH', 'QAT', 'SUI'], ['BRA', 'MAR', 'HAI', 'SCO'], ['USA', 'PAR', 'AUS', 'TUR'],
  ['GER', 'CUW', 'CIV', 'ECU'], ['NED', 'JPN', 'SWE', 'TUN'], ['BEL', 'EGY', 'IRN', 'NZL'], ['ESP', 'CPV', 'KSA', 'URU'],
  ['FRA', 'SEN', 'IRQ', 'NOR'], ['ARG', 'ALG', 'AUT', 'JOR'], ['POR', 'COD', 'UZB', 'COL'], ['ENG', 'CRO', 'GHA', 'PAN'],
];

/** Which tournaments are played in the summer of year y. */
export function tournamentsIn(y: number): TourKind[] {
  const out: TourKind[] = [];
  if (y >= 2026 && y % 4 === 2) out.push('WC');
  if (y >= 2028 && y % 4 === 0) out.push('EURO', 'COPA');
  if (y === 2027 || (y >= 2028 && y % 4 === 0)) out.push('AFCON');
  if (y >= 2027 && y % 2 === 1) out.push('GOLD');
  return out;
}

function hostsOf(kind: TourKind, y: number): { where: string; hosts: string[] } {
  if (kind === 'WC') {
    if (y === 2026) return { where: 'the USA, Canada and Mexico', hosts: ['USA', 'CAN', 'MEX'] };
    if (y === 2030) return { where: 'Spain, Portugal and Morocco', hosts: ['ESP', 'POR', 'MAR'] };
    if (y === 2034) return { where: 'Saudi Arabia', hosts: ['KSA'] };
    return { where: 'a host to be decided', hosts: [] };
  }
  if (kind === 'EURO') {
    if (y === 2028) return { where: 'England, Scotland, Wales and Ireland', hosts: ['ENG', 'SCO', 'WAL', 'IRL'] };
    if (y === 2032) return { where: 'Italy and Turkey', hosts: ['ITA', 'TUR'] };
    return { where: 'a host to be decided', hosts: [] };
  }
  if (kind === 'COPA') return y === 2028 ? { where: 'the USA', hosts: ['USA'] } : { where: 'South America', hosts: [] };
  if (kind === 'AFCON') return y === 2027 ? { where: 'Kenya, Tanzania and Uganda', hosts: ['KEN', 'TAN', 'UGA'] } : { where: 'a host to be decided', hosts: [] };
  return { where: 'the USA', hosts: ['USA'] };
}

/* ───────────────────────── Who qualifies ───────────────────────── */

const elo = (state: GameState, n: string) => state.intl.elo[n] ?? 1300;
const confedTeams = (state: GameState, confed: string) => Object.keys(state.intl.elo).filter((n) => CONFED[n] === confed && n !== 'RUS' && n !== 'GLP' && n !== 'MTQ');

/**
 * A confederation's nations in order of how they did in its qualifying (group winners, then
 * runners-up, and so on), then the rest by rating. `which` picks the qualifying competitions.
 */
function qualifyingOrder(state: GameState, confed: string, which: RegExp): { order: string[]; from: string | null } {
  const I = state.intl;
  const groups: { comp: string; group: string | undefined; teams: string[]; name: string }[] = [];
  for (const c of I.comps) if (c.confed === confed && which.test(c.name)) for (const g of c.groups) groups.push({ comp: c.id, group: g.name || undefined, teams: g.teams, name: c.name });
  const fixed: [string, string, Record<string, string[]>, string][] = [['UEFA', 'UNL', UNL_GROUPS, 'UEFA Nations League'], ['CAF', 'AFCQ', AFCQ_GROUPS, 'AFCON 2027 qualifying'], ['CONCACAF', 'CNL', CNL_GROUPS, 'CONCACAF Nations League']];
  for (const [cf, comp, gs, name] of fixed) if (cf === confed && which.test(name) && I.matches.some((m) => m.comp === comp)) for (const [g, teams] of Object.entries(gs)) groups.push({ comp, group: g, teams, name });
  const played = groups.filter((g) => I.matches.some((m) => m.comp === g.comp && (g.group === undefined || m.group === g.group) && m.result));
  const rows = played.flatMap((g) => intlTable(state, g.comp, g.group, g.teams).map((r, pos) => ({ n: r.nation, pos, pts: r.p ? r.pts / r.p : 0, gd: r.p ? (r.gf - r.ga) / r.p : 0 })));
  rows.sort((a, b) => a.pos - b.pos || b.pts - a.pts || b.gd - a.gd || elo(state, b.n) - elo(state, a.n));
  const seen = new Set<string>();
  const order: string[] = [];
  // Guadeloupe and Martinique play in CONCACAF but aren't FIFA members, so can't qualify.
  for (const r of rows) if (!seen.has(r.n) && r.n !== 'GLP' && r.n !== 'MTQ') { seen.add(r.n); order.push(r.n); }
  for (const n of confedTeams(state, confed).sort((a, b) => elo(state, b) - elo(state, a))) if (!seen.has(n)) { seen.add(n); order.push(n); }
  return { order, from: played[0]?.name ?? null };
}

/** The field for a tournament, and a line on how it was decided. */
function field(state: GameState, kind: TourKind, y: number, hosts: string[]): { teams: string[]; how: string } {
  const take = (list: string[], n: number, have: string[]) => { const out = [...have]; for (const t of list) { if (out.length >= n) break; if (!out.includes(t)) out.push(t); } return out; };
  if (kind === 'EURO') {
    const q = qualifyingOrder(state, 'UEFA', /Euro/);
    let teams = take(q.order, 24, []);
    // Two places are kept for hosts who don't qualify.
    const missing = hosts.filter((h) => !teams.includes(h)).sort((a, b) => elo(state, b) - elo(state, a)).slice(0, 2);
    if (missing.length) teams = [...teams.slice(0, 24 - missing.length), ...missing];
    return { teams, how: q.from ? `From ${q.from}: the group winners, the best runners-up and the play-off winners${missing.length ? ', with places kept for the hosts' : ''}.` : 'From the world ratings (no qualifying played in the game).' };
  }
  if (kind === 'AFCON') {
    const q = qualifyingOrder(state, 'CAF', /AFCON/);
    return { teams: take(q.order, 24, hosts), how: q.from ? `The hosts, and the top two in each group of ${q.from}.` : 'The hosts, and the best of Africa on the world ratings.' };
  }
  if (kind === 'GOLD') {
    const q = qualifyingOrder(state, 'CONCACAF', /CONCACAF|Gold/);
    const guest = y === 2027 ? ['KSA'] : [];
    // 2026–27: the four Nations League seeds went straight to the quarter-finals, so they come first.
    const order = y === 2027 ? [...CNL_SEEDS, ...q.order] : q.order;
    return { teams: [...take(order, 16 - guest.length, hosts.filter((h) => CONFED[h] === 'CONCACAF')), ...guest], how: `${q.from ? `From the ${q.from}` : 'From the world ratings'}${guest.length ? ', with Saudi Arabia as guests' : ''}.` };
  }
  if (kind === 'COPA') {
    const sa = confedTeams(state, 'CONMEBOL').sort((a, b) => elo(state, b) - elo(state, a));
    const nc = take(confedTeams(state, 'CONCACAF').sort((a, b) => elo(state, b) - elo(state, a)), 6, hosts.filter((h) => CONFED[h] === 'CONCACAF'));
    return { teams: [...sa.slice(0, 10), ...nc], how: 'All ten South American nations, and six invited from CONCACAF.' };
  }
  // World Cup (after 2026): the hosts, then each confederation's places.
  const slots: [string, number][] = [['UEFA', 16], ['CAF', 9], ['AFC', 8], ['CONMEBOL', 6], ['CONCACAF', 6], ['OFC', 1]];
  const auto = y === 2030 ? ['ESP', 'POR', 'MAR', 'ARG', 'URU', 'PAR'] : hosts;
  let teams = [...auto];
  for (const [confed, n] of slots) {
    const q = qualifyingOrder(state, confed, /World Cup/);
    const have = teams.filter((t) => CONFED[t] === confed);
    for (const t of q.order) { if (have.length >= n) break; if (!teams.includes(t)) { teams.push(t); have.push(t); } }
  }
  // Two intercontinental play-off places: the best-rated of the rest outside Europe.
  const rest = Object.keys(state.intl.elo).filter((n) => !teams.includes(n) && CONFED[n] !== 'UEFA' && CONFED[n]).sort((a, b) => elo(state, b) - elo(state, a));
  teams = take(rest, 48, teams);
  return { teams, how: 'The hosts, and each confederation\'s places from its World Cup qualifying (or its ratings, where the game plays none), plus two play-off places.' };
}

/** Draw the groups: hosts head the first groups, then pots by rating; at a World Cup, no two teams from one confederation together (two from Europe at most). */
function drawGroups(state: GameState, rng: Rng, kind: TourKind, teams: string[], hosts: string[], count: number): string[][] {
  const seeded = [...hosts.filter((h) => teams.includes(h)), ...teams.filter((t) => !hosts.includes(t)).sort((a, b) => elo(state, b) - elo(state, a))];
  const ok = (g: string[], t: string) => kind !== 'WC' || (CONFED[t] === 'UEFA' ? g.filter((x) => CONFED[x] === 'UEFA').length < 2 : !g.some((x) => CONFED[x] === CONFED[t]));
  for (let attempt = 0; attempt < 60; attempt++) {
    const groups: string[][] = Array.from({ length: count }, () => []);
    let fail = false;
    for (let p = 0; p * count < seeded.length; p++) {
      const pot = p === 0 ? seeded.slice(0, count) : rng.shuffle(seeded.slice(p * count, p * count + count));
      const order = p === 0 ? groups.map((_, i) => i) : rng.shuffle(groups.map((_, i) => i));
      for (const t of pot) {
        const gi = order.find((i) => groups[i].length === p && (attempt > 40 || ok(groups[i], t)));
        if (gi === undefined) { fail = true; break; }
        groups[gi].push(t);
      }
      if (fail) break;
    }
    if (!fail) return groups;
  }
  // Last resort: pots without restrictions.
  const groups: string[][] = Array.from({ length: count }, () => []);
  seeded.forEach((t, i) => groups[i % count].push(t));
  return groups;
}

/** Decide next summer's tournaments (from the qualifying just finished). */
export function planTournaments(state: GameState, rng: Rng, y: number): void {
  const I = state.intl;
  I.planned = tournamentsIn(y).map((kind) => {
    const { where, hosts } = hostsOf(kind, y);
    const [n, count, thirds] = SIZE[kind];
    let groups: string[][];
    let how: string;
    if (kind === 'WC' && y === 2026) {
      groups = WC2026_GROUPS;
      how = 'The real 2026 draw, with the six play-off winners (Bosnia and Herzegovina, Sweden, Turkey, Czechia, DR Congo and Iraq).';
    } else {
      const f = field(state, kind, y, hosts);
      groups = drawGroups(state, rng, kind, f.teams.slice(0, n), hosts, count);
      how = f.how;
    }
    const letters = 'ABCDEFGHIJKL';
    const t: Tournament = {
      id: `${kind}${y}`, kind, year: y, name: `${NAMES[kind]} ${y}`, where, hosts,
      groups: groups.map((g, i) => ({ name: letters[i], teams: g })), thirds,
      final: sday(y, PLANS[kind].ko[PLANS[kind].ko.length - 1][1], PLANS[kind].ko[PLANS[kind].ko.length - 1][2]),
      field: how, told: [],
    };
    return t;
  });
}

/* ───────────────────────── The schedule ───────────────────────── */

const RR: [number, number][][] = [[[0, 1], [2, 3]], [[0, 2], [3, 1]], [[3, 0], [1, 2]]];

/** The matches a tournament's own random numbers decide (kept apart from the season's, so the club game is unchanged). */
export function matchRng(state: GameState, m: IntlMatch): Rng {
  return new Rng(hashString(`tour:${state.seed}:${m.comp}:${m.id}:${m.home}:${m.away}`));
}

/** Put this summer's tournaments on the calendar, call up the squads and play anything before today. */
export function startTournaments(state: GameState): void {
  const I = state.intl;
  const y = state.season;
  const planned = (I.planned ?? []).filter((t) => t.year === y);
  I.planned = (I.planned ?? []).filter((t) => t.year !== y);
  I.tournaments ??= [];
  for (const t of planned) {
    if (I.tournaments.some((x) => x.id === t.id)) continue;
    I.tournaments.push(t);
    const plan = PLANS[t.kind];
    const G = t.groups.length;
    plan.md.forEach(([mo, d, span], k) => {
      t.groups.forEach((g, gi) => {
        const day = sday(y, mo, d) + Math.floor((gi * span) / G);
        for (const [a, b] of RR[k]) {
          const [home, away] = t.hosts.includes(g.teams[b]) && !t.hosts.includes(g.teams[a]) ? [g.teams[b], g.teams[a]] : [g.teams[a], g.teams[b]];
          addIntlMatch(state, { day, home, away, comp: t.id, group: g.name, neutral: !t.hosts.includes(home) });
        }
      });
    });
    callUp(state, t);
  }
  if (planned.length) academyCover(state, planned);
  // Games played before the career began (the 2026 World Cup started on 11 June): results only.
  // (today's too: the calendar moves on from tomorrow).
  const before = I.matches.filter((m) => !m.result && m.day <= state.day && planned.some((t) => t.id === m.comp)).sort((a, b) => a.day - b.day);
  for (const m of before) playIntl(state, matchRng(state, m), m, { summer: true });
  for (const t of planned) progress(state, t, true);
}

/** The squads join up and leave their clubs until their country goes out. */
function callUp(state: GameState, t: Tournament): void {
  const I = state.intl;
  for (const g of t.groups) for (const n of g.teams) {
    const squad = pickSquad(state, n);
    if (!squad.length) continue;
    I.squads[n] = squad.map((p) => p.id);
    for (const p of squad) if (!p.injury && p.clubId !== null) p.away = { nation: n, until: t.final + HOLIDAY_DAYS, what: `the ${t.name}` };
  }
}

/** Enough players for a full matchday squad: eleven and nine substitutes, with a keeper. */
const COVER = 20;
/** At most this many academy players per club (they don't count towards the squad limit). */
const MAX_COVER = 14;

/** The day the academy players go back: the day after the last internationals are due back from holiday. */
export function coverEnds(ts: Tournament[]): number {
  return Math.max(...ts.map((t) => t.final)) + HOLIDAY_DAYS + 1;
}

/**
 * With half the squad away at a tournament, clubs call up academy players to make up the numbers for
 * pre-season, as real clubs do. They train with the first team until the internationals are back, then
 * return to the academy, unless the manager decides to keep them. They don't count towards the squad limit.
 */
function academyCover(state: GameState, ts: Tournament[]): void {
  const rng = new Rng(hashString(`academy:${state.seed}:${state.season}`));
  const nation = (c: Club) => state.comps.find((k) => k.id === c.leagueId)?.nation ?? 'ENG';
  const until = coverEnds(ts);
  for (const c of state.clubs) {
    if (c.external) continue;
    const squad = () => c.playerIds.map((id) => state.players[id]).filter((p) => p && available(p));
    const added: number[] = [];
    const add = (pos: Pos) => {
      const age = rng.int(17, 19);
      const ca = clamp(Math.round(48 + c.reputation * 4.5 + rng.normal() * 8), 30, 115);
      const pa = clamp(rollPotential(rng, ca, age) + Math.round(c.reputation * 1.5), ca, 195);
      let p = createPlayer(rng, state, { pos, ca, pa, age, clubId: c.id, nation: nation(c) });
      // No two academy players with the same surname at one club (the name lists are short).
      for (let tries = 0; tries < 6 && c.playerIds.some((id) => state.players[id].lastName === p.lastName); tries++) {
        p = createPlayer(rng, state, { pos, ca, pa, age, clubId: c.id, nation: nation(c) });
      }
      state.players[p.id] = p;
      c.playerIds.push(p.id);
      initContract(rng, p, state.season, c.leagueId);
      giveContract(state, p, c, rng.int(2, 3));
      p.cover = { club: c.id, until };
      p.sharp = holidaySharp(rng, p); // back from their own summer break, like everyone else
      added.push(p.id);
    };
    if (!squad().some((p) => (p.pos.GK ?? 0) >= 15)) add('GK');
    const outfield: Pos[] = ['DC', 'DC', 'DR', 'DL', 'MC', 'DM', 'MC', 'AMR', 'AML', 'ST'];
    let k = 0;
    while (squad().length < COVER && added.length < MAX_COVER) add(outfield[k++ % outfield.length]);
    if (added.length) {
      // Academy numbers: the first free ones from 40 up.
      const taken = new Set(c.playerIds.map((id) => state.players[id].squadNo));
      let n = 40;
      for (const id of added) { while (taken.has(n)) n++; state.players[id].squadNo = n; taken.add(n); }
      for (const t of ts) { t.academy ??= {}; t.academy[c.id] = added; break; }
    }
  }
}

/** A country is out: its players have three weeks off, then report back to their clubs. */
function sendHome(state: GameState, t: Tournament, nations: string[], day: number): Player[] {
  const back: Player[] = [];
  for (const n of nations) for (const id of state.intl.squads[n] ?? []) {
    const p = state.players[id];
    if (p?.away?.nation === n && p.away.what === `the ${t.name}`) {
      p.away.until = Math.max(state.day + 1, day + HOLIDAY_DAYS);
      p.away.what = `holiday after the ${t.name}`;
      back.push(p);
    }
  }
  return back;
}

/** Seeds for the first knockout round from the group tables, and the teams that go out. */
function qualifiers(state: GameState, t: Tournament): { seeds: { n: string; g: string }[]; out: string[] } {
  const tables = t.groups.map((g) => ({ g: g.name, rows: intlTable(state, t.id, g.name, g.teams) }));
  const by = (a: { r: { pts: number; gf: number; ga: number; nation: string } }, b: typeof a) => b.r.pts - a.r.pts || (b.r.gf - b.r.ga) - (a.r.gf - a.r.ga) || b.r.gf - a.r.gf || elo(state, b.r.nation) - elo(state, a.r.nation);
  const pos = (i: number) => tables.map((x) => ({ r: x.rows[i], g: x.g })).sort(by);
  const thirds = pos(2);
  const seeds = [...pos(0), ...pos(1), ...thirds.slice(0, t.thirds)].map((x) => ({ n: x.r.nation, g: x.g }));
  const out = [...tables.map((x) => x.rows[3].nation), ...thirds.slice(t.thirds).map((x) => x.r.nation)];
  return { seeds, out };
}

/** Standard bracket order for n first-round ties, so the top seeds meet as late as possible. */
function bracket(n: number): number[] {
  let order = [0];
  while (order.length < n) order = order.flatMap((i) => [i, order.length * 2 - 1 - i]);
  return order;
}

// Hosts play their group games at home; the knockouts are on neutral ground (as the 2026 venues mostly are).
const matchesOf = (state: GameState, t: Tournament, stage?: string) => state.intl.matches.filter((m) => m.comp === t.id && (stage === undefined ? true : stage === '' ? !m.ko : m.stage === stage));

/** After each day's games: the next round, the knockouts, the news and, after the final, the awards. */
export function progress(state: GameState, t: Tournament, quiet = false): void {
  const plan = PLANS[t.kind];
  const y = t.year;
  const groupGames = matchesOf(state, t, '');
  const first = plan.ko[0][0];
  // The group stage is over: the first knockout round.
  if (groupGames.length && groupGames.every((m) => m.result) && !matchesOf(state, t, first).length) {
    const { seeds, out } = qualifiers(state, t);
    const n = seeds.length / 2;
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) pairs.push([i, seeds.length - 1 - i]);
    // No rematches of a group game in the first knockout round, where it can be helped.
    for (let i = 0; i < pairs.length; i++) {
      if (seeds[pairs[i][0]].g !== seeds[pairs[i][1]].g) continue;
      const j = pairs.findIndex((p, k) => k !== i && seeds[p[1]].g !== seeds[pairs[i][0]].g && seeds[pairs[i][1]].g !== seeds[p[0]].g);
      if (j >= 0) [pairs[i][1], pairs[j][1]] = [pairs[j][1], pairs[i][1]];
    }
    const order = bracket(n);
    const [, mo, d, span] = plan.ko[0];
    order.forEach((pi, k) => {
      const [a, b] = pairs[pi];
      const home = seeds[a].n;
      addIntlMatch(state, { day: sday(y, mo, d) + Math.floor((k * span) / n), home, away: seeds[b].n, comp: t.id, stage: first, tie: `${t.id}-0-${k}`, ko: true, neutral: true });
    });
    const home = sendHome(state, t, out, groupGames.reduce((x, m) => Math.max(x, m.day), -999));
    if (!quiet) groupNews(state, t, seeds.map((s) => s.n), out, home);
  }
  // Knockout rounds.
  for (let r = 1; r < plan.ko.length; r++) {
    const prev = matchesOf(state, t, plan.ko[r - 1][0]).sort((a, b) => (a.tie ?? '').localeCompare(b.tie ?? '', 'en', { numeric: true }));
    const [stage, mo, d, span] = plan.ko[r];
    if (!prev.length || !prev.every((m) => m.result) || matchesOf(state, t, stage).length) continue;
    const winners = prev.map((m) => koWinner(state.intl, m)!);
    const losers = prev.map((m) => (koWinner(state.intl, m) === m.home ? m.away : m.home));
    const n = winners.length / 2;
    for (let k = 0; k < n; k++) {
      const home = winners[2 * k];
      addIntlMatch(state, { day: sday(y, mo, d) + Math.floor((k * span) / Math.max(1, n)), home, away: winners[2 * k + 1], comp: t.id, stage, tie: `${t.id}-${r}-${k}`, ko: true, neutral: true });
    }
    if (stage === 'Final' && plan.third) {
      // Semi-final losers stay on for the third-place match.
      addIntlMatch(state, { day: sday(y, plan.third[0], plan.third[1]), home: losers[0], away: losers[1], comp: t.id, stage: 'Third place', tie: `${t.id}-3rd`, ko: true, neutral: true });
    } else {
      sendHome(state, t, losers, prev.reduce((x, m) => Math.max(x, m.day), -999));
    }
    if (!quiet && (stage === 'Semi-finals' || stage === 'Final')) stageNews(state, t, stage);
  }
  // The third-place match.
  const third = matchesOf(state, t, 'Third place')[0];
  if (third?.result && !t.told.includes('third')) {
    t.told.push('third');
    sendHome(state, t, [third.home, third.away], third.day);
  }
  // The final.
  const fin = matchesOf(state, t, 'Final')[0];
  if (fin?.result && !t.winner) {
    const w = koWinner(state.intl, fin)!;
    t.winner = w;
    t.runnerUp = w === fin.home ? fin.away : fin.home;
    const r = fin.result;
    t.finalScore = `${nationName(fin.home)} ${r.hg}-${r.ag} ${nationName(fin.away)}${r.pens ? ` (${r.pens[0]}-${r.pens[1]} on penalties)` : r.aet ? ' (after extra time)' : ''}`;
    sendHome(state, t, [fin.home, fin.away], fin.day);
    awards(state, t);
    recordWinner(state, t.id, w, quiet ? undefined : winnerNews(state, t));
  }
}

/* ───────────────────────── Awards ───────────────────────── */

/** Player of the tournament and young player of the tournament (21 or under), from the players in the game. */
function awards(state: GameState, t: Tournament): void {
  const games = matchesOf(state, t).filter((m) => m.result);
  const apps = new Map<number, number>();
  const goals = new Map<number, number>();
  for (const m of games) {
    for (const id of m.result!.played ?? []) apps.set(id, (apps.get(id) ?? 0) + 1);
    for (const [id] of m.result!.scorers) goals.set(id, (goals.get(id) ?? 0) + 1);
  }
  // How far each nation went.
  const reach = new Map<string, number>();
  const stages = ['', ...PLANS[t.kind].ko.map((k) => k[0])];
  for (const m of games) for (const n of [m.home, m.away]) {
    const idx = m.ko ? stages.indexOf(m.stage ?? '') : 0;
    reach.set(n, Math.max(reach.get(n) ?? 0, idx));
  }
  if (t.winner) reach.set(t.winner, stages.length);
  const last = stages.length;
  const score = (p: Player) => {
    const r = reach.get(p.nation) ?? 0;
    // The award usually goes to a star of one of the finalists.
    const stageBonus = r >= last ? 9 : r === last - 1 ? 6 : r === last - 2 ? 3 : r === last - 3 ? 1 : 0;
    return (goals.get(p.id) ?? 0) * 2 + (apps.get(p.id) ?? 0) * 0.6 + stageBonus + (p.ca - 150) / 4;
  };
  const cands = [...apps.keys()].map((id) => state.players[id]).filter((p): p is Player => !!p && !isExtPlayer(p));
  const pick = (list: Player[]): AwardPick | undefined => {
    const best = list.sort((a, b) => score(b) - score(a))[0];
    return best ? { id: best.id, name: `${best.firstName} ${best.lastName}`.trim(), nation: best.nation, clubId: best.clubId } : undefined;
  };
  t.player = pick([...cands]);
  t.young = pick(cands.filter((p) => p.age <= 21 && p.id !== t.player?.id));
  const honour = (id: number | undefined, what: string, fame: number) => {
    const p = id !== undefined ? state.players[id] : undefined;
    if (!p) return;
    p.honours = [...(p.honours ?? []), what];
    p.fame = (p.fame ?? 0) + fame;
    p.morale = Math.min(99, p.morale + 8);
  };
  honour(t.player?.id, `Player of the ${t.name}`, 1.5);
  honour(t.young?.id, `Young player of the ${t.name}`, 0.8);
  if (t.winner) for (const id of state.intl.squads[t.winner] ?? []) if ((apps.get(id) ?? 0) > 0) honour(id, `${t.name} winner`, 0.5);
}

/* ───────────────────────── News ───────────────────────── */

const mineOf = (state: GameState) => new Set(state.clubs.find((c) => c.id === state.userClubId)?.playerIds ?? []);
const clubName = (state: GameState, id: number | null) => (id ? state.clubs.find((c) => c.id === id)?.name ?? '' : 'free agent');

/** The manager's players at a tournament, by nation. */
function ourPlayers(state: GameState, t: Tournament): Map<string, Player[]> {
  const mine = mineOf(state);
  const by = new Map<string, Player[]>();
  for (const g of t.groups) for (const n of g.teams) for (const id of state.intl.squads[n] ?? []) if (mine.has(id)) by.set(n, [...(by.get(n) ?? []), state.players[id]]);
  return by;
}

/** When a career starts during a tournament (the 2026 World Cup), or when this summer's start. */
export function tournamentWelcome(state: GameState): void {
  for (const t of state.intl.tournaments ?? []) {
    if (t.year !== state.season || t.winner || t.told.includes('welcome')) continue;
    t.told.push('welcome');
    const ours = ourPlayers(state, t);
    const groupOf = (n: string) => t.groups.find((g) => g.teams.includes(n))?.name;
    const list = [...ours].map(([n, ps]) => `${ps.map((p) => p.lastName).join(', ')} (${nationName(n)}, group ${groupOf(n)})`).join('; ');
    const started = state.intl.matches.some((m) => m.comp === t.id && m.result);
    addNews(state, {
      kind: 'headline',
      title: `The ${t.name} ${started ? 'is under way' : 'starts soon'}`,
      body: `The ${t.name} is being played in ${t.where}${started ? '' : `, from ${dayLabel(state.season, Math.min(...state.intl.matches.filter((m) => m.comp === t.id).map((m) => m.day)))}`}; the final is on ${dayLabel(state.season, t.final)}. ${ours.size ? `Your players there: ${list}. They stay with their countries until they are knocked out, then have three weeks off, so a long run means missing part of pre-season.` : 'None of your players are there.'}${academyNote(state)}`,
      players: [...ours.values()].flat().map((p) => ({ id: p.id, note: nationName(p.away?.nation ?? p.nation) })),
      link: { label: 'Internationals', screen: 'intl', tab: 'tables' },
    });
  }
}

/** The manager's academy players promoted to cover for the summer's absentees. */
function academyNote(state: GameState): string {
  const ids = (state.intl.tournaments ?? []).filter((t) => t.year === state.season).flatMap((t) => t.academy?.[state.userClubId] ?? []);
  const names = ids.map((id) => state.players[id]).filter((p) => p?.clubId === state.userClubId).map((p) => `${p.firstName} ${p.lastName}`.trim());
  const until = ids.map((id) => state.players[id]?.cover?.until).find((d) => d !== undefined);
  return names.length ? ` With so many away, ${names.length} academy player${names.length > 1 ? 's have' : ' has'} joined the first-team squad to make up the numbers for pre-season: ${names.join(', ')}. They don't count towards your squad limit and go back to the academy${until !== undefined ? ` on ${dayLabel(state.season, until)}` : ' when the internationals return'}, unless you keep them (from the player's profile).` : '';
}

function groupNews(state: GameState, t: Tournament, through: string[], out: string[], home: Player[]): void {
  const mine = mineOf(state);
  const ours = ourPlayers(state, t);
  const lines: string[] = [];
  for (const [n, ps] of ours) lines.push(`${nationName(n)} (${ps.map((p) => p.lastName).join(', ')}) ${through.includes(n) ? 'are through' : 'are out'}`);
  const back = home.filter((p) => mine.has(p.id));
  addNews(state, {
    kind: 'headline',
    title: `${t.name}: the group stage is over`,
    body: `${through.length} teams go through to the knockouts${out.length ? `; ${out.map(nationName).slice(0, 8).join(', ')}${out.length > 8 ? ' and others' : ''} go home` : ''}.${lines.length ? ` ${lines.join('. ')}.` : ''}${back.length ? ` ${back.map((p) => p.lastName).join(', ')} ${back.length > 1 ? 'are' : 'is'} on holiday and back at the club on ${dayLabel(state.season, back[0].away!.until)}.` : ''}`,
    link: { label: 'Internationals', screen: 'intl', tab: 'tables' },
  });
}

function stageNews(state: GameState, t: Tournament, stage: string): void {
  if (t.told.includes(stage)) return;
  t.told.push(stage);
  const ms = matchesOf(state, t, stage).sort((a, b) => a.day - b.day);
  const ours = ourPlayers(state, t);
  const ourNames = (n: string) => (ours.get(n)?.length ? ` (${ours.get(n)!.map((p) => p.lastName).join(', ')})` : '');
  const ties = ms.map((m) => `${nationName(m.home)}${ourNames(m.home)} v ${nationName(m.away)}${ourNames(m.away)} on ${dayLabel(state.season, m.day)}`);
  addNews(state, {
    kind: 'headline',
    title: stage === 'Final' ? `${t.name} final: ${nationName(ms[0].home)} v ${nationName(ms[0].away)}` : `${t.name} semi-finals`,
    body: stage === 'Final' ? `${ties[0]}.` : `The semi-finals: ${ties.join('; ')}.`,
    link: { label: 'Internationals', screen: 'intl', tab: 'tables' },
  });
}

function winnerNews(state: GameState, t: Tournament): { title: string; body: string; players: { id: number; note: string }[] } {
  const mine = mineOf(state);
  const ours = (state.intl.squads[t.winner!] ?? []).filter((id) => mine.has(id)).map((id) => state.players[id].lastName);
  const award = (a: AwardPick | undefined, what: string) => (a ? `${what}: ${a.name} (${nationName(a.nation)}, ${clubName(state, a.clubId)}).` : '');
  return {
    title: `${nationName(t.winner!)} win the ${t.name}`,
    body: `${t.finalScore}. ${nationName(t.winner!)} are the ${t.name} winners.${ours.length ? ` Congratulations to ${ours.join(', ')} from your squad.` : ''} ${award(t.player, 'Player of the tournament')} ${award(t.young, 'Young player of the tournament')}`.trim(),
    players: [t.player, t.young].filter((a): a is AwardPick => !!a).map((a, i) => ({ id: a.id, note: i === 0 && a === t.player ? 'Player of the tournament' : 'Young player of the tournament' })),
  };
}

/** Today's tournament games are played with the other internationals; this moves each tournament on. */
export function tournamentsDay(state: GameState): void {
  for (const t of state.intl.tournaments ?? []) if (t.year === state.season && !t.winner) progress(state, t);
}

/** Keep an academy player in the first-team squad for good (he then counts towards the squad limit). */
export function keepCover(state: GameState, p: Player): void {
  delete p.cover;
  addNews(state, { kind: 'squad', title: `${`${p.firstName} ${p.lastName}`.trim()} stays with the first team`, body: `${`${p.firstName} ${p.lastName}`.trim()} has impressed and will stay in the first-team squad rather than return to the academy. He now counts towards your squad limit.` });
}

/** Every day: academy players whose cover is over go back, unless kept. */
export function coverDay(state: GameState): void {
  const back: Player[] = [];
  for (const p of Object.values(state.players)) {
    if (!p.cover || p.cover.until > state.day) continue;
    const c = p.clubId === p.cover.club && !p.loan ? state.clubs[p.clubId - 1] : null;
    delete p.cover;
    if (!c) continue; // sold or loaned out: he stays wherever he is now
    if (c.id === state.userClubId) back.push(p);
    c.playerIds = c.playerIds.filter((id) => id !== p.id);
    if (c.lineup?.includes(p.id)) c.lineup = null;
    if (c.bench) c.bench = c.bench.filter((id) => id !== p.id);
    delete state.players[p.id];
  }
  if (back.length) {
    addNews(state, {
      kind: 'squad',
      title: 'Academy players return to the youth teams',
      body: `With the internationals back, ${back.map((p) => `${p.firstName} ${p.lastName}`.trim()).join(', ')} ${back.length > 1 ? 'have' : 'has'} gone back to the academy. Thanks to them for their help in pre-season.`,
    });
  }
}

/** Next summer's participants are kept out of the June window (they're preparing for the tournament). */
export function clearJuneForTournaments(state: GameState, from: number, to: number): void {
  const busy = new Set((state.intl.planned ?? []).flatMap((t) => t.groups.flatMap((g) => g.teams)));
  if (!busy.size) return;
  state.intl.matches = state.intl.matches.filter((m) => m.result || m.day < from || m.day > to || !(busy.has(m.home) || busy.has(m.away)));
}
