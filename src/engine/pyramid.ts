/**
 * The pyramids below the top flights: England's Championship, League One and League Two (24 clubs
 * each) and the second divisions of Spain, Germany, Italy, France and Portugal. Real club names,
 * real squads in the second tiers and the EFL (generated ones below), play-offs, promotion and relegation.
 *
 * England, every summer:
 *   Premier League   3 down  <->  3 up   Championship (top two, then the play-off winner)
 *   Championship     3 down  <->  3 up   League One
 *   League One       4 down  <->  4 up   League Two (top three, then the play-off winner)
 *   League Two       2 down  ->   the National League, whose two best clubs come up
 * The other countries have two levels (see levels.ts for the numbers).
 *
 * The division below each pyramid isn't played. It's a pool of 24 clubs (`state.pools`) and its
 * promotion race is a weighted draw. A club relegated out of the last played division hands its
 * place (its club id, so every reference in the game stays valid) to the club that comes up: the
 * name, colours, ground and squad change, and the old club joins the pool.
 */
import { assignSquadNumbers, aiTactics, createFromDb, createPlayer, fillSquad, rollPotential } from './generate.js';
import { SEASON } from './db/index.js';
import { EFL_SQUADS } from './db/efl-2026.js';
import { SECOND_TIER_SQUADS } from './db/second-tiers-2026.js';
import { initClubFinance, initContract, parachuteFor, repriceForLeague } from './finance.js';
import { LEVELS, level, pyramidOf, PYRAMIDS, tierOf, type LevelSpec } from './levels.js';
import { hashString } from './attributes.js';
import { LOWER } from './db/cups-2026.js';
import { seasonDay } from './calendar.js';
import { newTie, makeTieFixtures } from './cups.js';
import { clamp, Rng } from './rng.js';
import { leagueTable } from './league.js';
import { makeFreeAgent } from './transfers.js';
import type { Club, Competition, Cup, Fixture, GameState, Movement, NonLeagueClub, Pos } from './types.js';
import type { ExtRow } from './db/cups-2026.js';

export * from './levels.js';

/* ───────────────────────── Squads ───────────────────────── */

/** Where each level's first team sits on the ability scale (a Premier League bottom side is about 127). */
export function levelCA(rep: number, leagueId = 'EN3'): number {
  return 67 + rep * 11.5 + (LEVEL_BOOST[leagueId] ?? 0);
}
/** The second tier's best sides are close to the bottom of the top flight, so their scale sits a little higher. */
const LEVEL_BOOST: Record<string, number> = { EN2: 8, EN3: 4, EN4: 2, ES2: 10, DE2: 10, IT2: 14, FR2: 10, PT2: 13 };

const SHAPE25: Pos[] = [
  'GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MC', 'MC', 'MR', 'ML', 'ST',
  'GK', 'DC', 'DR', 'DL', 'MC', 'AMC', 'AMR', 'AML', 'ST', 'ST', 'DC', 'DM', 'MC', 'GK',
];
const FORMATIONS = ['4-4-2', '4-4-2', '4-2-3-1', '4-3-3', '4-5-1', '3-5-2', '5-3-2', '4-1-4-1'];

/** Give a club a squad of 25 generated players at its reputation's level, with contracts and wages. */
export function generateSquad(state: GameState, rng: Rng, c: Club, maxAge = 34): void {
  const base = levelCA(c.reputation, c.leagueId) - 3;
  const py = pyramidOf(level(c.leagueId)?.country ?? 'ENG')!;
  SHAPE25.forEach((pos, i) => {
    const nation = rng.chance(0.76) ? py.nation : rng.pick(py.imports);
    const young = i >= 16 && rng.chance(0.4);
    const age = young ? rng.int(17, 21) : Math.min(maxAge, rng.int(21, 34));
    const depth = i >= 11 ? -8 - (i >= 18 ? 4 : 0) : 0;
    const ca = clamp(Math.round(base + depth + rng.normal() * 6.5 - (age <= 20 ? 6 : 0)), 35, 150);
    const p = createPlayer(rng, state, { pos, ca, pa: rollPotential(rng, ca, age), age, clubId: c.id, nation, exactNation: true });
    state.players[p.id] = p;
    c.playerIds.push(p.id);
  });
  assignSquadNumbers(c, state.players);
}

