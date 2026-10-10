import { shiftAbility } from './attributes.js';
import {
  closeSeasonAccounts, fmtMoney, fmtWage, meritPayment, monthlyAccounts, PSR_LIMIT, recordGate, setBudgets, spendingRule, M, refreshWageBudget,
} from './finance.js';
import { assignSquadNumbers, createPlayer, emptyStats, fillSquad, giveContract, rollPotential, scheduleSeason } from './generate.js';
import { internationalDay, intlSummer, newIntlSeason } from './intl.js';
import { stadiumMonthly, stadiumSeasonEnd } from './stadium.js';
import { initScouting, learnFromMatch, payScouts, scoutingDay, scoutingSummer } from './scouting.js';
import { assistantOf, initAssistant, staffMonthly, staffSummer } from './staff.js';
import { aiListings, contractWarnings, makeFreeAgent, pruneMarket, releaseToFree, summerContracts, summerMarket, transferDay } from './transfers.js';
import { CONFIRM_AHEAD, confirmKickoffs } from './kickoffs.js';
import { comp, leagueTable } from './league.js';
import { matchStory, roundSummary } from './roundup.js';
import { aliveExternal, clubCupRuns, cupById, cupsAfterDay, europeanPlaces, knockoutRules, neutralVenue, resolveClashes, stageLabel } from './cups.js';
import { clearExternal, dropSquad, ensureSquad, EXT_BASE, isExtPlayer, strength } from './ext.js';
import { type MatchOutcome, MatchSim, type TeamSetup } from './match.js';
import { clamp, Rng } from './rng.js';
import { boardAfterMatch, boardMonthly, boardSeasonEnd, ensureBoard, sackRelegated } from './board.js';
import { addBan, addYellow, banKey, compLabel, refreshBans, serveBans, yellowLimit } from './discipline.js';
import { autoPickXI, resolveBench, resolveLineup } from './tactics.js';
import { REPORT_DAY, START_DAY } from './calendar.js';
import { flyingAntsWelcome } from './scenario.js';
import { abstractTable, buildPyramid, eflOptions, hasPyramid, LEVELS, level, promoteAndRelegate, PYRAMIDS, pyramidOf, COUNTRY_NAMES, startPlayoffs, tierOf, type MovementResult } from './pyramid.js';
import {
  afterMatchTraining, famWith, holidaySharp, individualWeek, newSeasonTraining, planOf, preseasonStop, scheduleFriendlies, trainingDay,
} from './training.js';
import type { Club, Fixture, GameState, Mentality, NewsItem, Player, Pos } from './types.js';
import { debrief } from './analysis.js';

export function club(state: GameState, id: number): Club {
  if (id > EXT_BASE) return state.extClubs.find((c) => c.id === id)!;
  return state.clubs[id - 1]?.id === id ? state.clubs[id - 1] : state.clubs.find((c) => c.id === id)!;
}

export function userClub(state: GameState): Club {
  return club(state, state.userClubId);
}

export function seasonLabel(state: GameState): string {
  return `${state.season}/${String((state.season + 1) % 100).padStart(2, '0')}`;
}

/* ───────────────────────── Calendar ───────────────────────── */

