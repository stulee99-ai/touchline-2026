/**
 * The assistant manager. Two ratings, 1–20:
 *  - Reading the game: how much he sees at half time and after the match, and how well he manages
 *    the touchline when the manager skips to full time.
 *  - Judging players: who he picks in the XI and on the bench, and who he brings on.
 * A top assistant does what the game's assistant has always done; a weaker one does it less well.
 * The manager can sack him (paying six months' wages), and hire someone from a list of candidates
 * that is drawn up afresh every month (or once a week on request). While the job is vacant the youth
 * coach stands in as caretaker.
 */
import { hashString } from './attributes.js';
import { NATIONS } from './data.js';
import { fmtMoney, fmtWage, niceWage } from './finance.js';
import { addNews, dayLabel, userClub } from './game.js';
import { leagueCountry } from './levels.js';
import { clamp, Rng } from './rng.js';
import type { Assistant, Club, GameState, StaffMarket } from './types.js';

/** Weeks of wages paid when an assistant is sacked. */
export const SACK_WEEKS = 26;
/** How often the manager can ask for a fresh list of candidates (days). */
export const SEARCH_GAP = 7;
const POOL_SIZE = 10;

/** One number for an assistant: the average of his two ratings. */
export const assistantQuality = (a: Pick<Assistant, 'read' | 'judge'>): number => (a.read + a.judge) / 2;

/** What an assistant of this quality earns at a club of this standing (weekly). */
export function assistantWage(a: Pick<Assistant, 'read' | 'judge'>, c: Club): number {
  const q = assistantQuality(a);
  return niceWage((300 + q * q * 25) * (0.6 + c.reputation * 0.25));
}

/** The best assistant who would take the job at this club: big clubs attract anyone. */
export function maxQualityFor(c: Club): number {
  return 8.5 + c.reputation * 1.05;
}

export function willJoin(a: Assistant, c: Club): boolean {
  return assistantQuality(a) <= maxQualityFor(c);
}

function nationFor(rng: Rng, c: Club): string {
  const home = leagueCountry(c.leagueId);
  if (rng.chance(0.7) && NATIONS.some((n) => n.code === home)) return home;
  return rng.pick(NATIONS).code;
}

function nameFrom(rng: Rng, nation: string): string {
  const pool = NATIONS.find((n) => n.code === nation) ?? NATIONS[0];
  return `${rng.pick(pool.first)} ${rng.pick(pool.last)}`;
}

function market(state: GameState): StaffMarket {
  state.staffMarket ??= { pool: [], season: state.season, day: -9999, nextId: 1 };
  return state.staffMarket;
}

function makeAssistant(rng: Rng, state: GameState, c: Club, quality: number): Assistant {
  const m = market(state);
  const nation = nationFor(rng, c);
  const read = clamp(Math.round(quality + rng.normal() * 2), 3, 20);
  const judge = clamp(Math.round(quality + rng.normal() * 2), 3, 20);
  const a: Assistant = { id: m.nextId++, name: nameFrom(rng, nation), nation, age: rng.int(34, 66), read, judge, wage: 0, joined: state.season };
  a.wage = assistantWage(a, c);
  return a;
}

/** The youth coach, standing in while there is no assistant. */
function caretaker(state: GameState, c: Club): Assistant {
  const rng = new Rng(hashString(`caretaker:${c.name}:${state.season}`));
  const nation = nationFor(rng, c);
  const a: Assistant = { id: market(state).nextId++, name: nameFrom(rng, nation), nation, age: rng.int(38, 60), read: rng.int(5, 7), judge: rng.int(5, 7), wage: 0, joined: state.season, caretaker: true };
  return a;
}

/**
 * A new manager inherits the club's assistant, as good as the club can attract. `name` keeps the
 * name an older save already used for him.
 */
export function initAssistant(state: GameState, rng: Rng, name?: string): void {
  const c = userClub(state);
  if (!c || c.assistant) return;
  const q = clamp(Math.round(6 + c.reputation * 0.9 + rng.normal() * 1.5), 5, 17);
  const a = makeAssistant(rng, state, c, q);
  if (name) a.name = name;
  c.assistant = a;
  refreshCandidates(state, rng);
}

/** The manager's assistant (a caretaker if the job is vacant). */
export function assistantOf(state: GameState): Assistant {
  const c = userClub(state);
  if (!c.assistant) c.assistant = caretaker(state, c);
  return c.assistant;
}