/**
 * A club's real squad from the database (the EFL and the other countries' second tiers), topped up with
 * generated players. A player the top flights already list (a loan the source has caught up
 * with) moves to the club he's playing for.
 */
function realSquad(state: GameState, rng: Rng, c: Club): boolean {
  const rows = EFL_SQUADS[c.name] ?? SECOND_TIER_SQUADS[c.name];
  // The lists are this season's: a pyramid added to an older career at a later rollover is generated.
  if (!rows?.length || state.season !== SEASON) return false;
  const robbed = new Set<Club>();
  const known = new Map<string, number>();
  for (const p of Object.values(state.players)) known.set(`${p.firstName} ${p.lastName}`.trim().toLowerCase() + ':' + p.age, p.id);
  for (const row of rows) {
    const p0 = createFromDb(state, row, c.id, SEASON);
    const key = `${p0.firstName} ${p0.lastName}`.trim().toLowerCase() + ':' + p0.age;
    const existing = known.get(key);
    // Only the same man: he plays the listed position and isn't far above the level he's listed at
    // (a namesake of the same age at a top club stays where he is).
    const main = (Object.entries(p0.pos) as [string, number][]).reduce((a, b) => (b[1] > a[1] ? b : a))[0] as keyof typeof p0.pos;
    const same = existing !== undefined && (state.players[existing].pos[main] ?? 0) >= 15 && state.players[existing].ca <= p0.ca + 35;
    if (existing !== undefined && same) {
      state.nextPlayerId--;
      const p = state.players[existing];
      const old = state.clubs.find((x) => x.id === p.clubId);
      if (old) {
        old.playerIds = old.playerIds.filter((id) => id !== p.id);
        robbed.add(old);
      }
      p.clubId = c.id;
      c.playerIds.push(p.id);
      continue;
    }
    state.players[p0.id] = p0;
    c.playerIds.push(p0.id);
  }
  fillSquad(rng, state, c, pyramidOf(level(c.leagueId)?.country ?? 'ENG')!.nation);
  assignSquadNumbers(c, state.players);
  // A club that lost a player to his newer listing here is topped up again if that leaves it short.
  for (const o of robbed) {
    if (o === c) continue;
    const nation = state.comps.find((k) => k.id === o.leagueId)?.nation ?? 'ENG';
    if (fillSquad(rng, state, o, nation).length) assignSquadNumbers(o, state.players);
  }
  return true;
}

function newClub(state: GameState, rng: Rng, row: ExtRow | NonLeagueClub, leagueId: string, rep: number): Club {
  const [name, short, colours, stadium, capacity] = Array.isArray(row) ? [row[0], row[1], row[4], row[5], row[6]] : [row.name, row.short, row.colours, row.stadium, row.capacity];
  const r = new Rng(hashString(`club:${name}`));
  const c: Club = {
    id: state.clubs.length + 1, name, short, colours, reputation: rep, stadium, capacity, leagueId, playerIds: [],
    tactics: aiTactics(r, r.pick(FORMATIONS), rep), lineup: null, bench: null, finance: undefined as unknown as Club['finance'],
  };
  if (!realSquad(state, rng, c)) generateSquad(state, rng, c);
  return c;
}

/** How many clubs each country's unplayed division below the pyramid keeps. */
const POOL_SIZE = 24;

/** The clubs of a country's unplayed division below its pyramid, before anyone has been relegated into it. */
export function initialPool(country: string): NonLeagueClub[] {
  const py = pyramidOf(country)!;
  const played = new Set(py.levels.map((l) => l.division).filter(Boolean));
  const taken = new Set(py.levels.flatMap((l) => l.exclude ?? []));
  return (LOWER[country] ?? [])
    .filter((r) => !played.has(r[2]) && !taken.has(r[0]) && !/ B$/.test(r[0]) && !/ II$/.test(r[0]))
    .sort((a, b) => b[3] - a[3])
    .slice(0, POOL_SIZE)
    .map((r) => ({ name: r[0], short: r[1], colours: r[4], stadium: r[5], capacity: r[6], rep: r[3] }));
}

