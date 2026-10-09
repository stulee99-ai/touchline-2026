import { buildPyramid } from './pyramid.js';
import { applyTraits, computeCA, generateAttributes, hashString, POS_ROLE, type Role } from './attributes.js';
import { NATIONS } from './data.js';
import { LEAGUES, SEASON } from './db/index.js';
import { FREE_AGENTS_2026 } from './db/free-agents.js';
import type { DbPlayer } from './db/types.js';
import { TRAITS } from './db/traits.js';
import { clubWage, initClubFinance, initContract, marketWage } from './finance.js';
import { buildCups } from './cups.js';
import { emptyIntl, initIntl } from './intl.js';
import { EXT_BASE } from './ext.js';
import { makeFixtures } from './fixtures.js';
import { aiListings } from './transfers.js';
import { CONFIRM_AHEAD, confirmKickoffs } from './kickoffs.js';
import { clamp, Rng } from './rng.js';
import { START_DAY } from './calendar.js';
import { holidaySharp } from './training.js';
import { applyFlyingAnts } from './scenario.js';
import type { Club, Competition, GameMode, GameState, Player, Pos, SeasonStats, Tactics } from './types.js';

export const SAVE_VERSION = 15;

export function emptyStats(): SeasonStats {
  return { apps: 0, subApps: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0, yellow: 0, red: 0, cleanSheets: 0, mins: 0 };
}

/** Secondary positions a player of a given primary position might also play. */
const SECONDARY: Partial<Record<Pos, [Pos, number, number][]>> = {
  DR: [['MR', 15, 0.3], ['DL', 12, 0.3], ['DC', 12, 0.15]],
  DL: [['ML', 15, 0.3], ['DR', 12, 0.3], ['DC', 12, 0.15]],
  DC: [['DM', 15, 0.2], ['DR', 12, 0.12], ['DL', 12, 0.1]],
  DM: [['MC', 15, 0.6], ['DC', 12, 0.3]],
  MC: [['DM', 15, 0.35], ['AMC', 15, 0.35]],
  MR: [['AMR', 15, 0.5], ['ML', 12, 0.25], ['DR', 12, 0.15]],
  ML: [['AML', 15, 0.5], ['MR', 12, 0.25], ['DL', 12, 0.15]],
  AMR: [['MR', 15, 0.5], ['AML', 15, 0.3], ['ST', 12, 0.3]],
  AML: [['ML', 15, 0.5], ['AMR', 15, 0.3], ['ST', 12, 0.3]],
  AMC: [['MC', 15, 0.5], ['ST', 15, 0.3]],
  ST: [['AMC', 12, 0.3], ['AMR', 12, 0.15], ['AML', 12, 0.15]],
};

export interface PlayerSpec {
  pos: Pos;
  ca: number;
  pa: number;
  age: number;
  clubId: number | null;
  /** Nationality to draw the name from; random (mostly British) when omitted. */
  nation?: string;
  /** Always use that nationality (clubs from outside the six leagues). */
  exactNation?: boolean;
}

export function pickNation(rng: Rng, prefer?: string, exact = false) {
  // Most generated players come from the club's own country; the rest from anywhere.
  if (prefer && (exact || rng.chance(0.75))) {
    const n = NATIONS.find((x) => x.code === prefer);
    if (n) return n;
  }
  return NATIONS[rng.weighted(NATIONS.map((n) => n.weight))];
}

export function createPlayer(rng: Rng, state: Pick<GameState, 'nextPlayerId'>, spec: PlayerSpec): Player {
  const nation = pickNation(rng, spec.nation, spec.exactNation);
  const role: Role = POS_ROLE[spec.pos];
  const pos: Partial<Record<Pos, number>> = { [spec.pos]: 20 };
  for (const [p, lvl, chance] of SECONDARY[spec.pos] ?? []) if (rng.chance(chance)) pos[p] = lvl;
  const leftSide = spec.pos.endsWith('L') && spec.pos !== 'GK';
  const rightSide = spec.pos.endsWith('R');
  const foot: Player['foot'] = leftSide
    ? rng.chance(0.85) ? 'L' : 'B'
    : rightSide
      ? rng.chance(0.85) ? 'R' : 'B'
      : rng.chance(0.72) ? 'R' : rng.chance(0.8) ? 'L' : 'B';

  const p: Player = {
    id: state.nextPlayerId++,
    firstName: rng.pick(nation.first),
    lastName: rng.pick(nation.last),
    nation: nation.code,
    age: spec.age,
    clubId: spec.clubId,
    squadNo: 0,
    foot,
    pos,
    attrs: generateAttributes(rng, role, spec.ca, spec.age),
    ca: 0,
    pa: 0,
    condition: 92 + rng.int(0, 8),
    morale: 55 + rng.int(0, 20),
    form: [],
    injury: null,
    suspended: 0,
    stats: emptyStats(),
    career: [],
    ...contractDefaults(),
  };
  p.ca = computeCA(p);
  p.pa = Math.max(p.ca, spec.pa);
  return p;
}