/** The calendar date of a season day (days since 1 August). */
export function dateOf(season: number, day: number): Date {
  return new Date(Date.UTC(season, 7, 1 + day));
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function dayLabel(season: number, day: number): string {
  return formatDate(dateOf(season, day));
}

/** The next day with any unplayed fixture, or null when the season is over. */
export function nextMatchDay(state: GameState): number | null {
  let best: number | null = null;
  for (const f of state.fixtures) if (!f.result && (best === null || f.day < best)) best = f.day;
  return best;
}

export function seasonOver(state: GameState): boolean {
  return nextMatchDay(state) === null;
}

/** The manager's next unplayed fixture. */
export function userNextFixture(state: GameState): Fixture | undefined {
  let best: Fixture | undefined;
  for (const f of state.fixtures) {
    if (f.result || (f.homeId !== state.userClubId && f.awayId !== state.userClubId)) continue;
    if (!best || f.day < best.day) best = f;
  }
  return best;
}

/* ───────────────────────── Board and news ───────────────────────── */

/** Where the board expects the club to finish in its league, from its reputation rank. */
export function boardExpectation(state: GameState, clubId: number): number {
  const c = club(state, clubId);
  const rivals = comp(state, c.leagueId).clubIds.map((id) => club(state, id)).sort((a, b) => b.reputation - a.reputation);
  return rivals.findIndex((x) => x.id === clubId) + 1;
}

export function expectationText(pos: number, size = 20): string {
  if (pos <= 2) return 'Win the title';
  if (pos <= 4) return 'Challenge for the title';
  if (pos <= Math.round(size * 0.4)) return 'Finish in the top half, pushing for Europe';
  if (pos <= size - 6) return 'A comfortable mid-table finish';
  return 'Avoid finishing in the bottom three';
}

/** The board's target for a club in words, for its division (promotion and the play-offs below the Premier League). */
export function targetText(state: GameState, clubId: number): string {
  const c = club(state, clubId);
  const pos = boardExpectation(state, clubId);
  const size = leagueSize(state, clubId);
  if (tierOf(c.leagueId) === 1) return expectationText(pos, size);
  if (pos <= 2) return 'Win promotion';
  if (pos <= 6) return 'Reach the play-offs';
  if (pos <= Math.round(size * 0.5)) return 'Finish in the top half';
  if (pos <= size - 7) return 'A comfortable mid-table finish';
  return 'Avoid relegation';
}

export function leagueSize(state: GameState, clubId: number): number {
  return comp(state, club(state, clubId).leagueId).clubIds.length;
}

export function addNews(state: GameState, item: Omit<NewsItem, 'id' | 'season' | 'day' | 'read'>): void {
  state.news.unshift({ ...item, id: state.nextNewsId++, season: state.season, day: state.day, read: false });
  if (state.news.length > 150) state.news.length = 150;
}

/** The assistant's debrief of the manager's match, as a message (the full card is drawn from the fixture). */
function debriefNews(state: GameState, f: Fixture): void {
  const d = debrief(state, f);
  if (!d) return;
  const r = f.result!;
  const body = [`${d.label}.`, ...d.points, `What worked: ${d.positives.join(' ')}`, `What didn't: ${d.concerns.join(' ')}`, d.nextLabel, ...d.next].join('\n\n');
  addNews(state, {
    kind: 'result',
    title: `Debrief: ${club(state, f.homeId).name} ${r.hg}-${r.ag} ${club(state, f.awayId).name}`,
    tag: `From ${assistantOf(state).name}, ${assistantOf(state).caretaker ? 'caretaker assistant' : 'assistant manager'}`,
    body,
    debrief: f.id,
  });
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ───────────────────────── Match setup ───────────────────────── */

function aiMentality(me: Club, opp: Club, home: boolean): Mentality {
  const diff = me.reputation - opp.reputation + (home ? 0.8 : -0.8);
  if (diff >= 2.5) return 'attacking';
  if (diff <= -2.5) return 'defensive';
  return 'balanced';
}

/**
 * AI clubs rest their stars for early domestic cup ties against much weaker opposition, and
 * for league games squeezed between European nights; tired players are rested anyway.
 */
function rotationXI(state: GameState, c: Club, opp: Club, fixture?: Fixture): number[] | null {
  if (!fixture || c.id === state.userClubId || c.external) return null;
  const cup = cupById(state, fixture.comp);
  if (!cup || cup.kind !== 'cup') return null;
  const lateRound = fixture.round >= cup.rounds.length - 2;
  if (lateRound || strength(c) - strength(opp) < 1.8) return null;
  const squad = c.playerIds.map((id) => state.players[id]).filter((p) => !p.injury && p.suspended === 0);
  const outfield = squad.filter((p) => !(p.pos.GK ?? 0)).sort((a, b) => b.ca - a.ca);
  const rest = new Set(outfield.slice(0, strength(c) - strength(opp) >= 3 ? 6 : 4).map((p) => p.id));
  const keepers = squad.filter((p) => (p.pos.GK ?? 0) >= 15).sort((a, b) => b.ca - a.ca);
  if (keepers.length >= 2) rest.add(keepers[0].id);
  return autoPickXI(c, state.players, rest);
}

export function teamSetup(state: GameState, c: Club, opp: Club, home: boolean, fixture?: Fixture): TeamSetup {
  const xi = rotationXI(state, c, opp, fixture) ?? resolveLineup(c, state.players);
  const isUser = c.id === state.userClubId;
  const tactics = { ...c.tactics };
  if (!isUser) tactics.mentality = aiMentality(c, opp, home);
  return {
    club: c,
    xi,
    bench: resolveBench(c, state.players, xi),
    formation: c.tactics.formation,
    tactics,
    ai: !isUser,
    prep: isUser ? { fam: famWith(planOf(state, c), c.tactics.formation), drills: planOf(state, c).drills } : undefined,
    runs: isUser ? c.runs : undefined,
    assistant: isUser && c.assistant ? { id: c.assistant.id, read: c.assistant.read, judge: c.assistant.judge } : undefined,
  };
}

/* ───────────────────────── Development ───────────────────────── */

/** Share of a season's development that happens over the summer; the rest comes month by month. */
const SUMMER_SHARE = 0.32;
const MONTHLY_SHARE = (1 - SUMMER_SHARE) / 9;

/**
 * How much a player's ability moves over a share of a season. Young players grow towards
 * their potential (faster with games and determination), players in their thirties decline.
 * `clubGames` is how many matches his club has played, to judge how often he plays.
 */
export function developmentDelta(rng: Rng, p: Player, clubGames: number, share: number): number {
  const games = p.stats.apps + p.stats.subApps * 0.4;
  const rate = clubGames > 0 ? games / clubGames : 0.5;
  const play = 0.7 + 0.6 * Math.min(1, rate * 1.5);
  const det = 0.8 + p.attrs.determination / 50;
  const room = p.pa - p.ca;
  let annual: number;
  if (p.age <= 20) annual = room * (0.26 + rng.next() * 0.26) * play * det;
  else if (p.age <= 23) annual = room * (0.22 + rng.next() * 0.24) * play * det;
  else if (p.age <= 27) annual = room * (0.14 + rng.next() * 0.2) * play * det;
  else if (p.age <= 30) annual = rng.int(-2, 2);
  else if (p.age <= 33) annual = -rng.int(2, 7);
  else annual = -rng.int(5, 12);
  const raw = annual * share;
  // Probabilistic rounding so small monthly changes still add up over a season.
  const whole = Math.trunc(raw);
  const frac = Math.abs(raw - whole);
  return whole + (rng.chance(frac) ? Math.sign(raw) : 0);
}

function clubGamesPlayed(state: GameState): Map<number, number> {
  const games = new Map<number, number>();
  for (const f of state.fixtures) {
    if (!f.result) continue;
    games.set(f.homeId, (games.get(f.homeId) ?? 0) + 1);
    games.set(f.awayId, (games.get(f.awayId) ?? 0) + 1);
  }
  return games;
}

/** Monthly training progress, reported for the manager's youngsters. */
function monthlyDevelopment(state: GameState, rng: Rng): void {
  const risers: string[] = [];
  const games = clubGamesPlayed(state);
  for (const p of Object.values(state.players)) {
    if (p.clubId === null || isExtPlayer(p)) continue;
    const before = p.ca;
    const delta = developmentDelta(rng, p, games.get(p.clubId) ?? 0, MONTHLY_SHARE);
    if (!delta) continue;
    shiftAbility(rng, p, delta);
    if (p.ca > p.pa) p.pa = p.ca;
    if (p.clubId === state.userClubId && p.age <= 23 && p.ca - before >= 3) risers.push(`${p.firstName} ${p.lastName}`.trim());
  }
  if (risers.length) {
    addNews(state, {
      kind: 'training',
      title: 'Coaches\' monthly report',
      body: `Your coaches are pleased with the progress of ${risers.slice(0, 4).join(', ')}${risers.length > 4 ? ` and ${risers.length - 4} others` : ''} in training this month.`,
    });
  }
}

/* ───────────────────────── Days ───────────────────────── */

/**
 * Move the calendar on to `day`: players recover, injuries heal, morale settles,
 * and at each new month the coaches report on development.
 */
function advanceTo(state: GameState, day: number, rng: Rng): void {
  const elapsed = Math.max(0, day - state.day);
  if (!elapsed) return;
  const oldMonth = dateOf(state.season, state.day).getUTCMonth();
  const newMonth = dateOf(state.season, day).getUTCMonth();
  const players = Object.values(state.players);
  // Day by day: recovery, the transfer market, internationals, and the monthly accounts when a new month starts.
  const start = state.day;
  for (let d = start + 1; d <= day; d++) {
    const prevMonth = dateOf(state.season, d - 1).getUTCMonth();
    state.day = d;
    for (const p of players) {
      p.condition = Math.min(100, p.condition + (9 + p.attrs.naturalFitness * 0.7) / 7);
      p.morale += (62 - p.morale) * 0.0073;
      if (p.injury) {
        p.injury.days -= 1;
        if (p.injury.days <= 0) {
          if (p.clubId === state.userClubId) addNews(state, { kind: 'injury', title: `${p.firstName} ${p.lastName} is back in training`.trim(), body: `${p.lastName} has recovered and is available for selection.` });
          p.injury = null;
        }
      }
    }
    const month = dateOf(state.season, d).getUTCMonth();
    if (month !== prevMonth) {
      monthlyAccounts(state, month);
      stadiumMonthly(state);
      payScouts(state);
      staffMonthly(state, rng);
      boardMonthly(state);
    }
    trainingDay(state, rng, d);
    if (d >= REPORT_DAY && ((d % 7) + 7) % 7 === 0 && state.userClubId) individualWeek(state, rng);
    transferDay(state, rng);
    scoutingDay(state, rng);
    internationalDay(state, rng);
  }
  state.day = day;
  if (oldMonth !== newMonth) monthlyDevelopment(state, rng);
}

export interface LiveRound {
  rng: Rng;
  day: number;
  matches: { fixture: Fixture; sim: MatchSim }[];
}

/** Set up every match on the next match day, ready to be stepped minute by minute. */
export function startDay(state: GameState): LiveRound {
  const rng = new Rng(state.rngState);
  const stop = preseasonStop(state);
  const next = nextMatchDay(state) ?? state.day;
  const day = stop !== null && stop < next ? stop : next;
  advanceTo(state, day, rng);
  refreshBans(state);
  const matches = state.fixtures
    .filter((f) => f.day === day && !f.result)
    .map((fixture) => {
      const h = club(state, fixture.homeId);
      const a = club(state, fixture.awayId);
      ensureSquad(state, h);
      ensureSquad(state, a);
      const isUser = fixture.homeId === state.userClubId || fixture.awayId === state.userClubId;
      const sim = new MatchSim(teamSetup(state, h, a, true, fixture), teamSetup(state, a, h, false, fixture), state.players, rng, {
        commentary: isUser,
        knockout: knockoutRules(state, fixture),
        neutral: neutralVenue(fixture),
        friendly: fixture.comp === 'FRI',
        ...eflOptions(fixture.comp),
      });
      return { fixture, sim };
    });
  return { rng, day, matches };
}

/** Play the rest of the day instantly and apply it to the game. */
export function playDay(state: GameState, live = startDay(state)): void {
  for (const m of live.matches) while (!m.sim.finished) m.sim.step();
  completeDay(state, live);
}

/**
 * Bring the calendar up to the manager's next match day, so the pre-match screen shows the
 * squad as it will be at kick-off: players back from international duty, injuries healed.
 * Nobody else plays before then (the next match day is his). Stops early, day by day, when
 * `stop` says something needs an answer first. Returns true once it has reached the match day.
 */
/** Move the calendar on to `day` without playing anything (never past the next match day). */
export function advanceCalendar(state: GameState, day: number): void {
  const until = Math.min(day, nextMatchDay(state) ?? day);
  if (until <= state.day) return;
  const rng = new Rng(state.rngState);
  advanceTo(state, until, rng);
  state.rngState = rng.state;
}

export function advanceToUserMatch(state: GameState, stop?: () => boolean): boolean {
  if (!userPlaysNext(state)) return false;
  const day = nextMatchDay(state)!;
  const rng = new Rng(state.rngState);
  while (state.day < day) {
    advanceTo(state, state.day + 1, rng);
    if (state.day < day && stop?.()) break;
  }
  state.rngState = rng.state;
  if (state.day < day) return false;
  recallForMatch(state);
  return true;
}

/**
 * The last resort for a club that can't raise eleven: national teams release players still
 * away on international duty, so a match is never lost to a shortage the manager can't fix.
 */
export function recallForMatch(state: GameState): void {
  const c = state.clubs.find((x) => x.id === state.userClubId);
  if (!c) return;
  const squad = c.playerIds.map((id) => state.players[id]).filter(Boolean);
  const fit = () => squad.filter((p) => !p.injury && p.suspended === 0 && !p.away);
  const hasKeeper = () => fit().some((p) => (p.pos.GK ?? 0) >= 15);
  const away = squad.filter((p) => p.away && !p.injury && p.suspended === 0).sort((a, b) => b.ca - a.ca);
  if (fit().length >= 11 && hasKeeper()) return;
  const back: Player[] = [];
  // A keeper first if there is none, then the best of the rest until there are eleven.
  if (!hasKeeper()) {
    const gk = away.find((p) => (p.pos.GK ?? 0) >= 15);
    if (gk) { gk.away = null; back.push(gk); }
  }
  for (const p of away) {
    if (fit().length >= 11) break;
    if (!p.away) continue;
    p.away = null;
    back.push(p);
  }
  if (back.length) {
    addNews(state, {
      kind: 'squad',
      title: `${back.length} player${back.length > 1 ? 's' : ''} released from international duty`,
      body: `With too few fit players for the next match, ${back.map((p) => p.lastName).join(', ')} ${back.length > 1 ? 'have' : 'has'} been released by ${back.length > 1 ? 'their national teams' : 'his national team'} and ${back.length > 1 ? 'are' : 'is'} available again.`,
    });
  }
}

/** Does the manager's club play on the next match day? */
export function userPlaysNext(state: GameState): boolean {
  const day = nextMatchDay(state);
  if (day === null) return false;
  const stop = preseasonStop(state);
  if (stop !== null && stop < day) return false; // the pre-season plan comes first
  return state.fixtures.some((f) => f.day === day && !f.result && (f.homeId === state.userClubId || f.awayId === state.userClubId));
}

/** Simulate days on which the manager's club has no match, stopping before its next one. Returns days played. */
export function playUntilUserMatch(state: GameState): number {
  let n = 0;
  while (!seasonOver(state) && !userPlaysNext(state)) {
    playDay(state);
    n++;
  }
  return n;
}

/** A friendly: fitness, sharpness and injuries only. No stats, cards, morale, gates or board reaction. */
function applyFriendly(state: GameState, fixture: Fixture, out: MatchOutcome): void {
  const r = out.summary;
  for (const side of [0, 1] as const) {
    const cid = side === 0 ? fixture.homeId : fixture.awayId;
    const started = r.lineups[side];
    const subbed = r.events.filter((e) => e.kind === 'sub' && e.side === side && e.otherId !== undefined).map((e) => e.otherId!);
    for (const id of [...started, ...subbed]) {
      const p = state.players[id];
      if (p) p.condition = out.conditions[id] ?? p.condition;
    }
    afterMatchTraining(state, cid, started, subbed, true);
  }
  for (const inj of out.injuries) {
    const p = state.players[inj.playerId];
    if (p) p.injury = { ...inj.injury };
  }
  if (fixture.homeId !== state.userClubId && fixture.awayId !== state.userClubId) {
    r.ratings = {};
    r.lineups = [[], []];
    r.events = [];
  }
}

function applyOutcome(state: GameState, fixture: Fixture, out: MatchOutcome): void {
  const r = out.summary;
  fixture.result = r;
  if (fixture.comp === 'FRI') return applyFriendly(state, fixture, out);
  if (!fixture.neutral) recordGate(club(state, fixture.homeId), r.attendance);
  if (fixture.homeId === state.userClubId || fixture.awayId === state.userClubId) {
    const oppSide = fixture.homeId === state.userClubId ? 1 : 0;
    learnFromMatch(state, r.lineups[oppSide], r.events.filter((e) => e.kind === 'sub' && e.side === oppSide && e.otherId !== undefined).map((e) => e.otherId!));
    const other = club(state, fixture.homeId === state.userClubId ? fixture.awayId : fixture.homeId);
    if (other.external) other.external.metUser = true;
  }
  const sides = [fixture.homeId, fixture.awayId];
  const goalsFor = [r.hg, r.ag];
  // League games also count towards the league's own statistics.
  const isLeague = state.comps.some((c) => c.id === fixture.comp);
  const each = (p: Player, fn: (s: Player['stats']) => void) => {
    fn(p.stats);
    if (isLeague) fn((p.lstats ??= emptyStats()));
  };

  for (const [pid, rating] of Object.entries(r.ratings)) {
    const p = state.players[Number(pid)];
    if (!p) continue;
    const side = r.lineups[0].includes(p.id) || r.events.some((e) => e.kind === 'sub' && e.otherId === p.id && e.side === 0) ? 0 : 1;
    const started = r.lineups[side].includes(p.id);
    // Minutes: from kick-off or the minute he came on, to the end or the minute he went off (or was sent off).
    const full = r.aet ? 120 : 90;
    const on = started ? 0 : Math.min(full, r.events.find((e) => e.kind === 'sub' && e.otherId === p.id)?.minute ?? full);
    const offAt = r.events.find((e) => (e.kind === 'sub' || e.kind === 'red') && e.playerId === p.id)?.minute;
    const mins = Math.max(1, Math.min(full, offAt ?? full) - on);
    each(p, (s) => {
      if (started) s.apps++;
      else s.subApps++;
      s.ratingSum += rating;
      s.mins = (s.mins ?? 0) + mins;
    });
    p.form.push(rating);
    if (p.form.length > 5) p.form.shift();
    p.condition = out.conditions[p.id] ?? p.condition;
    if (started && (p.pos.GK ?? 0) >= 15 && goalsFor[1 - side] === 0) each(p, (s) => s.cleanSheets++);
    const res = goalsFor[side] > goalsFor[1 - side] ? 5 : goalsFor[side] === goalsFor[1 - side] ? 1 : -5;
    p.morale = clamp(p.morale + res + (rating - 6.6) * 3, 15, 98);
  }
  if (r.motm >= 0 && state.players[r.motm]) each(state.players[r.motm], (s) => s.motm++);

  for (const side of [0, 1] as const) {
    const started = r.lineups[side];
    const subbed = r.events.filter((e) => e.kind === 'sub' && e.side === side && e.otherId !== undefined).map((e) => e.otherId!);
    afterMatchTraining(state, side === 0 ? fixture.homeId : fixture.awayId, started, subbed, false);
  }

  // Bans already being served count down by one for each match the club plays.
  serveBans(state, fixture);

  const yellowsThisMatch = new Set<number>();
  for (const e of r.events) {
    const p = state.players[e.playerId];
    if (!p) continue;
    if (e.kind === 'goal' || e.kind === 'pen') {
      each(p, (s) => s.goals++);
      if (e.otherId !== undefined && state.players[e.otherId]) each(state.players[e.otherId], (s) => s.assists++);
    } else if (e.kind === 'yellow') {
      p.stats.yellow++;
      yellowsThisMatch.add(p.id);
      addYellow(state, p, fixture.comp);
    } else if (e.kind === 'red') {
      p.stats.red++;
      addBan(p, fixture.comp, yellowsThisMatch.has(p.id) ? 1 : 3);
    }
  }
  for (const inj of out.injuries) {
    const p = state.players[inj.playerId];
    if (p) p.injury = { ...inj.injury };
  }

  // The rest of each squad: morale follows the team's result a little.
  sides.forEach((cid, i) => {
    const c = club(state, cid);
    const res = goalsFor[i] > goalsFor[1 - i] ? 2 : goalsFor[i] < goalsFor[1 - i] ? -2 : 0;
    for (const id of c.playerIds) if (!(id in r.ratings)) state.players[id].morale = clamp(state.players[id].morale + res - 0.5, 15, 98);
  });

  // Other clubs' matches keep only what reports and tables need, to keep saves small.
  const isUser = fixture.homeId === state.userClubId || fixture.awayId === state.userClubId;
  if (!isUser) {
    r.ratings = {};
    r.lineups = [[], []];
    r.events = r.events.filter((e) => e.kind !== 'sub' && e.kind !== 'injury');
  }
}

/** "Arsenal beat Wrexham 3-1", "Arsenal lost to Chelsea on penalties (1-1, 3-4 pens)". */
export function resultHeadline(state: GameState, f: Fixture, clubId: number): string {
  const r = f.result!;
  const isHome = f.homeId === clubId;
  const us = isHome ? r.hg : r.ag;
  const them = isHome ? r.ag : r.hg;
  const opp = club(state, isHome ? f.awayId : f.homeId).name;
  const me = club(state, clubId).name;
  if (r.pens) {
    const pu = isHome ? r.pens[0] : r.pens[1];
    const pt = isHome ? r.pens[1] : r.pens[0];
    return `${me} ${pu > pt ? 'beat' : 'lost to'} ${opp} on penalties (${us}-${them}, ${pu}-${pt} pens)`;
  }
  const verb = us > them ? 'beat' : us < them ? 'lost to' : 'drew with';
  return `${me} ${verb} ${opp} ${us}-${them}${r.aet ? ' after extra time' : ''}`;
}

export function completeDay(state: GameState, live: LiveRound): void {
  for (const m of live.matches) applyOutcome(state, m.fixture, m.sim.outcome());
  refreshBans(state);

  // Cups: ties settled, prize money, the next rounds drawn.
  const cupNews = cupsAfterDay(state, live.rng, live.matches.map((m) => m.fixture));
  playoffDraws(state, cupNews.news);

  // News for the manager's club.
  const uf = live.matches.find((m) => m.fixture.homeId === state.userClubId || m.fixture.awayId === state.userClubId)?.fixture;
  if (uf?.result && uf.comp === 'FRI') {
    const injured = uf.result.events.filter((e) => e.kind === 'injury').map((e) => state.players[e.playerId]).filter((p) => p && p.clubId === state.userClubId && p.injury);
    addNews(state, {
      kind: 'result',
      title: `Friendly: ${resultHeadline(state, uf, state.userClubId)}`,
      body: `A pre-season friendly, played for match fitness and to try things out.${injured.length ? ` ${injured.map((p) => `${p.lastName} was injured (${p.injury!.name.toLowerCase()}, about ${Math.max(1, Math.ceil(p.injury!.days / 7))} week${p.injury!.days > 7 ? 's' : ''})`).join('; ')}.` : ''}`,
    });
  } else if (uf?.result) {
    boardAfterMatch(state, uf);
    const cupNote = cupById(state, uf.comp) ? ` (${stageLabel(state, uf)})` : '';
    addNews(state, { kind: 'result', title: `${resultHeadline(state, uf, state.userClubId)}${cupNote}`, body: matchStory(state, uf).join(' ') });
    // The assistant's debrief goes on top: it's the one the manager will want to read.
    debriefNews(state, uf);
    for (const e of uf.result.events) {
      const p = state.players[e.playerId];
      if (!p || p.clubId !== state.userClubId) continue;
      if (e.kind === 'injury' && p.injury) {
        const wk = Math.max(1, Math.ceil(p.injury.days / 7));
        addNews(state, { kind: 'injury', title: `${`${p.firstName} ${p.lastName}`.trim()} injured`, body: `${p.lastName} picked up a ${p.injury.name.toLowerCase()} and will be out for about ${wk} week${wk > 1 ? 's' : ''}.` });
      }
      if (e.kind === 'red') {
        addNews(state, { kind: 'squad', title: `${p.lastName} suspended`, body: `${`${p.firstName} ${p.lastName}`.trim()} was sent off and will miss the next ${p.bans?.[banKey(uf.comp)] ?? 0} ${compLabel(state, banKey(uf.comp))} match${(p.bans?.[banKey(uf.comp)] ?? 0) > 1 ? 'es' : ''}.` });
      }
    }
    for (const id of userClub(state).playerIds) {
      const p = state.players[id];
      const key = banKey(uf.comp);
      const yc = p.ycs?.[key] ?? 0;
      if (yc > 0 && yc % yellowLimit(state, key) === 0 && uf.result.events.some((e) => e.kind === 'yellow' && e.playerId === id)) {
        addNews(state, { kind: 'squad', title: `${p.lastName} banned for one match`, body: `${`${p.firstName} ${p.lastName}`.trim()} has reached ${yc} ${compLabel(state, key)} bookings and misses the next ${compLabel(state, key)} match.` });
      }
    }
  }

  for (const n of cupNews.news) addNews(state, { ...n, link: { label: 'Cups', screen: 'cups' } });

  // Round-up of the manager's league once the matchday's weekend is over (games postponed
  // for cup ties don't hold it up).
  const myLeague = userClub(state).leagueId;
  const rounds = new Set(live.matches.filter((m) => m.fixture.comp === myLeague).map((m) => m.fixture.round));
  for (const r of rounds) {
    const list = state.fixtures.filter((f) => f.comp === myLeague && f.round === r);
    const count = new Map<number, number>();
    for (const f of list) count.set(f.weekend, (count.get(f.weekend) ?? 0) + 1);
    const main = [...count].sort((a, b) => b[1] - a[1])[0][0];
    if (list.some((f) => f.weekend === main && !f.result)) continue;
    if (!live.matches.some((m) => m.fixture.comp === myLeague && m.fixture.round === r && m.fixture.weekend === main)) continue;
    const { title, body } = roundSummary(state, myLeague, r, comp(state, myLeague).name);
    addNews(state, { kind: 'result', title, body });
  }

  // Outside clubs that are out of every cup lose their squads (unless they met the manager's club).
  const alive = aliveExternal(state);
  for (const c of state.extClubs) if (c.playerIds.length && !alive.has(c.id) && !c.external?.metUser) dropSquad(state, c);

  // Broadcasters confirm kick-off times about five weeks ahead.
  confirmKickoffs(state, live.rng, state.day + CONFIRM_AHEAD, (f) => {
    if (f.homeId !== state.userClubId && f.awayId !== state.userClubId) return;
    const h = club(state, f.homeId).name;
    const a = club(state, f.awayId).name;
    const dow = dateOf(state.season, f.day).getUTCDay();
    const tv = dow === 5 ? 'Friday night' : dow === 1 ? 'Monday night' : 'live';
    addNews(state, {
      kind: 'fixture',
      title: `${h} v ${a} moved for TV`,
      body: `${h} v ${a} has been selected for ${tv} TV coverage and will now kick off at ${f.time} on ${dayLabel(state.season, f.day)}.`,
    });
  });

  state.rngState = live.rng.state;
  if (seasonOver(state)) endOfSeasonNews(state);
}

/** A division's league games are over: draw its play-offs (news for the manager if his club is in them). */
function playoffDraws(state: GameState, news: { kind: NewsItem['kind']; title: string; body: string }[]): void {
  const me = state.userClubId;
  const made = startPlayoffs(state);
  if (!made.length) return;
  resolveClashes(state, made.flatMap((m) => m.fixtures));
  for (const { cup } of made) {
    const semi = cup.ties.filter((t) => t.round === 0);
    const nm = (id: number) => club(state, id).name;
    const first = state.fixtures.find((f) => f.id === semi[0].fixtureIds[0]);
    const when = first ? dayLabel(state.season, first.day) : '';
    news.push({
      kind: 'season',
      title: `${cup.name}: the semi-finals are set`,
      body: `${semi.map((t) => `${nm(t.awayId!)} v ${nm(t.homeId!)}`).join(' and ')} (first legs from ${when}). The final is at ${cup.rounds[1].venue}.`,
    });
    const mine = semi.find((t) => t.homeId === me || t.awayId === me);
    if (mine) {
      const opp = mine.homeId === me ? mine.awayId! : mine.homeId!;
      const spec = level(cup.id.slice(0, 3));
      const above = spec ? LEVELS.find((l) => l.country === spec.country && l.tier === spec.tier - 1)?.name : undefined;
      news.push({ kind: 'season', title: `${club(state, me).name} are in the play-offs`, body: `${club(state, me).name} finished in a play-off place and face ${nm(opp)} over two legs, with the final at ${cup.rounds[1].venue} and a place in the ${above ?? 'division above'} at stake.` });
    }
  }
}

function endOfSeasonNews(state: GameState): void {
  const me = userClub(state);
  const others: string[] = [];
  // Merit payments from each league's TV deal, by final position.
  for (const c of state.comps) {
    const t = leagueTable(state, c.id);
    t.forEach((row, i) => {
      const cl = club(state, row.clubId);
      const m = meritPayment(c.id, i + 1, t.length);
      cl.finance.ledger.prize += m;
      cl.finance.balance += m;
      if (cl.id === me.id) addNews(state, { kind: 'finance', title: `Merit payment: ${fmtMoney(m)}`, body: `${c.name} merit money for finishing ${ordinal(i + 1)} is ${fmtMoney(m)}, paid into the club's account.` });
    });
  }
  for (const c of state.comps) {
    const t = leagueTable(state, c.id);
    const champ = club(state, t[0].clubId);
    if (c.id === me.leagueId) {
      const pos = t.findIndex((r) => r.clubId === me.id) + 1;
      addNews(state, {
        kind: 'season',
        title: `${champ.name} are ${c.name} champions!`,
        body: `${champ.name} win the ${c.name} with ${t[0].pts} points. ${me.name} finished ${ordinal(pos)}.`,
      });
      const target = boardExpectation(state, me.id);
      const verdict = pos <= target - 3 ? 'The board are delighted with your work this season.'
        : pos <= target + 1 ? 'The board are satisfied with the season.'
        : pos <= target + 4 ? 'The board are disappointed and expect a big improvement.'
        : 'The board are extremely unhappy. Another season like this will cost you your job.';
      boardSeasonEnd(state, pos);
      stadiumSeasonEnd(state, me, pos, t.length);
      addNews(state, { kind: 'board', title: 'Board end-of-season review', body: `The board expected a finish around ${ordinal(target)}. You finished ${ordinal(pos)}. ${verdict}` });
    } else {
      others.push(`${c.name}: ${champ.name} (${t[0].pts} pts)`);
    }
  }
  addNews(state, { kind: 'season', title: 'Champions around Europe', body: `${others.join('. ')}.` });
  const cups = state.cups.filter((c) => c.winnerId).map((c) => `${c.name}: ${club(state, c.winnerId!).name}`);
  if (cups.length) addNews(state, { kind: 'cup', title: 'The season\'s cup winners', body: `${cups.join('. ')}.` });
  const europe = europeanPlaces(state, Object.fromEntries(state.comps.map((c) => [c.id, leagueTable(state, c.id).map((r) => r.clubId)])));
  const mine = (['UCL', 'UEL', 'UECL'] as const).find((k) => europe[k].includes(me.name));
  const names = { UCL: 'Champions League', UEL: 'Europa League', UECL: 'Conference League' };
  addNews(state, {
    kind: 'cup',
    title: mine ? `${me.name} qualify for the ${names[mine]}` : 'No European football next season',
    body: mine ? `${me.name} will play in next season's ${names[mine]} league phase.` : `${me.name} did not qualify for Europe this time.`,
  });
}

/* ───────────────────────── New season ───────────────────────── */

/** Ageing, development, retirements, youth intake and a fresh fixture list. */
export function startNewSeason(state: GameState): void {
  const rng = new Rng(state.rngState);
  const me = userClub(state);
  const leagueBefore = me.leagueId;

  // A career saved before the lower leagues gets them now, with last season decided on strength alone.
  const decided: Record<string, number[]> = {};
  const missing = PYRAMIDS.filter((py) => !hasPyramid(state, py.country)).map((py) => py.country);
  if (missing.length) {
    buildPyramid(state, state.seed ^ state.season);
    for (const l of LEVELS.filter((x) => x.tier > 1 && missing.includes(x.country))) decided[l.id] = abstractTable(state, rng, state.comps.find((c) => c.id === l.id)!.clubIds);
  }
  const finalOrder = (id: string): number[] => decided[id] ?? leagueTable(state, id).map((r) => r.clubId);

  // Record the season.
  const champions: Record<string, number> = {};
  for (const c of state.comps) champions[c.id] = finalOrder(c.id)[0];
  const myTable = leagueTable(state, me.leagueId);
  let top: Player | null = null;
  for (const p of Object.values(state.players)) if (p.clubId && !isExtPlayer(p) && club(state, p.clubId).leagueId === me.leagueId && (!top || (p.lstats?.goals ?? 0) > (top.lstats?.goals ?? 0))) top = p;
  const cupsWon: Record<string, string> = {};
  for (const cup of state.cups) if (cup.winnerId) cupsWon[cup.id] = club(state, cup.winnerId).name;
  state.history.push({
    season: state.season,
    champions,
    userClubId: me.id,
    userComp: me.leagueId,
    userPosition: myTable.findIndex((r) => r.clubId === me.id) + 1,
    userPoints: myTable.find((r) => r.clubId === me.id)!.pts,
    topScorerName: top ? `${top.firstName} ${top.lastName}`.trim() : '-',
    topScorerClubId: top?.clubId ?? 0,
    topScorerGoals: top?.lstats?.goals ?? 0,
    cups: cupsWon,
  });

  // The June internationals (results and caps; the players are on holiday).
  intlSummer(state, rng);

  // Next season's European places, and the seedings the cup draws use.
  const tables: Record<string, number[]> = {};
  for (const c of state.comps) tables[c.id] = finalOrder(c.id);
  state.europe = europeanPlaces(state, tables);
  state.lastRanks = { ...tables };
  const cdrFinal = cupById(state, 'CDR')?.ties.find((t) => t.round === 5 && t.winnerId);
  if (cdrFinal) state.lastRanks['CDR-final'] = [cdrFinal.winnerId!, cdrFinal.winnerId === cdrFinal.homeId ? cdrFinal.awayId! : cdrFinal.homeId!].filter((id) => id < EXT_BASE);
  // Silverware lifts a club's standing.
  for (const cup of state.cups) {
    if (!cup.winnerId || cup.winnerId > EXT_BASE) continue;
    const bonus = cup.id === 'UCL' ? 0.35 : cup.id === 'UEL' ? 0.2 : cup.id === 'UECL' ? 0.12 : 0.06;
    const w = club(state, cup.winnerId);
    w.reputation = clamp(w.reputation + bonus, 0.7, 10);
  }
  clearExternal(state);
  const players = Object.values(state.players);

  // Reputation drifts with results within each league.
  for (const c of state.comps) {
    finalOrder(c.id).forEach((id, i) => {
      const cl = club(state, id);
      const expected = boardExpectation(state, cl.id);
      cl.reputation = clamp(cl.reputation + (expected - (i + 1)) * 0.06, 0.7, 10);
    });
  }

  const userNews: string[] = [];

  // Contracts: loans end, free transfers, renewals.
  summerContracts(state, rng, userNews);

  // The rest of the financial year (June and July), then the accounts and spending rules.
  // (A season that ran into June, for a European final, has already paid June.)
  const month = dateOf(state.season, state.day).getUTCMonth();
  for (const m of [5]) {
    if (m <= month) continue;
    monthlyAccounts(state, m);
    payScouts(state);
  }
  for (const cl of state.clubs) {
    const f = cl.finance;
    const rule = spendingRule(state, cl);
    const profit = closeSeasonAccounts(state, cl);
    f.deduction = 0;
    if (cl.leagueId === 'ENG') {
      const loss = -f.history.slice(-3).reduce((sum, h) => sum + h.profit, 0);
      if (loss > PSR_LIMIT) {
        f.deduction = Math.min(10, 6 + Math.floor((loss - PSR_LIMIT) / (15 * M)));
        const text = `${cl.name} lost ${fmtMoney(loss)} over three seasons, more than the ${fmtMoney(PSR_LIMIT)} PSR allows, and start next season on minus ${f.deduction} points.`;
        if (cl.id === me.id) addNews(state, { kind: 'finance', title: `PSR breach: ${f.deduction}-point deduction`, body: text });
        else if (cl.leagueId === me.leagueId) addNews(state, { kind: 'finance', title: `${cl.name} docked ${f.deduction} points`, body: text });
      }
    } else if (cl.id === me.id && !rule.ok) {
      addNews(state, { kind: 'finance', title: `${rule.name}: over the limit`, body: `${rule.text} The board have cut the transfer budget until costs come down.` });
    }
    if (cl.id === me.id) userNews.push(`Last season the club made a ${profit >= 0 ? 'profit' : 'loss'} of ${fmtMoney(Math.abs(profit))}.`);
  }
  const games = clubGamesPlayed(state);
  for (const p of players) {
    if (p.clubId === null) continue;
    const apps = p.stats.apps + p.stats.subApps;
    if (apps) {
      p.career.push({ season: state.season, clubId: p.clubId, apps, goals: p.stats.goals, avgRating: Math.round((p.stats.ratingSum / apps) * 100) / 100 });
    }
    const before = p.ca;
    const delta = developmentDelta(rng, p, games.get(p.clubId) ?? 0, SUMMER_SHARE);
    if (delta !== 0) {
      shiftAbility(rng, p, delta);
      if (p.ca > p.pa) p.pa = p.ca;
      if (p.clubId === me.id && p.ca - before >= 8 && p.age >= 17) userNews.push(`${`${p.firstName} ${p.lastName}`.trim()} (${p.age}) has made a big step forward over the summer.`);
    }
    p.age++;
    p.stats = emptyStats();
    p.lstats = emptyStats();
    p.form = [];
    p.suspended = 0;
    p.bans = {};
    p.ycs = {};
    p.condition = 100;
    p.injury = null;
    p.morale = 60 + rng.int(0, 15);
  }

  // Retirements.
  for (const p of Object.values(state.players)) {
    if (p.clubId === null) continue;
    const chance = p.age >= 39 ? 1 : p.age >= 34 ? (p.age - 33) * 0.17 + (p.ca < 110 ? 0.15 : 0) : 0;
    if (rng.chance(chance)) {
      const c = club(state, p.clubId);
      c.playerIds = c.playerIds.filter((id) => id !== p.id);
      if (c.id === me.id) userNews.push(`${`${p.firstName} ${p.lastName}`.trim()} has retired at ${p.age}.`);
      delete state.players[p.id];
    }
  }

  // Promotion and relegation, the moment the season's tables are final.
  const moved = promoteAndRelegate(state, rng, tables);
  movementNews(state, moved, leagueBefore, tables);

  // Youth intake and squad upkeep.
  for (const c of state.clubs) {
    const nation = comp(state, c.leagueId).nation;
    const intake = rng.int(2, 4);
    const youths: string[] = [];
    for (let i = 0; i < intake; i++) {
      const pos = rng.pick<Pos>(['GK', 'DC', 'DR', 'DL', 'DM', 'MC', 'MC', 'MR', 'ML', 'AMC', 'AMR', 'AML', 'ST', 'ST']);
      const ca = clamp(Math.round(40 + c.reputation * 4 + rng.normal() * 9), 25, 110);
      const pa = clamp(rollPotential(rng, ca, 16) + Math.round(c.reputation * 1.5), ca, 200);
      const p = createPlayer(rng, state, { pos, ca, pa, age: 16, clubId: c.id, nation });
      state.players[p.id] = p;
      c.playerIds.push(p.id);
      giveContract(state, p, c, 4);
      youths.push(`${p.firstName} ${p.lastName} (${pos})`);
    }
    if (c.id === me.id) userNews.push(`Youth intake: ${youths.join(', ')} join the squad.`);

    // AI clubs release their weakest players to keep a squad of 30.
    if (c.id !== me.id) {
      const squad = c.playerIds.map((id) => state.players[id]).filter((p) => !p.loan).sort((a, b) => a.ca + (a.pa - a.ca) * 0.5 - (b.ca + (b.pa - b.ca) * 0.5));
      while (c.playerIds.length > 30 && squad.length) makeFreeAgent(state, squad.shift()!);
    }
    const signed = fillSquad(rng, state, c, nation);
    if (c.id === me.id) for (const p of signed) userNews.push(`Your assistant signed ${`${p.firstName} ${p.lastName}`.trim()} on a free transfer to cover a gap in the squad.`);
    c.lineup = null;
    c.bench = null;
    assignSquadNumbers(c, state.players);
  }

  state.season++;
  state.day = START_DAY;
  scheduleSeason(state, rng);
  scheduleFriendlies(state, rng);
  newIntlSeason(state, rng);
  newSeasonTraining(state);
  // The squad is on holiday: July's and August's accounts follow as the calendar moves on.
  for (const p of Object.values(state.players)) p.sharp = holidaySharp(rng, p);
  for (const c of state.clubs) setBudgets(state, c);
  summerMarket(state, rng);
  for (const c of state.clubs) {
    assignSquadNumbers(c, state.players);
    setBudgets(state, c);
  }
  pruneMarket(state);
  aiListings(state);
  scoutingSummer(state, rng);
  staffSummer(state);
  state.rngState = rng.state;

  const target = boardExpectation(state, userClub(state).id);
  if (!state.board?.sacked) addNews(state, {
    kind: 'season',
    title: `Welcome to the ${seasonLabel(state)} season`,
    body: [...userNews, `The board's target: ${targetText(state, me.id).toLowerCase()} (around ${ordinal(target)}).`].join(' '),
  });
  budgetNews(state);
  cupEntryNews(state);
  contractWarnings(state);
}

/** The stories after a round of promotion and relegation: one for the world, and the manager's own club's fate. */
function movementNews(state: GameState, r: MovementResult, before: string, tables: Record<string, number[]>): void {
  state.movements = [...(state.movements ?? []), r.movement].slice(-10);
  const moves = r.movement.moves;
  const names = (list: [string, string, string][]) => list.map((m) => m[0]).join(', ');
  const lines: string[] = [];
  for (const py of PYRAMIDS) {
    const played = py.levels.filter((l) => state.comps.some((c) => c.id === l.id));
    if (played.length < 2) continue;
    const parts: string[] = [];
    for (let i = 0; i < played.length - 1; i++) {
      const top = played[i].name;
      const next = played[i + 1].name;
      const up = moves.filter((m) => m[1] === next && m[2] === top);
      const down = moves.filter((m) => m[1] === top && m[2] === next);
      if (up.length || down.length) parts.push(`${top}: relegated ${names(down)}. Promoted from the ${next}: ${names(up)}.`);
    }
    const bottom = played[played.length - 1].name;
    const outs = moves.filter((m) => m[1] === bottom && m[2] === py.pool);
    const ins = moves.filter((m) => m[1] === py.pool && m[2] === bottom);
    if (outs.length) parts.push(`${bottom}: relegated to the ${py.pool} ${names(outs)}. Promoted from it: ${names(ins)}.`);
    if (parts.length) lines.push(`${COUNTRY_NAMES[py.country]}. ${parts.join(' ')}`);
  }
  const po = Object.entries(r.movement.playoffs).map(([k, v]) => `${k} ${v}`).join(', ');
  if (po) lines.push(`Play-off winners: ${po}.`);
  addNews(state, { kind: 'season', title: 'Promotion and relegation', body: lines.join(' '), link: { label: 'League table', screen: 'table' } });

  if (r.userOut && r.userOld) {
    const py = pyramidOf(level(before)!.country)!;
    sackRelegated(state, r.userOld, py.pool, level(before)!.name, [py.entryRep[0] - 0.4, py.entryRep[1] + 1.1]);
    return;
  }
  const me = userClub(state);
  const now = tierOf(me.leagueId);
  const was = tierOf(before);
  const b = ensureBoard(state);
  if (now < was) {
    const pos = tables[before].indexOf(me.id) + 1;
    const how = pos <= (level(before)?.up ?? 0) ? `automatic promotion in ${ordinal(pos)} place` : 'a win in the play-offs';
    addNews(state, { kind: 'season', title: `Promoted! ${me.name} are going up`, body: `${me.name} won promotion to the ${comp(state, me.leagueId).name} through ${how}. The board are ecstatic, and the club's income will rise with the step up.` });
    b.confidence = clamp(b.confidence + 10, 0, 100);
    me.reputation = clamp(me.reputation + 0.3, 0.7, 10);
  } else if (now > was) {
    const para = tierOf(before) === 1 ? ' Parachute payments soften the fall for three seasons.' : '';
    addNews(state, { kind: 'season', title: `Relegated: ${me.name} are going down`, body: `${me.name} were relegated to the ${comp(state, me.leagueId).name}. The board are furious and income will fall.${para}` });
    b.confidence = clamp(b.confidence - 12, 0, 100);
    me.reputation = clamp(me.reputation - 0.3, 0.7, 10);
  }
}

/** Which cups the manager's club is in this season, and when each starts. */
export function cupEntryNews(state: GameState): void {
  const me = userClub(state);
  const lines: string[] = [];
  for (const run of clubCupRuns(state, me.id)) {
    const cup = run.cup;
    const f = state.fixtures.filter((x) => x.comp === cup.id && (x.homeId === me.id || x.awayId === me.id)).sort((a, b) => a.day - b.day)[0];
    if (cup.kind === 'euro') {
      const opps = state.fixtures.filter((x) => x.comp === cup.id && x.tieId === undefined && (x.homeId === me.id || x.awayId === me.id)).map((x) => club(state, x.homeId === me.id ? x.awayId : x.homeId).name);
      lines.push(`${cup.name} league phase: ${opps.join(', ')}.`);
    } else if (f) {
      const opp = club(state, f.homeId === me.id ? f.awayId : f.homeId);
      lines.push(`${cup.name} ${cup.rounds[f.round].name.toLowerCase()}: ${f.homeId === me.id ? `${opp.name} at home` : `away at ${opp.name}`} on ${dayLabel(state.season, f.day)}.`);
    } else {
      const r = cup.rounds.findIndex((x) => x.entrants.includes(me.id));
      if (r >= 0) lines.push(`${cup.name}: you enter in the ${cup.rounds[r].name.toLowerCase()} (${dayLabel(state.season, cup.rounds[r].days[0])}).`);
    }
  }
  if (lines.length) addNews(state, { kind: 'cup', title: 'Cup draws for the season', body: lines.join(' '), link: { label: 'Cups', screen: 'cups' } });
}

/** The board's budgets, as a message to the manager. */
export function budgetNews(state: GameState): void {
  const f = userClub(state).finance;
  addNews(state, {
    kind: 'finance',
    title: 'Transfer and wage budgets',
    body: `The board have made ${fmtMoney(f.transferBudget)} available for transfers, with a wage budget of ${fmtWage(f.wageBudget)}. The club has ${fmtMoney(f.balance)} in the bank. The summer window closes on 1 September.`,
    link: { label: 'Finances', screen: 'finances' },
  });
}

/** Called once after the manager picks a club. */
export function takeCharge(state: GameState, clubId: number, managerName: string): void {
  state.userClubId = clubId;
  state.managerName = managerName;
  ensureBoard(state);
  const c = userClub(state);
  planOf(state, c);
  if (state.day < REPORT_DAY + 40) scheduleFriendlies(state, new Rng(state.rngState ^ (clubId * 104729)));
  // The squad is the manager's to judge: nobody starts on the transfer or loan list.
  for (const id of c.playerIds) state.players[id].listed = null;
  const rng = new Rng(state.rngState ^ (clubId * 7919));
  initScouting(state, rng);
  initAssistant(state, rng);
  refreshWageBudget(state, c);
  const target = boardExpectation(state, clubId);
  const first = userNextFixture(state);
  addNews(state, {
    kind: 'board',
    title: `${managerName} appointed ${c.name} manager`,
    body: `${c.name} have named ${managerName} as their new manager. The board expect you to ${targetText(state, clubId).toLowerCase()} (around ${ordinal(target)}).${first ? ` Your first match is on ${dayLabel(state.season, first.day)}.` : ''}`,
  });
  budgetNews(state);
  cupEntryNews(state);
  contractWarnings(state);
  // Flying Ants mode: the club's own story, on top of the inbox.
  if (state.scenario && clubId === state.scenario.clubId) flyingAntsWelcome(state);
}

/** Release a player from the manager's squad (keeps at least 16); pays off half his remaining contract. */
export function releasePlayer(state: GameState, playerId: number): boolean {
  return releaseToFree(state, playerId) === null;
}

/** Drop bulky commentary from all but the most recent few matches to keep saves small. */
export function trimSave(state: GameState, keep = 6): void {
  const withText = state.fixtures.filter((f) => f.result?.commentary).sort((a, b) => b.day - a.day);
  for (const f of withText.slice(keep)) delete f.result!.commentary;
}