/** The clubs a division plays: the database's list for it, topped up from the pool when it lists too few. */
function divisionRows(spec: LevelSpec, pool: NonLeagueClub[]): (ExtRow | NonLeagueClub)[] {
  const rows: (ExtRow | NonLeagueClub)[] = (LOWER[spec.country] ?? []).filter((r) => r[2] === spec.division && !(spec.exclude ?? []).includes(r[0]));
  while (spec.size && rows.length < spec.size && pool.length) {
    const best = pool.reduce((a, b) => (b.rep > a.rep ? b : a));
    pool.splice(pool.indexOf(best), 1);
    rows.push(best);
  }
  return spec.size ? rows.slice(0, spec.size) : rows;
}

/** True once the country has its lower divisions (saves from before them get them at the next rollover). */
export const hasPyramid = (state: GameState, country = 'ENG'): boolean => {
  const py = pyramidOf(country);
  return !py || py.levels.slice(1).every((l) => state.comps.some((c) => c.id === l.id));
};

/**
 * Build the lower divisions of every country that doesn't have them yet: clubs, squads, contracts
 * and money. Each country uses its own random stream, so the rest of the world is the same as it
 * was before (and England's clubs are the same as when it was the only pyramid).
 */
export function buildPyramid(state: GameState, seed: number): void {
  state.pools ??= {};
  state.movements ??= [];
  for (const py of PYRAMIDS) {
    if (hasPyramid(state, py.country)) continue;
    const rng = new Rng(py.country === 'ENG' ? seed ^ 0x9e3779b1 : seed ^ hashString(`pyramid:${py.country}`));
    const fresh: Club[] = [];
    const pool = initialPool(py.country);
    for (const spec of py.levels.slice(1)) {
      const comp: Competition = { id: spec.id, name: spec.name, kind: 'league', country: py.country, nation: py.nation, clubIds: [], tier: spec.tier };
      for (const row of divisionRows(spec, pool)) {
        const c = newClub(state, rng, row, spec.id, Array.isArray(row) ? row[3] : row.rep);
        state.clubs.push(c);
        fresh.push(c);
        comp.clubIds.push(c.id);
      }
      state.comps.push(comp);
    }
    const top = state.comps.find((c) => c.id === py.levels[0].id);
    if (top) top.tier = 1;
    for (const c of fresh) {
      for (const id of c.playerIds) initContract(rng, state.players[id], state.season, c.leagueId);
      initClubFinance(rng, state, c);
    }
    state.pools[py.country] = pool;
  }
}

/* ───────────────────────── Play-offs ───────────────────────── */

const PO_DATES: Record<string, { semi: [string, string]; final: string; venue: string }> = {
  EN2: { semi: ['2027-05-08', '2027-05-11'], final: '2027-05-31', venue: 'Wembley Stadium' },
  EN3: { semi: ['2027-05-15', '2027-05-18'], final: '2027-05-30', venue: 'Wembley Stadium' },
  EN4: { semi: ['2027-05-15', '2027-05-18'], final: '2027-05-29', venue: 'Wembley Stadium' },
  ES2: { semi: ['2027-05-19', '2027-05-22'], final: '2027-05-29', venue: 'Estadio de La Cartuja' },
  IT2: { semi: ['2027-05-15', '2027-05-19'], final: '2027-05-26', venue: 'Stadio Olimpico' },
};

/** Goals come a little more often below the top flight (the lower the division, the scrappier the finishing and the goalkeeping). */
export const GOAL_FACTOR: Record<string, number> = { EN2: 1.04, EN3: 1.05, EN4: 1.05, ES2: 1.04, DE2: 1.04, IT2: 1.04, FR2: 1.04, PT2: 1.04 };