/** Placeholder contract fields; real values are set once the player's club is known. */
function contractDefaults(): Pick<Player, 'wage' | 'contractEnd' | 'releaseClause' | 'bookValue' | 'listed' | 'loan' | 'preContract' | 'joined'> {
  return { wage: 0, contractEnd: SEASON + 2, releaseClause: null, bookValue: 0, listed: null, loan: null, preContract: null, joined: SEASON };
}

/** Put a newly created player (youth intake, squad filler) on the club's pay scale. */
export function giveContract(state: Pick<GameState, 'season'>, p: Player, c: Club, years: number): void {
  if (!c.finance) return;
  p.wage = clubWage(p, c);
  p.contractEnd = state.season + years;
  p.joined = state.season;
}

/** Potential for a player of this age and ability. Rare wonderkids included. */
export function rollPotential(rng: Rng, ca: number, age: number): number {
  if (age >= 29) return ca + rng.int(0, 3);
  const headroom = Math.max(0, 28 - age) * (2.5 + rng.next() * 3.5);
  let pa = ca + headroom * (0.35 + rng.next() * 0.65);
  if (age <= 21 && rng.chance(0.02)) pa = Math.max(pa, 160 + rng.int(0, 35));
  return clamp(Math.round(pa), ca, 200);
}

const CLASSIC_NUMBERS: [number, Pos[]][] = [
  [1, ['GK']], [2, ['DR']], [3, ['DL']], [5, ['DC']], [6, ['DC']], [4, ['DM', 'MC']], [7, ['MR', 'AMR']],
  [8, ['MC']], [9, ['ST']], [11, ['ML', 'AML']], [10, ['AMC', 'ST']],
];

export function assignSquadNumbers(club: Club, players: Record<number, Player>): void {
  const taken = new Set<number>();
  for (const id of club.playerIds) {
    const n = players[id].squadNo;
    if (n > 0 && !taken.has(n)) taken.add(n);
    else players[id].squadNo = 0;
  }
  const needs = club.playerIds.map((id) => players[id]).filter((p) => p.squadNo === 0);
  needs.sort((a, b) => b.ca - a.ca);
  // Traditional numbers 1–11 go to the best player in each position.
  const primary = (p: Player) => (Object.keys(p.pos) as Pos[]).find((k) => p.pos[k] === 20);
  for (const [num, positions] of CLASSIC_NUMBERS) {
    if (taken.has(num)) continue;
    const p = needs.find((x) => x.squadNo === 0 && positions.includes(primary(x)!));
    if (p) {
      p.squadNo = num;
      taken.add(num);
    }
  }
  let n = 1;
  for (const p of needs) {
    if (p.squadNo) continue;
    while (taken.has(n)) n++;
    p.squadNo = n;
    taken.add(n);
  }
}

/** Typical squad-wide ability for a club of this reputation (used for free-agent cover). */
export function repToCA(rep: number): number {
  return 95 + rep * 7;
}

export function defaultTactics(formation = '4-4-2'): Tactics {
  return { formation, mentality: 'balanced', passing: 'mixed', tackling: 'normal', closingDown: 'mixed', counterAttack: false, offsideTrap: false };
}

const VALID_POS = new Set<string>(['GK', 'DL', 'DC', 'DR', 'DM', 'ML', 'MC', 'MR', 'AML', 'AMC', 'AMR', 'ST']);

/** Age on 1 August of the season's first year. */
export function ageAt(born: number, seasonYear: number): number {
  const y = Math.floor(born / 100);
  const m = born % 100;
  return seasonYear - y - (m > 8 ? 1 : 0);
}

