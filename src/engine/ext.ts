/**
 * Clubs outside the six playable leagues: lower-division sides in the domestic cups and the
 * rest of Europe in the UEFA competitions. They live in `state.extClubs` (ids above EXT_BASE),
 * never in the league tables, the transfer market or the accounts. Their squads are generated
 * when they first play and dropped once they're knocked out (unless they met the manager's
 * club, whose match reports need the names). Everything external is cleared each summer.
 */
import { assignSquadNumbers, createPlayer, rollPotential } from './generate.js';
import { emptyLedger, niceWage } from './finance.js';
import { hashString } from './attributes.js';
import { FOREIGN, LOWER } from './db/cups-2026.js';
import { tierOf } from './levels.js';
import { clamp, Rng } from './rng.js';
import type { Club, GameState, Player, Pos, Tactics } from './types.js';

export const EXT_BASE = 10_000;
export const EXT_LEAGUE = 'EXT';

export const isExtId = (id: number | null | undefined): boolean => !!id && id > EXT_BASE;
export const isExtPlayer = (p: Player): boolean => isExtId(p.clubId);

export interface ExtRowInfo {
  name: string;
  short: string;
  country: string;
  division: string;
  tier: number;
  colours: [string, string];
  stadium: string;
  capacity: number;
}

let index: Map<string, ExtRowInfo> | null = null;

/** Every club the cups can call on from outside the six leagues, by name. */
export function extRows(): Map<string, ExtRowInfo> {
  if (index) return index;
  index = new Map();
  for (const [country, rows] of Object.entries(LOWER)) {
    for (const [name, short, division, tier, colours, stadium, capacity] of rows) {
      index.set(name, { name, short, country, division, tier, colours, stadium, capacity });
    }
  }
  const DIV: Record<string, string> = {
    GRE: 'Super League Greece', NOR: 'Eliteserien', BEL: 'Belgian Pro League', TUR: 'Süper Lig', NED: 'Eredivisie', AUT: 'Austrian Bundesliga',
    SVK: 'Slovak First League', AZE: 'Azerbaijan Premier League', UKR: 'Ukrainian Premier League', CZE: 'Czech First League', ARM: 'Armenian Premier League',
    SVN: 'Slovenian PrvaLiga', SCO: 'Scottish Premiership', HUN: 'NB I', CRO: 'HNL', ISR: "Israeli Premier League", POL: 'Ekstraklasa',
    BUL: 'Bulgarian First League', CYP: 'Cypriot First Division', DEN: 'Danish Superliga', BIH: 'Premijer Liga', SRB: 'Serbian SuperLiga', ALB: 'Kategoria Superiore',
    GEO: 'Erovnuli Liga', AND: 'Primera Divisió', KAZ: 'Kazakhstan Premier League', LTU: 'A Lyga', FIN: 'Veikkausliiga', GIB: 'Gibraltar Football League',
    SUI: 'Swiss Super League', SWE: 'Allsvenskan', LVA: 'Virslīga', ROU: 'Liga I',
  };
  for (const [name, short, country, tier, colours, stadium, capacity] of FOREIGN) {
    index.set(name, { name, short, country, division: DIV[country] ?? 'League', tier, colours, stadium, capacity });
  }
  return index;
}

/** Division order within a country's pyramid (the top flight is 1), from the order of the data. */
export function divisionLevel(country: string, division: string): number {
  const rows = LOWER[country];
  if (!rows) return 1;
  const order: string[] = [];
  for (const r of rows) if (!order.includes(r[2])) order.push(r[2]);
  const i = order.indexOf(division);
  return i < 0 ? 1 : i + 2;
}

/** A club's level for cup hosting rules: 1 for the top flights and the rest of Europe. */
export function clubLevel(c: Club): number {
  return c.external ? divisionLevel(c.external.country, c.external.division) : tierOf(c.leagueId);
}

/** Club strength on the reputation scale, for seeding and hosting. */
export function strength(c: Club): number {
  return c.external ? c.external.tier : c.reputation;
}

export function findClubByName(state: GameState, name: string): Club | undefined {
  return state.clubs.find((c) => c.name === name) ?? state.extClubs.find((c) => c.name === name);
}

function extTactics(rng: Rng, tier: number): Tactics {
  const formation = rng.pick(tier >= 4 ? ['4-2-3-1', '4-3-3', '4-4-2', '3-5-2'] : ['4-4-2', '4-4-2', '4-5-1', '4-2-3-1', '5-3-2']);
  return {
    formation, mentality: 'balanced', passing: tier >= 5 ? rng.pick(['short', 'mixed'] as const) : rng.pick(['mixed', 'long', 'long'] as const),
    tackling: rng.pick(['normal', 'normal', 'hard'] as const), closingDown: rng.pick(['own-half', 'mixed', 'mixed', 'all-over'] as const),
    counterAttack: tier < 4 && rng.chance(0.6), offsideTrap: rng.chance(0.25),
  };
}