/** Match settings for a fixture in the English Football League (no VAR), or for another country's second tier (VAR, but a livelier game). */
export function eflOptions(comp: string): { noVar?: true; goals: number } | null {
  const base = comp.endsWith('PO') ? comp.slice(0, 3) : comp;
  if (!GOAL_FACTOR[base]) return null;
  return level(base)?.country === 'ENG' ? { noVar: true, goals: GOAL_FACTOR[base] } : { goals: GOAL_FACTOR[base] };
}

export const playoffId = (compId: string): string => `${compId}PO`;

/**
 * Once a division's last league game is played, draw its play-offs: two-legged semi-finals
 * (the higher place has the second leg at home), then a one-off final.
 * Returns the fixtures created (the caller looks for clashes and tells the manager).
 */
export function startPlayoffs(state: GameState): { cup: Cup; fixtures: Fixture[] }[] {
  const out: { cup: Cup; fixtures: Fixture[] }[] = [];
  for (const spec of LEVELS) {
    if (!spec.playoff || !PO_DATES[spec.id] || state.cups.some((c) => c.id === playoffId(spec.id))) continue;
    const league = state.fixtures.filter((f) => f.comp === spec.id);
    if (!league.length || league.some((f) => !f.result)) continue;
    const table = leagueTable(state, spec.id).map((r) => r.clubId);
    const [a, b] = spec.playoff;
    const seeds = table.slice(a - 1, b); // best first: 3rd, 4th, 5th, 6th
    const d = PO_DATES[spec.id];
    const cup: Cup = {
      id: playoffId(spec.id), name: `${spec.name} play-offs`, short: `${spec.short} play-offs`, kind: 'cup', country: spec.country, rounds: [], ties: [], drawn: 2, winnerId: null,
      winnerPrize: 0, runnerUpPrize: 0,
    };
    cup.rounds.push({ name: 'Semi-finals', days: d.semi.map((x) => seasonDay(x, state.season)), time: '20:00/20:00', extraTime: true, entrants: seeds, host: 'fixed', prize: 0 });
    cup.rounds.push({ name: 'Final', days: [seasonDay(d.final, state.season)], time: '15:00', extraTime: true, entrants: [], host: 'neutral', venue: d.venue, prize: 0 });
    // First leg at the lower seed, so the higher seed hosts the second.
    const s1 = newTie(state, cup, 0, seeds[3], seeds[0]);
    const s2 = newTie(state, cup, 0, seeds[2], seeds[1]);
    const fin = newTie(state, cup, 1, null, null);
    fin.fromHome = s1.id;
    fin.fromAway = s2.id;
    state.cups.push(cup);
    const fixtures = [s1, s2].flatMap((t) => makeTieFixtures(state, cup, 0, t));
    out.push({ cup, fixtures });
  }
  return out;
}

/* ───────────────────────── The season's end ───────────────────────── */

/** Weighted draw without replacement. */
function draw<T>(rng: Rng, items: T[], weight: (x: T) => number): T {
  const w = items.map(weight);
  return items[rng.weighted(w)];
}

/** A quick finish order from strength alone, for divisions nobody has played (a save that pre-dates the pyramid). */
export function abstractTable(state: GameState, rng: Rng, ids: number[]): number[] {
  const score = new Map(ids.map((id) => [id, strengthOf(state, id) + rng.normal() * 0.9]));
  return [...ids].sort((a, b) => score.get(b)! - score.get(a)!);
}

function strengthOf(state: GameState, id: number): number {
  const c = state.clubs.find((x) => x.id === id)!;
  const top = c.playerIds.map((p) => state.players[p].ca).sort((x, y) => y - x).slice(0, 11);
  return (top.reduce((s, x) => s + x, 0) / Math.max(1, top.length)) / 12;
}