/** Build a real player from a database row. Attributes are seeded by name, so they are identical in every new game. */
export function createFromDb(state: Pick<GameState, 'nextPlayerId'>, row: DbPlayer, clubId: number | null, seasonYear: number): Player {
  const [shirt, fullName, posStr, nation, born, ca, paIn] = row;
  // Seed by name and birth month so namesakes (there are several Rodris) differ.
  const rng = new Rng(hashString(`${fullName}:${born}`));
  let firstName: string;
  let lastName: string;
  if (fullName.includes('|')) [firstName, lastName] = fullName.split('|');
  else if (!fullName.includes(' ')) [firstName, lastName] = ['', fullName];
  else {
    const i = fullName.indexOf(' ');
    firstName = fullName.slice(0, i);
    lastName = fullName.slice(i + 1);
  }
  const codes = posStr.split('/').filter((c) => VALID_POS.has(c)) as Pos[];
  const pos: Partial<Record<Pos, number>> = {};
  codes.forEach((c, i) => (pos[c] = i === 0 ? 20 : 16));
  // Natural neighbours: central midfielders can sit deeper, wingers can play in a wide midfield role, and so on.
  const NEIGHBOURS: Partial<Record<Pos, [Pos, number][]>> = {
    MC: [['DM', 15], ['AMC', 13]], DM: [['MC', 15]], AMC: [['MC', 13]],
    AML: [['ML', 15]], AMR: [['MR', 15]], ML: [['AML', 15]], MR: [['AMR', 15]],
    DL: [['ML', 11]], DR: [['MR', 11]],
  };
  for (const c of codes) for (const [p, lvl] of NEIGHBOURS[c] ?? []) if ((pos[p] ?? 0) < lvl) pos[p] = lvl;
  for (const c of codes) for (const [p, lvl, chance] of SECONDARY[c] ?? []) if (!pos[p] && lvl >= 15 && rng.chance(chance * 0.6)) pos[p] = 12;
  const primary = codes[0] ?? 'MC';
  const role: Role = POS_ROLE[primary];
  const age = ageAt(born, seasonYear);
  // Signature traits belong to the famous player of that name, not a namesake at a small club.
  const trait = (ca >= 140 && TRAITS[fullName.replace('|', ' ')]) || {};
  const attrs = generateAttributes(rng, role, ca, age);
  if (trait.attrs) applyTraits(rng, attrs, role, ca, trait.attrs);
  const side = primary.endsWith('L') ? 'L' : primary.endsWith('R') ? 'R' : '';
  const foot: Player['foot'] = trait.foot ?? (side === 'L' ? (rng.chance(0.8) ? 'L' : 'R') : side === 'R' ? (rng.chance(0.8) ? 'R' : 'L') : rng.chance(0.75) ? 'R' : rng.chance(0.85) ? 'L' : 'B');
  const p: Player = {
    id: state.nextPlayerId++,
    firstName,
    lastName,
    nation,
    age,
    clubId,
    squadNo: shirt,
    foot,
    pos,
    attrs,
    ca: 0,
    pa: 0,
    condition: 96 + rng.int(0, 4),
    morale: 60 + rng.int(0, 15),
    form: [],
    injury: null,
    suspended: 0,
    stats: emptyStats(),
    career: [],
    ...contractDefaults(),
  };
  p.ca = computeCA(p);
  p.pa = Math.max(p.ca, paIn ?? rollPotential(rng, p.ca, age));
  return p;
}

/** Minimum numbers of natural players per position group; thin squads are topped up. */
export const MIN_BY_POS: [Pos[], number][] = [
  [['GK'], 2],
  [['DC'], 3],
  [['DL', 'DR'], 2],
  [['DM', 'MC'], 3],
  [['ML', 'MR', 'AML', 'AMR'], 2],
  [['ST'], 2],
];

/**
 * Top up a squad so it can always field a side: at least two keepers, enough cover in
 * each line, and 22 players in all. These are generated squad players, not real ones.
 */
export function fillSquad(rng: Rng, state: Pick<GameState, 'nextPlayerId' | 'players'>, c: Club, nation: string): Player[] {
  const added: Player[] = [];
  const base = repToCA(c.reputation);
  const add = (pos: Pos) => {
    const age = rng.int(20, 30);
    // Squad players: good enough to cover, rarely good enough to displace a real first-teamer.
    const ca = clamp(Math.round(base - 30 + rng.normal() * 6), 40, 160);
    const p = createPlayer(rng, state, { pos, ca, pa: rollPotential(rng, ca, age), age, clubId: c.id, nation });
    state.players[p.id] = p;
    c.playerIds.push(p.id);
    if (c.finance && 'season' in state) giveContract(state as GameState, p, c, rng.int(1, 3));
    added.push(p);
  };
  for (const [group, min] of MIN_BY_POS) {
    // Real players listed in a second position (16) count as cover, so only genuine gaps are filled.
    let have = c.playerIds.filter((id) => group.some((g) => (state.players[id].pos[g] ?? 0) >= (g === 'GK' ? 20 : 16))).length;
    while (have < min) {
      add(rng.pick(group));
      have++;
    }
  }
  while (c.playerIds.length < 22) add(rng.pick<Pos>(['DC', 'DR', 'DL', 'MC', 'DM', 'AMR', 'AML', 'ST']));
  return added;
}