/** Add an outside club for this season's cups (no squad yet). */
export function makeExtClub(state: GameState, row: ExtRowInfo): Club {
  const existing = state.extClubs.find((c) => c.name === row.name);
  if (existing) return existing;
  const rng = new Rng(hashString(`ext:${row.name}`));
  const c: Club = {
    id: state.nextExtId++,
    name: row.name,
    short: row.short,
    colours: row.colours,
    reputation: clamp(row.tier, 0.5, 10),
    stadium: row.stadium,
    capacity: row.capacity,
    leagueId: EXT_LEAGUE,
    playerIds: [],
    tactics: extTactics(rng, row.tier),
    lineup: null,
    bench: null,
    finance: {
      balance: 0, transferBudget: 0, wageBudget: 0, commercial: 0, tvShare: 0,
      ticketPrice: Math.round(10 + row.tier * 5), wageScale: 1, ledger: emptyLedger(), history: [], deduction: 0,
    },
    external: { country: row.country, division: row.division, tier: row.tier },
  };
  state.extClubs.push(c);
  return c;
}

/** Name pools for countries without their own (neighbours with a similar naming tradition). */
const NATION_POOL: Record<string, string> = {
  BEL: 'NED', AUT: 'GER', SUI: 'GER', SVK: 'CZE', SVN: 'CRO', BIH: 'SRB', BUL: 'SRB', AZE: 'TUR', ARM: 'GRE', CYP: 'GRE', ALB: 'CRO', GEO: 'UKR',
  KAZ: 'UKR', LTU: 'POL', LVA: 'POL', FIN: 'SWE', ISR: 'GRE', AND: 'ESP', GIB: 'ENG', SCO: 'SCO', NOR: 'NOR', DEN: 'DEN', NED: 'NED',
};
const IMPORTS = ['BRA', 'NGA', 'SEN', 'FRA', 'POR', 'ESP', 'NED', 'SCO', 'IRL', 'JAM'];

const SHAPE: Pos[] = ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MC', 'MC', 'AMR', 'AML', 'ST', 'GK', 'DC', 'DR', 'MC', 'AMC', 'ML', 'ST'];

/** Typical ability of an outside club's first team (the rest of Europe on a steeper scale than the lower divisions). */
export function extLevelCA(tier: number, foreign: boolean): number {
  return foreign ? 55 + tier * 12 : 67 + tier * 11.5;
}

/**
 * Give an outside club a squad of 18 generated players, if it doesn't have one. Seeded by club
 * and season, so the same squad appears whenever it's first needed (a pre-match screen or kick-off).
 */
export function ensureSquad(state: GameState, c: Club): void {
  if (!c.external || c.playerIds.length) return;
  const rng = new Rng(hashString(`squad:${c.name}:${state.season}`));
  const base = extLevelCA(c.external.tier, !LOWER[c.external.country]);
  const home = NATION_POOL[c.external.country] ?? c.external.country;
  SHAPE.forEach((pos, i) => {
    // Mostly home-grown, with a few imports.
    const nation = rng.chance(0.78) ? home : rng.pick(IMPORTS);
    const age = rng.int(19, 33);
    const ca = clamp(Math.round(base + rng.normal() * 7 - (i >= 11 ? 9 : 0)), 35, 175);
    const p = createPlayer(rng, state, { pos, ca, pa: rollPotential(rng, ca, age), age, clubId: c.id, nation, exactNation: true });
    p.wage = niceWage(100_000 * Math.exp(0.038 * (p.ca - 150)) * 0.45);
    p.contractEnd = state.season + 1;
    p.joined = state.season;
    state.players[p.id] = p;
    c.playerIds.push(p.id);
  });
  assignSquadNumbers(c, state.players);
}

/** Drop an outside club's squad (it's out of every cup and never met the manager's club). */
export function dropSquad(state: GameState, c: Club): void {
  for (const id of c.playerIds) delete state.players[id];
  c.playerIds = [];
  c.lineup = null;
  c.bench = null;
}

/** Summer: every outside club and its players go. */
export function clearExternal(state: GameState): void {
  for (const c of state.extClubs) dropSquad(state, c);
  for (const p of Object.values(state.players)) if (isExtPlayer(p)) delete state.players[p.id];
  state.extClubs = [];
  state.nextExtId = EXT_BASE + 1;
}