/** Winner of a division's play-offs: the cup's winner, or a draw from the play-off places if it wasn't played. */
function playoffWinner(state: GameState, rng: Rng, spec: LevelSpec, table: number[]): number {
  const cup = state.cups.find((c) => c.id === playoffId(spec.id));
  if (cup?.winnerId) return cup.winnerId;
  const [a, b] = spec.playoff!;
  return draw(rng, table.slice(a - 1, b), (id) => Math.exp(strengthOf(state, id) * 0.7));
}

/** Hand a club's place to another club (the National League side that came up), and send the old one to the pool. */
function swapIdentity(state: GameState, rng: Rng, slot: Club, incoming: NonLeagueClub): NonLeagueClub {
  const [lo, hi] = pyramidOf(level(slot.leagueId)!.country)!.entryRep;
  const leaving: NonLeagueClub = {
    name: slot.name, short: slot.short, colours: slot.colours, stadium: slot.stadium, capacity: slot.capacity,
    rep: clamp(Math.min(slot.reputation, hi - 0.5) * 0.7, 0.7, lo + 0.1),
  };
  // Loans in either direction end, and deals for the old club fall through.
  for (const p of Object.values(state.players)) if (p.loan?.parentId === slot.id) makeFreeAgent(state, p, false);
  for (const id of [...slot.playerIds]) makeFreeAgent(state, state.players[id], false);
  for (const o of state.offers) {
    if ((o.buyerId === slot.id || o.sellerId === slot.id) && ['pending', 'accepted', 'countered', 'terms'].includes(o.status)) o.status = 'withdrawn';
  }
  slot.name = incoming.name;
  slot.short = incoming.short;
  slot.colours = incoming.colours;
  slot.stadium = incoming.stadium;
  slot.capacity = incoming.capacity;
  slot.reputation = clamp(incoming.rep + 0.5, lo, hi);
  slot.honours = [];
  slot.lineup = null;
  slot.bench = null;
  slot.runs = undefined;
  slot.playerIds = [];
  const r = new Rng(hashString(`club:${slot.name}`));
  slot.tactics = aiTactics(r, r.pick(FORMATIONS), slot.reputation);
  generateSquad(state, rng, slot, 31);
  for (const id of slot.playerIds) initContract(rng, state.players[id], state.season + 1, slot.leagueId);
  initClubFinance(rng, state, slot);
  slot.finance.balance = Math.round(slot.finance.balance * 0.6);
  return leaving;
}

/**
 * A club goes out of business (a what-if scenario). Its players are released and a club from the
 * pool below the pyramid takes its place in the division, so every league keeps its size.
 */
export function liquidateClub(state: GameState, rng: Rng, name: string): void {
  const slot = state.clubs.find((c) => c.name === name && tierOf(c.leagueId) > 1);
  if (!slot) return;
  const world = state.pools?.[level(slot.leagueId)!.country];
  if (!world?.length) return;
  const incoming = draw(rng, world, (c) => Math.exp(c.rep * 2.2));
  swapIdentity(state, rng, slot, incoming);
  world.splice(world.indexOf(incoming), 1);
}

export interface MovementResult {
  movement: Movement;
  /** Set when the manager's club has been relegated out of the pyramid: the manager has to move on. */
  userOut: boolean;
  /** That club as it was, since its place now belongs to the club that came up. */
  userOld?: { clubId: number; name: string; colours: [string, string] };
}

/**
 * Promotion and relegation for the season that has just finished. Call after everything that
 * reads the final tables and before the next season's fixtures are drawn. `tables` are the
 * finished tables (club ids, first place first) of every played division.
 */
