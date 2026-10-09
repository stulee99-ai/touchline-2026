import { applyTraits, computeCA, POS_ROLE } from './attributes.js';
import { initClubFinance, initContract, M, marketWage, niceMoney, niceWage, setBudgets, wageBill } from './finance.js';
import { assignSquadNumbers, aiTactics, createPlayer, rollPotential } from './generate.js';
import { liquidateClub } from './pyramid.js';
import { clamp, type Rng } from './rng.js';
import type { Attributes, Club, GameState, NewsItem, Player, Pos } from './types.js';

/**
 * Flying Ants mode: a what-if that changes the Premier League before day one.
 *
 * Manchester City are found guilty of financial irregularities and liquidated. Their players
 * become free agents, their cash is shared equally between the other nineteen clubs, and a
 * brand-new club, Flying Ants, takes their place in the league (and their cup and European
 * slots). Flying Ants have taken over Millwall's ground, the New Den, after Millwall went out
 * of business too. None of it happened: it is a fictional scenario, and the stories say so.
 */

export const LIQUIDATED = 'Manchester City';
export const FLYING_ANTS = 'Flying Ants';
export const MILLWALL = 'Millwall';
export const GROUND = 'The Dirtbox';
/** The New Den's capacity, as listed for Millwall. */
export const GROUND_CAPACITY = 20146;
/** Size of the new club's squad: the ten scouted players and generated cover. */
export const SQUAD_SIZE = 24;

/** A scouted player with a fixed name, age, positions and strengths. */
interface Named {
  first: string;
  last: string;
  nation: 'ENG' | 'WAL';
  age: number;
  primary: Pos;
  /** Other positions and how well he plays them (16 = competent, 12 = accomplished). */
  also?: Partial<Record<Pos, number>>;
  ca: number;
  pa: number;
  foot: 'L' | 'R' | 'B';
  attrs: Partial<Attributes>;
  no: number;
  /** The line under his name in the story. */
  note: string;
}

export const FLYING_ANTS_TEN: Named[] = [
  {
    first: 'Stuart', last: 'Lee', nation: 'ENG', age: 28, primary: 'MC', also: { DM: 15, AMC: 13 }, ca: 135, pa: 137, foot: 'R', no: 8,
    attrs: { stamina: 18, workRate: 18, teamwork: 16, tackling: 13, passing: 12, technique: 11, creativity: 10, longShots: 11, naturalFitness: 16 },
    note: 'Box-to-box midfielder. Covers every blade of grass and is still running at the final whistle.',
  },
  {
    first: 'Jack', last: 'Selby', nation: 'ENG', age: 27, primary: 'DC', also: { DR: 12 }, ca: 133, pa: 135, foot: 'R', no: 5,
    attrs: { heading: 17, jumping: 16, strength: 16, marking: 14, tackling: 13, positioning: 14, pace: 9, acceleration: 9 },
    note: 'Centre-back. Wins everything in the air and is a threat from set pieces.',
  },
  {
    first: 'Jamie', last: 'Saunders', nation: 'ENG', age: 30, primary: 'ST', ca: 137, pa: 137, foot: 'R', no: 9,
    attrs: { heading: 18, jumping: 17, strength: 18, finishing: 15, offTheBall: 13, composure: 13, pace: 8, acceleration: 8, agility: 8, dribbling: 9, technique: 10 },
    note: 'Target-man striker. Holds the ball up, brings others into play and battles centre-backs all afternoon.',
  },
  {
    first: 'Jamie', last: 'Evans', nation: 'WAL', age: 26, primary: 'DL', also: { ML: 15, DR: 12 }, ca: 131, pa: 133, foot: 'L', no: 3,
    attrs: { crossing: 17, stamina: 15, pace: 12, acceleration: 12, workRate: 14, tackling: 10, marking: 10, positioning: 10 },
    note: 'Left-back. Welsh, and the only player in the group not born in England. Loves to overlap and deliver.',
  },
  {
    first: 'Chris', last: 'Light', nation: 'ENG', age: 31, primary: 'GK', ca: 135, pa: 135, foot: 'R', no: 1,
    attrs: { reflexes: 17, handling: 14, oneOnOnes: 14, aerialAbility: 12, positioning: 13, agility: 14 },
    note: 'Goalkeeper. Quick off his line and full of reflexes.',
  },
  {
    first: 'Simon', last: 'Manson', nation: 'ENG', age: 29, primary: 'MC', also: { DM: 16, DR: 16, DL: 15, DC: 15, MR: 16, ML: 15 }, ca: 129, pa: 130, foot: 'R', no: 12,
    attrs: { tackling: 12, marking: 12, positioning: 12, heading: 12, crossing: 12, passing: 12, pace: 12, stamina: 13, workRate: 14, teamwork: 15, decisions: 13, composure: 12 },
    note: 'The all-round utility man. Can turn out anywhere from right-back to right midfield and is never out of his depth.',
  },
  {
    first: 'Adam', last: 'Green', nation: 'ENG', age: 24, primary: 'DR', also: { MR: 13 }, ca: 129, pa: 141, foot: 'R', no: 2,
    attrs: { pace: 17, acceleration: 17, stamina: 15, crossing: 12, tackling: 10, marking: 10, positioning: 10 },
    note: 'Right-back. Quick, athletic, and still learning where to stand when he does not have the ball.',
  },
  {
    first: 'Patch', last: 'Thompson', nation: 'ENG', age: 22, primary: 'MC', also: { DM: 12, AMC: 13 }, ca: 126, pa: 148, foot: 'R', no: 4,
    attrs: { longShots: 17, setPieces: 15, technique: 14, passing: 12, creativity: 11, stamina: 12, tackling: 10, workRate: 12 },
    note: 'Midfielder, the youngest of the group. Hits them from distance and has a high ceiling.',
  },
  {
    first: 'Kealan', last: 'Sheridan', nation: 'ENG', age: 25, primary: 'AMC', also: { MC: 13, ST: 12 }, ca: 140, pa: 144, foot: 'L', no: 10,
    attrs: { passing: 17, creativity: 17, technique: 16, flair: 15, setPieces: 15, decisions: 14, pace: 10, strength: 8, tackling: 6, workRate: 10 },
    note: 'The number 10. Sees passes nobody else does, and the first name on the team sheet.',
  },
  {
    first: 'James', last: 'Roworth', nation: 'ENG', age: 27, primary: 'GK', also: { ST: 20 }, ca: 129, pa: 131, foot: 'B', no: 13,
    attrs: { reflexes: 14, handling: 12, oneOnOnes: 13, finishing: 14, offTheBall: 13, composure: 13, heading: 13, strength: 13, pace: 12, acceleration: 11, technique: 10, anticipation: 12 },
    note: 'Goalkeeper and striker. Equally happy between the sticks or leading the line, and nobody is quite sure which he is.',
  },
];