/** A fresh list of candidates: mostly people who would come, with a few who are out of reach. */
export function refreshCandidates(state: GameState, rng: Rng): void {
  const c = userClub(state);
  if (!c) return;
  const m = market(state);
  const top = maxQualityFor(c);
  m.pool = Array.from({ length: POOL_SIZE }, (_, i) => {
    // Two in ten are a cut above what the club can attract, so the manager sees what's out there.
    const q = i < 2 ? clamp(top + rng.int(1, 4), 6, 19) : clamp(Math.round(5 + rng.next() * (Math.min(18.5, top) - 5)), 4, 18);
    return makeAssistant(rng, state, c, q);
  }).sort((a, b) => assistantQuality(b) - assistantQuality(a));
  m.season = state.season;
  m.day = state.day;
}

/** Days until the manager can ask for a new list (0 = now). */
export function searchWait(state: GameState): number {
  const m = market(state);
  if (m.season !== state.season) return 0;
  return Math.max(0, m.day + SEARCH_GAP - state.day);
}

/** Ask for a new list of candidates. Returns an error message, or null. */
export function searchCandidates(state: GameState): string | null {
  const wait = searchWait(state);
  if (wait > 0) return `There's a new list of candidates on ${dayLabel(state.season, state.day + wait)}.`;
  const rng = new Rng(state.rngState ^ hashString(`staff:${state.season}:${state.day}`));
  refreshCandidates(state, rng);
  return null;
}

/** What sacking him costs: six months' wages (nothing for a caretaker). */
export function sackCost(a: Assistant): number {
  return a.caretaker ? 0 : a.wage * SACK_WEEKS;
}

function payOff(state: GameState, a: Assistant): number {
  const c = userClub(state);
  const cost = sackCost(a);
  if (cost) {
    c.finance.balance -= cost;
    c.finance.ledger.severance += cost;
  }
  return cost;
}

/** Sack the assistant: the youth coach takes over until someone is hired. */
export function sackAssistant(state: GameState): string | null {
  const c = userClub(state);
  const a = c.assistant;
  if (!a || a.caretaker) return 'There is no assistant to sack.';
  const cost = payOff(state, a);
  c.assistant = caretaker(state, c);
  addNews(state, {
    kind: 'board',
    title: `${a.name} leaves`,
    body: `${a.name} has left his job as assistant manager. Paying up his contract cost ${fmtMoney(cost)}. ${c.assistant.name}, the youth team coach, will stand in until you appoint someone.`,
    link: { label: 'Find an assistant', screen: 'club', tab: 'staff' },
  });
  return null;
}

/** Hire a candidate. Anyone already in the job leaves (and is paid off). */
export function hireAssistant(state: GameState, id: number): string | null {
  const c = userClub(state);
  const m = market(state);
  const a = m.pool.find((x) => x.id === id);
  if (!a) return 'He is no longer available.';
  if (!willJoin(a, c)) return `${a.name} isn't interested in joining a club of your standing.`;
  const old = c.assistant;
  const cost = old && !old.caretaker ? payOff(state, old) : 0;
  m.pool = m.pool.filter((x) => x !== a);
  a.wage = assistantWage(a, c);
  a.joined = state.season;
  delete a.caretaker;
  c.assistant = a;
  addNews(state, {
    kind: 'board',
    title: `${a.name} appointed assistant manager`,
    body: `${a.name} has joined as your assistant manager on ${fmtWage(a.wage)}.${old && !old.caretaker ? ` ${old.name} leaves; paying up his contract cost ${fmtMoney(cost)}.` : old ? ` ${old.name} goes back to the youth team.` : ''}`,
    link: { label: 'Staff', screen: 'club', tab: 'staff' },
  });
  return null;
}

/** Monthly: the assistant's wages, and a fresh list of candidates. */
export function staffMonthly(state: GameState, rng: Rng): void {
  if (!state.userClubId) return;
  const c = userClub(state);
  const a = c.assistant;
  if (a && !a.caretaker) {
    const w = (a.wage * 52) / 12;
    c.finance.balance -= w;
    c.finance.ledger.operating += w;
  }
  const m = market(state);
  if (m.season !== state.season || state.day - m.day >= 28) refreshCandidates(state, new Rng(rng.state ^ 0x5eed));
}

/** The summer: everyone is a year older. */
export function staffSummer(state: GameState): void {
  const c = state.userClubId ? userClub(state) : null;
  if (c?.assistant) c.assistant.age++;
  for (const a of state.staffMarket?.pool ?? []) a.age++;
}

/** Ratings in words, for the screens. */
export function ratingWord(v: number): string {
  return v >= 18 ? 'World class' : v >= 15 ? 'Excellent' : v >= 12 ? 'Good' : v >= 9 ? 'Average' : v >= 6 ? 'Poor' : 'Very poor';
}
