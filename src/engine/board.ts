import { addNews, boardExpectation, club, ordinal, takeCharge, targetText, userClub } from './game.js';
import { spendingRule } from './finance.js';
import { leagueTable } from './league.js';
import { clamp, Rng } from './rng.js';
import type { Fixture, GameState } from './types.js';

/**
 * Board confidence, 0–100. Results move it a little every match, the league position against the
 * board's expectation moves it every month, and a club breaking its spending rule costs you too.
 * Two warnings come before the sack; after the sack you take another job.
 */
export interface Board {
  confidence: number;
  warnings: number;
  lastWarnDay: number;
  sacked: null | { clubId: number; day: number; reason: string; offers: number[]; /** The club as it was, when its place has since gone to another club. */ clubName?: string; colours?: [string, string] };
}

export function ensureBoard(state: GameState): Board {
  return (state.board ??= { confidence: 60, warnings: 0, lastWarnDay: -999, sacked: null });
}

export function confidenceWord(c: number): string {
  if (c >= 80) return 'Delighted';
  if (c >= 62) return 'Happy';
  if (c >= 45) return 'Satisfied';
  if (c >= 35) return 'Concerned';
  if (c >= 22) return 'Angry';
  return 'Considering your future';
}

const WARN_1 = 35;
const WARN_2 = 25;
const SACK_AT = 12;
const MIN_LEAGUE_GAMES = 8;

/** The manager's league games played this season. */
function leagueGames(state: GameState): number {
  return state.fixtures.filter((f) => f.result && f.comp === userClub(state).leagueId && (f.homeId === state.userClubId || f.awayId === state.userClubId)).length;
}

/** A match's effect: better than expected lifts confidence, worse lowers it. */
export function boardAfterMatch(state: GameState, f: Fixture): void {
  const b = ensureBoard(state);
  if (b.sacked || !f.result) return;
  const home = f.homeId === state.userClubId;
  const me = userClub(state);
  const opp = club(state, home ? f.awayId : f.homeId);
  const gf = home ? f.result.hg : f.result.ag;
  const ga = home ? f.result.ag : f.result.hg;
  const score = gf > ga ? 1 : gf === ga ? 0.45 : 0;
  const expected = clamp(0.5 + (me.reputation - opp.reputation) * 0.06 + (home ? 0.04 : -0.04), 0.12, 0.88);
  const league = f.comp === me.leagueId;
  const weight = league ? 1 : f.comp === 'UCL' || f.comp === 'UEL' || f.comp === 'UECL' ? 0.9 : 0.7;
  let delta = (score - expected) * 9 * weight;
  if (gf - ga <= -4) delta -= 1.5; // a hammering is remembered
  // The higher the board's opinion, the less a good result adds.
  if (delta > 0) delta *= clamp((100 - b.confidence) / 50, 0.15, 1);
  b.confidence = clamp(b.confidence + delta, 0, 100);
  review(state, false);
}

/** Once a month: league position against the board's expectation, and the finances. */
export function boardMonthly(state: GameState): void {
  const b = ensureBoard(state);
  if (b.sacked) return;
  const me = userClub(state);
  const games = leagueGames(state);
  if (games >= 6) {
    const t = leagueTable(state, me.leagueId);
    const pos = t.findIndex((r) => r.clubId === me.id) + 1;
    const target = boardExpectation(state, me.id);
    b.confidence = clamp(b.confidence + clamp((target - pos) * 0.35, -3, 1.5), 0, 100);
  }
  if (b.confidence > 75) b.confidence -= (b.confidence - 75) * 0.15; // the honeymoon fades
  const rule = spendingRule(state, me);
  if (!rule.ok) b.confidence = clamp(b.confidence - 5, 0, 100);
  else if (rule.used > 0.85) b.confidence = clamp(b.confidence - 1.5, 0, 100);
  if (b.confidence > 60 && b.warnings > 0) b.warnings--; // trust rebuilt
  review(state, false);
}

/** End of season: the verdict moves confidence a lot. */
export function boardSeasonEnd(state: GameState, pos: number): void {
  const b = ensureBoard(state);
  if (b.sacked) return;
  const target = boardExpectation(state, state.userClubId);
  const delta = pos <= target - 3 ? 12 : pos <= target + 1 ? 4 : pos <= target + 3 ? -6 : -14;
  b.confidence = clamp(b.confidence + delta, 0, 100);
  review(state, true);
}