/** The generated cover behind the ten: one entry per shirt. */
const COVER: Pos[] = ['DC', 'DC', 'DC', 'DR', 'DL', 'DM', 'MC', 'MR', 'ML', 'AMR', 'AML', 'ST', 'ST', 'GK'];

function build(rng: Rng, state: GameState, club: Club, n: Named): Player {
  const p = createPlayer(rng, state, { pos: n.primary, ca: n.ca, pa: n.pa, age: n.age, clubId: club.id, nation: n.nation, exactNation: true });
  p.firstName = n.first;
  p.lastName = n.last;
  p.nation = n.nation;
  p.foot = n.foot;
  p.pos = { [n.primary]: 20, ...(n.also ?? {}) };
  // Scouted for durability and temperament: none of the ten start out injury-prone or hot-headed.
  applyTraits(rng, p.attrs, POS_ROLE[n.primary], n.ca, { injuryProneness: 8, consistency: 12, aggression: 11, decisions: 13, ...n.attrs });
  p.ca = computeCA(p);
  p.pa = Math.max(p.ca, n.pa);
  p.squadNo = n.no;
  return p;
}

/** A generated squad player: a notch below the ten, mostly in their twenties. */
function cover(rng: Rng, state: GameState, club: Club, pos: Pos): Player {
  const age = rng.chance(0.25) ? rng.int(18, 21) : rng.int(22, 32);
  const ca = clamp(Math.round(118 + rng.normal() * 5 - (age <= 21 ? 8 : 0)), 98, 130);
  const p = createPlayer(rng, state, { pos, ca, pa: rollPotential(rng, ca, age), age, clubId: club.id, nation: 'ENG' });
  return p;
}

function push(state: GameState, item: Omit<NewsItem, 'id' | 'season' | 'day' | 'read'>): void {
  state.news.unshift({ ...item, id: state.nextNewsId++, season: state.season, day: state.day, read: false });
}

const money = (v: number) => (v >= M ? `£${(v / M).toFixed(v >= 100 * M ? 0 : 1).replace(/\.0$/, '')}m` : `£${Math.round(v / 1000)}k`);