export function newGame(seed: number, managerName = 'The Gaffer', mode: GameMode = 'classic'): GameState {
  const rng = new Rng(seed);
  const state: GameState = {
    version: SAVE_VERSION,
    mode,
    seed,
    rngState: 0,
    season: SEASON,
    day: START_DAY,
    userClubId: 0,
    managerName,
    comps: [],
    clubs: [],
    players: {},
    fixtures: [],
    news: [],
    history: [],
    nextPlayerId: 1,
    nextNewsId: 1,
    offers: [],
    transfers: [],
    scouting: { scouts: [], pool: [], assignments: [], reports: {}, known: {}, shortlist: [], nextId: 1 },
    nextOfferId: 1,
    cups: [],
    nextTieId: 1,
    extClubs: [],
    nextExtId: EXT_BASE + 1,
    intl: emptyIntl(SEASON),
  };

  const seen = new Set<string>();
  for (const league of LEAGUES) {
    const comp: Competition = { id: league.id, name: league.name, kind: 'league', country: league.country, nation: league.nation, clubIds: [] };
    for (const def of league.clubs) {
      const club: Club = {
        id: state.clubs.length + 1,
        name: def.name,
        short: def.short,
        colours: def.colours,
        reputation: def.reputation,
        stadium: def.stadium,
        capacity: def.capacity,
        leagueId: league.id,
        playerIds: [],
        tactics: aiTactics(new Rng(hashString(def.name)), def.formation, def.reputation),
        lineup: null,
        bench: null,
        finance: undefined as unknown as Club['finance'],
      };
      for (const row of def.squad) {
        // The same person listed by two clubs (a source lagging behind a transfer) is kept once.
        const key = `${row[1]}:${row[4]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const p = createFromDb(state, row, club.id, SEASON);
        state.players[p.id] = p;
        club.playerIds.push(p.id);
      }
      fillSquad(rng, state, club, league.nation);
      assignSquadNumbers(club, state.players);
      state.clubs.push(club);
      comp.clubIds.push(club.id);
    }
    state.comps.push(comp);
  }

  // Contracts and money, once every club and league is in place.
  for (const c of state.clubs) {
    for (const id of c.playerIds) initContract(rng, state.players[id], state.season, c.leagueId);
    initClubFinance(rng, state, c);
  }

  // The Championship, League One and League Two, with generated squads.
  buildPyramid(state, seed);

  // Well-known players who are between clubs when the game starts.
  for (const row of FREE_AGENTS_2026) {
    const p = createFromDb(state, row, null, SEASON);
    p.contractEnd = state.season;
    p.wage = marketWage(p, 'ENG', 7);
    p.freeSince = state.day + state.season * 365;
    state.players[p.id] = p;
  }

  // A what-if scenario rewrites the Premier League before the season is drawn. It uses its own
  // random stream, so the rest of the world is exactly the one classic mode would have built.
  if (mode === 'flying-ants') applyFlyingAnts(state, new Rng(seed ^ 0x51f7a47));

  for (const p of Object.values(state.players)) p.sharp = holidaySharp(rng, p);
  scheduleSeason(state, rng);
  initIntl(state, rng);
  aiListings(state);
  state.rngState = rng.state;
  return state;
}

/** Fresh league fixtures for every competition, then the cups (league games make way for cup ties). */
export function scheduleSeason(state: GameState, rng: Rng): void {
  state.fixtures = [];
  for (const comp of state.comps) {
    state.fixtures.push(...makeFixtures(comp.clubIds, rng, comp.id, state.season, state.fixtures.length + 1));
  }
  buildCups(state, rng);
  // The opening weeks' kick-off times are announced with the fixture list.
  const first = Math.min(...state.fixtures.map((f) => f.weekend));
  confirmKickoffs(state, rng, first + CONFIRM_AHEAD);
}

/** A club's house style: bigger clubs press and pass, smaller ones sit in and go direct. */
export function aiTactics(rng: Rng, formation: string, rep: number): Tactics {
  const t = defaultTactics(formation);
  if (rep >= 8) {
    t.passing = rng.chance(0.7) ? 'short' : 'mixed';
    t.closingDown = rng.chance(0.7) ? 'all-over' : 'mixed';
    t.offsideTrap = rng.chance(0.5);
  } else if (rep <= 5) {
    t.passing = rng.chance(0.5) ? 'long' : 'mixed';
    t.closingDown = rng.chance(0.5) ? 'own-half' : 'mixed';
    t.counterAttack = rng.chance(0.6);
  } else {
    t.passing = rng.pick(['short', 'mixed', 'mixed', 'long'] as const);
    t.closingDown = rng.pick(['own-half', 'mixed', 'mixed', 'all-over'] as const);
    t.counterAttack = rng.chance(0.35);
    t.offsideTrap = rng.chance(0.25);
  }
  t.tackling = rng.pick(['easy', 'normal', 'normal', 'hard'] as const);
  return t;
}