function review(state: GameState, seasonEnd: boolean): void {
  const b = ensureBoard(state);
  const me = userClub(state);
  const day = state.day;
  const goal = targetText(state, me.id).toLowerCase();
  if (b.warnings === 0 && b.confidence < WARN_1) {
    b.warnings = 1;
    b.lastWarnDay = day;
    addNews(state, { kind: 'board', title: 'The board are concerned', body: `The ${me.name} board have called you in. They expected you to ${goal} and are worried about results and the direction of the club. Improve, or your position will come under pressure.` });
  } else if (b.warnings === 1 && b.confidence < WARN_2 && day - b.lastWarnDay >= 21) {
    b.warnings = 2;
    b.lastWarnDay = day;
    addNews(state, { kind: 'board', title: 'Final warning from the board', body: `The board say they have lost patience. Results must improve immediately: another poor run and they will look for a new manager.` });
  } else if (b.warnings >= 2 && b.confidence <= SACK_AT && day - b.lastWarnDay >= 14 && (seasonEnd || leagueGames(state) >= MIN_LEAGUE_GAMES)) {
    sack(state);
  }
}

function sack(state: GameState): void {
  const b = ensureBoard(state);
  const me = userClub(state);
  const rng = new Rng(state.rngState ^ 0x5ac4 ^ state.day);
  const pool = state.clubs
    .filter((c) => !c.external && c.id !== me.id && c.reputation <= me.reputation + 0.5 && c.reputation >= me.reputation - 3)
    .sort((x, y) => y.reputation - x.reputation);
  const offers: number[] = [];
  // A varied set of jobs: shuffle the pool, then keep the first few from different leagues where possible.
  const shuffled = rng.shuffle([...pool]);
  const leagues = new Set<string>();
  for (const c of shuffled) if (offers.length < 5 && !leagues.has(c.leagueId)) { offers.push(c.id); leagues.add(c.leagueId); }
  for (const c of shuffled) if (offers.length < 5 && !offers.includes(c.id)) offers.push(c.id);
  state.rngState = rng.state;
  b.sacked = { clubId: me.id, day: state.day, reason: 'Poor results and the board losing faith in you', offers };
  addNews(state, { kind: 'board', title: `${state.managerName} sacked by ${me.name}`, body: `${me.name} have dismissed ${state.managerName} after a poor spell of results. Other clubs may still give you a chance.` });
}

/**
 * The manager's League Two club has been relegated out of the pyramid, into the National League,
 * which the game doesn't play. He leaves and is offered other jobs.
 */
export function sackRelegated(state: GameState, old: { clubId: number; name: string; colours: [string, string] }, poolName = 'National League', division = 'League Two', range: [number, number] = [1.3, 3.2]): void {
  const b = ensureBoard(state);
  const rng = new Rng(state.rngState ^ 0x7e11 ^ state.day);
  const pool = state.clubs
    .filter((c) => !c.external && c.id !== old.clubId && c.reputation <= range[1] && c.reputation >= range[0])
    .sort((x, y) => y.reputation - x.reputation);
  const offers: number[] = [];
  const shuffled = rng.shuffle([...pool]);
  const leagues = new Set<string>();
  for (const c of shuffled) if (offers.length < 5 && !leagues.has(c.leagueId)) { offers.push(c.id); leagues.add(c.leagueId); }
  for (const c of shuffled) if (offers.length < 5 && !offers.includes(c.id)) offers.push(c.id);
  state.rngState = rng.state;
  b.sacked = { clubId: old.clubId, day: state.day, reason: `Relegation to the ${poolName}`, offers, clubName: old.name, colours: old.colours };
  addNews(state, { kind: 'board', title: `${old.name} relegated to the ${poolName}`, body: `${old.name} finished in the ${division} relegation places and drop out of the professional game. Touchline doesn't play the ${poolName}, so the board have released you. Other clubs may still give you a chance.` });
}

/** Take a new job after being sacked. */
export function takeNewJob(state: GameState, clubId: number): boolean {
  const b = ensureBoard(state);
  if (!b.sacked || !b.sacked.offers.includes(clubId)) return false;
  const old = b.sacked.clubId;
  // Deals in progress for the old club fall through.
  for (const o of state.offers) {
    if ((o.buyerId === old || o.sellerId === old) && ['pending', 'accepted', 'countered', 'terms'].includes(o.status)) o.status = 'withdrawn';
  }
  const oldClub = club(state, old);
  oldClub.lineup = null;
  oldClub.bench = null;
  // His assistant stays behind; the new club has its own.
  delete oldClub.assistant;
  takeCharge(state, clubId, state.managerName);
  state.board = { confidence: 55, warnings: 0, lastWarnDay: -999, sacked: null };
  return true;
}

/** Text describing how the board sees things now, for Club Info. */
export function boardSummary(state: GameState): { confidence: number; word: string; warnings: number; target: string } {
  const b = ensureBoard(state);
  const me = userClub(state);
  const t = boardExpectation(state, me.id);
  return { confidence: Math.round(b.confidence), word: confidenceWord(b.confidence), warnings: b.warnings, target: `${targetText(state, me.id)} (around ${ordinal(t)})` };
}