/** Join names as "A, B and C". */
function list(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Change a freshly built world (contracts and finances done, cups not yet drawn):
 * liquidate the club, share out its money, free its players, create the new club.
 */
export function applyFlyingAnts(state: GameState, rng: Rng): void {
  const league = state.comps.find((c) => c.id === 'ENG')!;
  const old = state.clubs.find((c) => c.name === LIQUIDATED)!;
  const rest = league.clubIds.filter((id) => id !== old.id).map((id) => state.clubs[id - 1]);

  // The old club's cash is shared equally between the other Premier League clubs.
  const cash = Math.max(0, old.finance.balance);
  const share = niceMoney(cash / rest.length);
  for (const c of rest) {
    c.finance.balance += share;
    setBudgets(state, c);
  }

  // Every player is released.
  const freed = old.playerIds.map((id) => state.players[id]).sort((a, b) => b.ca - a.ca);
  for (const p of freed) {
    p.clubId = null;
    p.contractEnd = state.season;
    p.wage = marketWage(p, 'ENG', 7);
    p.freeSince = state.day + state.season * 365;
    p.squadNo = 0;
    p.listed = null;
    p.loan = null;
    p.preContract = null;
    p.releaseClause = null;
    p.bookValue = 0;
  }

  // The new club takes the old one's place in the league table and the fixture list.
  old.name = FLYING_ANTS;
  old.short = 'FLY';
  old.colours = ['#15171c', '#f2b705'];
  old.stadium = GROUND;
  old.capacity = GROUND_CAPACITY;
  old.reputation = 3.5;
  old.playerIds = [];
  old.lineup = null;
  old.bench = null;
  old.honours = undefined;
  old.tactics = aiTactics(rng, '4-2-3-1', old.reputation);
  old.tactics.passing = 'mixed';

  const ten = FLYING_ANTS_TEN.map((n) => build(rng, state, old, n));
  const extra = COVER.slice(0, SQUAD_SIZE - ten.length).map((pos) => cover(rng, state, old, pos));
  for (const p of [...ten, ...extra]) {
    state.players[p.id] = p;
    old.playerIds.push(p.id);
  }
  assignSquadNumbers(old, state.players);

  for (const id of old.playerIds) {
    const p = state.players[id];
    initContract(rng, p, state.season, 'ENG');
    // A new club has no transfer history and its scouted players are on long contracts.
    p.bookValue = 0;
    p.joined = state.season;
    if (ten.includes(p)) p.contractEnd = state.season + 3;
  }
  initClubFinance(rng, state, old);
  old.finance.history = [];
  // The new owners back the club with room in the wage budget, enough for a few of the released stars.
  old.finance.wageBudget = niceWage(wageBill(state, old.id) * 1.3);

  // Millwall are out of business too: a National League club takes their place in the Championship.
  liquidateClub(state, rng, MILLWALL);

  state.scenario = {
    id: 'flying-ants', clubId: old.id, replaced: { [LIQUIDATED]: FLYING_ANTS }, gone: [MILLWALL], cash, share, freed: freed.length, welcomed: false,
  };
  state.mode = 'flying-ants';

  const stars = freed.slice(0, 4).map((p) => `${p.firstName} ${p.lastName}`.trim());
  push(state, {
    kind: 'headline',
    title: 'Manchester City found guilty and liquidated',
    body: `Manchester City have been found guilty of financial irregularities, the end of an investigation that has dominated the media over the last few days. The punishment is the harshest available: liquidation. The club ceases to exist with immediate effect.\n\n`
      + `All ${freed.length} players on City's books, from ${list(stars)} down, have been released and are free agents, free to sign for any club. The club's financial assets, ${money(cash)} in cash, will be divided equally among the other ${rest.length} Premier League clubs, ${money(share)} each, and have been added to their transfer and wage budgets.\n\n`
      + `In City's place, a new club called Flying Ants has been created and will start the season in the Premier League. They take over City's fixtures, and their places in the cups and in Europe. The Flying Ants board are looking for a manager.`,
  });
}

/** The second story, when the manager takes the Flying Ants job: the new signings and the ground. */
export function flyingAntsWelcome(state: GameState): void {
  const sc = state.scenario;
  if (!sc || sc.welcomed) return;
  sc.welcomed = true;
  const club = state.clubs.find((c) => c.id === sc.clubId)!;
  const players = club.playerIds
    .map((id) => state.players[id])
    .filter((p) => FLYING_ANTS_TEN.some((n) => n.first === p.firstName && n.last === p.lastName))
    .map((p) => ({ p, n: FLYING_ANTS_TEN.find((n) => n.first === p.firstName && n.last === p.lastName)! }));
  push(state, {
    kind: 'headline',
    title: 'Flying Ants move into the New Den, now The Dirtbox',
    body: `Flying Ants, the club created to take Manchester City's place in the Premier League, have taken over ownership of the New Den in south-east London. The ground was left empty after Millwall were liquidated: the Championship club's owners could not refinance the loans secured against the stadium, a court wound the company up, and no buyer came forward before the deadline. The stadium has been renamed The Dirtbox, and holds ${GROUND_CAPACITY.toLocaleString('en-GB')}.\n\n`
      + `Alongside the announcement, the club has revealed ten newly scouted players who are ready to play in the first team. They are English, apart from one Welshman, and were signed on three-year deals. The rest of the ${club.playerIds.length}-man squad has been put together around them.`,
    players: players.map(({ p, n }) => ({ id: p.id, note: n.note })),
  });
}