export function promoteAndRelegate(state: GameState, rng: Rng, tables: Record<string, number[]>): MovementResult {
  state.pools ??= {};
  ageParachutes(state);
  const byId = (id: number) => state.clubs.find((c) => c.id === id)!;
  const moves: [string, string, string][] = [];
  const playoffs: Record<string, string> = {};
  const from = new Map<number, string>();
  let userOut = false;
  let userOld: MovementResult['userOld'];

  for (const py of PYRAMIDS) {
    const levels = py.levels.filter((l) => state.comps.some((c) => c.id === l.id) && tables[l.id]);
    if (levels.length < 2) continue;
    const ids: Record<string, Set<number>> = {};
    for (const l of levels) ids[l.id] = new Set(state.comps.find((c) => c.id === l.id)!.clubIds);

    const up: Record<string, number[]> = {};
    const down: Record<string, number[]> = {};
    for (const spec of levels) {
      const table = tables[spec.id];
      down[spec.id] = table.slice(table.length - spec.down);
      if (spec.tier === 1) continue;
      const auto = table.slice(0, spec.up);
      if (spec.playoff) {
        const po = playoffWinner(state, rng, spec, table);
        playoffs[spec.name] = byId(po).name;
        up[spec.id] = [...auto, po];
      } else up[spec.id] = auto;
    }
    const nameOf = (id: string) => level(id)!.name;

    // Clubs that keep their identity: up or down a level. The last level's relegation places are
    // taken by the pool, so a played division always has as many clubs coming in as going out.
    const dest = new Map<number, string>();
    for (let i = 0; i < levels.length - 1; i++) {
      const hi = levels[i];
      const lo = levels[i + 1];
      // Promotion places are the ones the division above gives up.
      const n = down[hi.id].length;
      const promoted = [...up[lo.id]];
      // (Divisions with a play-off promote exactly as many as go down, by construction of the specs.)
      for (const id of down[hi.id]) dest.set(id, lo.id);
      for (const id of promoted.slice(0, n)) dest.set(id, hi.id);
    }
    // The bottom played division loses its last places to the pool, whose best clubs take their slots.
    const bottom = levels[levels.length - 1];
    const world = (state.pools[py.country] ??= initialPool(py.country));
    const out = down[bottom.id];
    const incoming: NonLeagueClub[] = [];
    for (let i = 0; i < out.length; i++) {
      const pick = draw(rng, world.filter((c) => !incoming.includes(c)), (c) => Math.exp(c.rep * 2.2));
      incoming.push(pick);
    }
    out.forEach((id, i) => {
      const slot = byId(id);
      if (slot.id === state.userClubId) {
        userOut = true;
        userOld = { clubId: slot.id, name: slot.name, colours: slot.colours };
      }
      moves.push([slot.name, bottom.name, py.pool]);
      const leaving = swapIdentity(state, rng, slot, incoming[i]);
      moves.push([slot.name, py.pool, bottom.name]);
      world.splice(world.indexOf(incoming[i]), 1, leaving);
      dest.delete(id);
    });
    // Anyone promoted into the bottom division from the pool is already there by identity swap; the
    // bottom division's own promotions to the level above were set in `dest` above.

    for (const [id, to] of dest) {
      const c = byId(id);
      if (c.leagueId === to) continue;
      moves.push([c.name, nameOf(c.leagueId), nameOf(to)]);
    }
    // Apply: new membership, then each club's money follows its new league.
    for (const [id, to] of dest) {
      const c = byId(id);
      from.set(id, c.leagueId);
      ids[c.leagueId].delete(id);
      ids[to].add(id);
      c.leagueId = to;
    }
    for (const l of levels) state.comps.find((c) => c.id === l.id)!.clubIds = [...ids[l.id]];
  }
  for (const [id, was] of from) {
    const c = byId(id);
    const f = c.finance;
    if (tierOf(was) === 1) f.parachute = 3;
    else if (tierOf(c.leagueId) === 1) f.parachute = undefined;
    repriceForLeague(state, c, was);
  }
  return { movement: { season: state.season, moves, playoffs }, userOut, userOld };
}

/** Parachute payments run for three seasons: one fewer each summer (called before promotions are applied). */
function ageParachutes(state: GameState): void {
  for (const c of state.clubs) {
    const f = c.finance;
    if (!f.parachute) continue;
    f.tvShare -= parachuteFor(c.leagueId, f.parachute);
    f.parachute = f.parachute > 1 ? f.parachute - 1 : undefined;
    if (f.parachute) f.tvShare += parachuteFor(c.leagueId, f.parachute);
  }
}
