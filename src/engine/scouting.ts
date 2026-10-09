import { hashString } from './attributes.js';
import { NATIONS } from './data.js';
import { expectedRevenue, fmtMoney, niceMoney, niceWage } from './finance.js';
import { addNews, club, userClub } from './game.js';
import { clamp, Rng } from './rng.js';
import type { Assignment, AttrKey, Club, GameState, Player, Scout, ScoutReport, Scouting } from './types.js';

/**
 * Scouting and the fog of war. The manager knows his own players exactly. Everyone else
 * is seen through a mist: attributes as ranges, ability as an estimate. Famous players
 * and those in his own league are better known, playing against someone teaches a
 * little, and sending a scout teaches a lot. Scouts have their own judgement, so their
 * reports can be wrong; the better the scout, the closer to the truth.
 */

export const LEAGUE_NAMES: Record<string, string> = { ENG: 'England', ESP: 'Spain', GER: 'Germany', ITA: 'Italy', FRA: 'France', POR: 'Portugal' };

/* ───────────────────────── Knowledge ───────────────────────── */

/** What any manager knows about a player without scouting him: stars are known, unknowns aren't. */
export function commonKnowledge(state: GameState, p: Player): number {
  const me = state.clubs[state.userClubId - 1];
  const c = p.clubId ? state.clubs[p.clubId - 1] : null;
  // Everyone has seen the stars play; the elite are household names, known nearly inside out.
  let k = 8 + Math.max(0, p.ca - 90) * 0.33 + Math.max(0, p.ca - 150) * 2;
  if (c && me && c.leagueId === me.leagueId) k += 12;
  if (c && c.reputation >= 8) k += 8;
  // Regular internationals are on television every few months.
  k += Math.min(10, (p.intl?.caps ?? 0) / 5);
  if (p.age <= 19) k -= 8;
  return clamp(Math.round(k), 3, 88);
}

/** How well the manager knows a player, 0–100. His own players (and loanees) are an open book. */
export function knowledge(state: GameState, p: Player): number {
  if (!state.userClubId) return 100;
  if (p.clubId === state.userClubId || p.loan?.parentId === state.userClubId) return 100;
  // Anyone who has been at the club (on loan too) is known completely, wherever he goes.
  if (state.scouting?.former?.includes(p.id)) return 100;
  const gained = state.scouting?.known[p.id] ?? 0;
  // Other clubs' players are never known completely: overall ability is always a judgement.
  return clamp(Math.round(commonKnowledge(state, p) + gained), 0, 95);
}

/** A player leaving the manager's club (or a loan ending) stays an open book. */
export function rememberFormer(state: GameState, playerId: number): void {
  const sc = state.scouting;
  if (!sc || !state.userClubId) return;
  sc.former ??= [];
  if (!sc.former.includes(playerId)) sc.former.push(playerId);
}

export function learn(state: GameState, playerId: number, amount: number): void {
  const k = state.scouting.known;
  k[playerId] = Math.min(100, (k[playerId] ?? 0) + amount);
}

/**
 * Width of the range shown for an attribute: 8 points when unknown, exact when well scouted.
 * Knowledge also comes attribute by attribute: the better a player is known, the more of his
 * attributes are known exactly (from about a quarter at 40 to all of them at 85).
 */
function rangeWidth(k: number): number {
  return k >= 85 ? 0 : Math.round(8 * Math.pow(1 - k / 100, 1.15));
}

/**
 * The range an attribute is shown as. The true value always lies inside it, at a place
 * that's fixed for this player and attribute, so the range doesn't jump about between screens.
 */
export function attrRange(state: GameState, p: Player, key: AttrKey): [number, number] {
  const v = p.attrs[key];
  const k = knowledge(state, p);
  const w = rangeWidth(k);
  if (!w) return [v, v];
  if ((hashString(`exact:${p.id}:${key}`) % 1000) / 1000 < (k - 25) / 60) return [v, v];
  const off = hashString(`${p.id}:${key}`) % (w + 1);
  let lo = v - off;
  let hi = lo + w;
  if (lo < 1) { hi += 1 - lo; lo = 1; }
  if (hi > 20) { lo -= hi - 20; hi = 20; }
  return [Math.max(1, lo), Math.min(20, hi)];
}

/** The manager's estimate of a player's current ability: the latest scout report, else educated guesswork. */
export function estimatedCA(state: GameState, p: Player): number {
  const k = knowledge(state, p);
  if (k >= 100) return p.ca;
  const r = state.scouting?.reports[p.id];
  if (r && r.season >= state.season - 1) return r.estCA;
  // Guesswork: an error that shrinks with knowledge, fixed per player.
  const h = hashString(`ca:${p.id}`) / 4294967295;
  const err = (h * 2 - 1) * 28 * (1 - k / 100);
  return clamp(Math.round(p.ca + err), 20, 200);
}

/** Potential is only known from a scout's report (or for your own players, from your coaches). */
export function estimatedPA(state: GameState, p: Player): number | null {
  if (knowledge(state, p) >= 100) return p.pa;
  const r = state.scouting?.reports[p.id];
  return r && r.season >= state.season - 1 ? r.estPA : null;
}

/* ───────────────────────── Scouts ───────────────────────── */

const LEAGUE_NATION: Record<string, string> = { ENG: 'ENG', ESP: 'ESP', GER: 'GER', ITA: 'ITA', FRA: 'FRA', POR: 'POR' };

function scoutName(rng: Rng, nation: string): { name: string; nation: string } {
  const pool = NATIONS.find((n) => n.code === nation) ?? rng.pick(NATIONS);
  return { name: `${rng.pick(pool.first)} ${rng.pick(pool.last)}`, nation: pool.code };
}

export function scoutWage(s: Pick<Scout, 'judgeAbility' | 'judgePotential'>): number {
  const q = (s.judgeAbility + s.judgePotential) / 2;
  return niceWage(400 + q * q * 11);
}

function makeScout(rng: Rng, sc: Scouting, quality: number, speciality: string): Scout {
  const n = scoutName(rng, rng.chance(0.7) ? LEAGUE_NATION[speciality] ?? 'ENG' : rng.pick(NATIONS).code);
  const judgeAbility = clamp(Math.round(quality + rng.normal() * 2), 4, 20);
  const judgePotential = clamp(Math.round(quality + rng.normal() * 2.5), 4, 20);
  const s: Scout = { id: sc.nextId++, name: n.name, nation: n.nation, age: rng.int(32, 64), judgeAbility, judgePotential, speciality, wage: 0 };
  s.wage = scoutWage(s);
  return s;
}

export function maxScouts(c: Club): number {
  return Math.round(2 + c.reputation * 0.5);
}

/** Candidates to hire, of mixed quality and specialities. */
function refreshPool(rng: Rng, state: GameState): void {
  const sc = state.scouting;
  const leagues = state.comps.map((c) => c.id);
  sc.pool = Array.from({ length: 8 }, () => makeScout(rng, sc, rng.int(7, 18), rng.pick(leagues)));
}

/** A new manager inherits a scouting staff sized to the club. */
export function initScouting(state: GameState, rng: Rng): void {
  const sc: Scouting = { scouts: [], pool: [], assignments: [], reports: {}, known: {}, shortlist: [], nextId: 1 };
  state.scouting = sc;
  const me = state.clubs[state.userClubId - 1];
  if (!me) return;
  const n = Math.max(2, maxScouts(me) - 2);
  const leagues = [me.leagueId, ...state.comps.map((c) => c.id).filter((id) => id !== me.leagueId)];
  for (let i = 0; i < n; i++) sc.scouts.push(makeScout(rng, sc, clamp(Math.round(7 + me.reputation * 0.9 + rng.normal() * 1.5), 6, 17), leagues[i % leagues.length]));
  refreshPool(rng, state);
  setScoutBudget(state);
}

/** The board's scouting travel budget: a small share of revenue. */
export function setScoutBudget(state: GameState): void {
  const me = userClub(state);
  me.finance.scoutBudget = niceMoney(Math.max(150_000, expectedRevenue(state, me) * 0.0022));
}

export function hireScout(state: GameState, scoutId: number): string | null {
  const sc = state.scouting;
  const me = userClub(state);
  const s = sc.pool.find((x) => x.id === scoutId);
  if (!s) return 'He is no longer available.';
  if (sc.scouts.length >= maxScouts(me)) return `The board allow ${maxScouts(me)} scouts. Let one go first.`;
  sc.pool = sc.pool.filter((x) => x !== s);
  sc.scouts.push(s);
  addNews(state, { kind: 'squad', title: `${s.name} joins as a scout`, body: `${s.name} has joined your scouting staff on ${fmtMoney(s.wage)} a week. He knows ${LEAGUE_NAMES[s.speciality] ?? s.speciality} best.` });
  return null;
}

/** Letting a scout go costs a month's wages; his current assignment is cancelled. */
export function fireScout(state: GameState, scoutId: number): string | null {
  const sc = state.scouting;
  const s = sc.scouts.find((x) => x.id === scoutId);
  if (!s) return 'Not one of your scouts.';
  if (sc.scouts.length <= 1) return 'You need at least one scout.';
  const me = userClub(state);
  const pay = s.wage * 4;
  me.finance.balance -= pay;
  me.finance.ledger.scouting = (me.finance.ledger.scouting ?? 0) + pay;
  sc.scouts = sc.scouts.filter((x) => x !== s);
  sc.assignments = sc.assignments.filter((a) => a.scoutId !== s.id);
  return null;
}

/* ───────────────────────── Assignments ───────────────────────── */

export function currentAssignment(state: GameState, scoutId: number): Assignment | undefined {
  return state.scouting.assignments.find((a) => a.scoutId === scoutId);
}

function targetLeague(state: GameState, kind: Assignment['kind'], target: number | string): string | null {
  if (kind === 'league') return String(target);
  if (kind === 'club') return club(state, Number(target)).leagueId;
  const p = state.players[Number(target)];
  return p?.clubId ? club(state, p.clubId).leagueId : null;
}

/** Days and travel cost of an assignment. */
export function assignmentPlan(state: GameState, s: Scout, kind: Assignment['kind'], target: number | string): { days: number; cost: number } {
  const league = targetLeague(state, kind, target);
  const abroad = league !== null && league !== userClub(state).leagueId;
  const known = league === s.speciality;
  let days = kind === 'player' ? 7 : kind === 'club' ? 14 : 35;
  if (known) days = Math.round(days * 0.7);
  if (abroad) days += kind === 'player' ? 3 : 5;
  let cost = kind === 'player' ? 8_000 : kind === 'club' ? 25_000 : 80_000;
  if (abroad) cost *= 1.6;
  return { days, cost: niceMoney(cost) };
}

export function scoutBudgetLeft(state: GameState): number {
  const f = userClub(state).finance;
  return Math.max(0, (f.scoutBudget ?? 0));
}

/** Send a scout off. Returns an error message, or null. */
export function assign(state: GameState, scoutId: number, kind: Assignment['kind'], target: number | string, focus: Assignment['focus'] = 'best'): string | null {
  const sc = state.scouting;
  const s = sc.scouts.find((x) => x.id === scoutId);
  if (!s) return 'Pick one of your scouts.';
  if (currentAssignment(state, scoutId)) return `${s.name} is already on an assignment.`;
  if (kind === 'player') {
    const p = state.players[Number(target)];
    if (!p) return 'That player no longer exists.';
    if (p.clubId === state.userClubId) return 'He is your own player.';
  }
  const plan = assignmentPlan(state, s, kind, target);
  const f = userClub(state).finance;
  if ((f.scoutBudget ?? 0) < plan.cost) return `The scouting budget has ${fmtMoney(f.scoutBudget ?? 0)} left; this trip costs ${fmtMoney(plan.cost)}.`;
  f.scoutBudget = (f.scoutBudget ?? 0) - plan.cost;
  f.balance -= plan.cost;
  f.ledger.scouting = (f.ledger.scouting ?? 0) + plan.cost;
  sc.assignments.push({ id: sc.nextId++, scoutId, kind, target, focus, startDay: state.day, endDay: state.day + plan.days, season: state.season, cost: plan.cost });
  return null;
}

export function cancelAssignment(state: GameState, id: number): void {
  state.scouting.assignments = state.scouting.assignments.filter((a) => a.id !== id);
}

/** A description of what an assignment is watching. */
export function assignmentLabel(state: GameState, a: Assignment): string {
  if (a.kind === 'player') {
    const p = state.players[Number(a.target)];
    return p ? `Watching ${p.firstName} ${p.lastName}`.replace('  ', ' ') : 'Watching a player';
  }
  if (a.kind === 'club') return `Watching ${club(state, Number(a.target)).name}`;
  const focus = a.focus === 'young' ? 'young talent' : a.focus === 'value' ? 'bargains' : 'the best players';
  return `Touring ${LEAGUE_NAMES[String(a.target)] ?? a.target} for ${focus}`;
}

/* ───────────────────────── Reports ───────────────────────── */

const ATTR_WORDS: Partial<Record<AttrKey, string>> = {
  finishing: 'finishing', dribbling: 'dribbling', passing: 'passing', crossing: 'crossing', tackling: 'tackling', marking: 'marking',
  heading: 'heading', pace: 'pace', acceleration: 'acceleration', strength: 'strength', stamina: 'stamina', technique: 'technique',
  creativity: 'vision', decisions: 'decision-making', composure: 'composure', workRate: 'work rate', positioning: 'positioning',
  longShots: 'long shots', setPieces: 'set pieces', reflexes: 'reflexes', handling: 'handling', oneOnOnes: 'one-on-ones', aerialAbility: 'command of the area',
  anticipation: 'reading of the game', determination: 'determination', flair: 'flair', offTheBall: 'movement', agility: 'agility', jumping: 'leap',
};

/** The level of player a club needs: its first-team average, known exactly for the manager's own club. */
function levelOf(state: GameState, c: Club): number {
  const squad = c.playerIds.map((id) => state.players[id]).sort((a, b) => b.ca - a.ca).slice(0, 14);
  return squad.reduce((s, p) => s + p.ca, 0) / Math.max(1, squad.length);
}

/** Write a report as this scout sees the player. His errors are his own. */
export function writeReport(state: GameState, rng: Rng, s: Scout, p: Player): ScoutReport {
  const spec = p.clubId && club(state, p.clubId).leagueId === s.speciality ? 0.75 : 1;
  const caErr = rng.normal() * (21 - s.judgeAbility) * 1.1 * spec;
  const growth = Math.max(0, p.pa - p.ca);
  const paErr = rng.normal() * (21 - s.judgePotential) * 1.5 * spec * (p.age <= 23 ? 1 : 0.4);
  const estCA = clamp(Math.round(p.ca + caErr), 20, 200);
  const estPA = clamp(Math.round(Math.max(estCA, p.ca + growth + paErr)), estCA, 200);
  const me = userClub(state);
  const level = levelOf(state, me);
  const future = p.age <= 21 ? (estCA + estPA) / 2 : estCA;
  let verdict: ScoutReport['verdict'] = future >= level + 6 ? 'sign' : future >= level - 2 ? 'consider' : future >= level - 14 ? 'squad' : 'no';
  if (p.age <= 21 && estPA >= level + 4 && (verdict === 'squad' || verdict === 'no')) verdict = 'future';
  // Strengths and weaknesses, as the scout sees them (a judge of 16+ sees most things right).
  const keys = (Object.keys(ATTR_WORDS) as AttrKey[]).filter((k) => ((p.pos.GK ?? 0) >= 20) === ['reflexes', 'handling', 'oneOnOnes', 'aerialAbility'].includes(k) || ['pace', 'strength', 'stamina', 'decisions', 'composure', 'determination', 'passing'].includes(k));
  const noisy = keys.map((k) => ({ k, v: p.attrs[k] + rng.normal() * (21 - s.judgeAbility) * 0.12 })).sort((a, b) => b.v - a.v);
  const notes: string[] = [];
  const good = noisy.slice(0, 3).filter((x) => x.v >= 13).map((x) => ATTR_WORDS[x.k]!);
  const bad = noisy.slice(-2).filter((x) => x.v <= 10).map((x) => ATTR_WORDS[x.k]!);
  if (good.length) notes.push(`Strengths: ${good.join(', ')}.`);
  if (bad.length) notes.push(`Weaknesses: ${bad.join(', ')}.`);
  if (s.judgeAbility >= 12) {
    if (p.attrs.injuryProneness >= 15) notes.push('Picks up injuries too often.');
    if (p.attrs.consistency <= 7) notes.push('Blows hot and cold.');
    else if (p.attrs.consistency >= 16) notes.push('Very consistent.');
    if (p.attrs.importantMatches >= 16) notes.push('Rises to the big occasion.');
  }
  if (p.age <= 21 && estPA - estCA >= 20) notes.push('Has a lot of growing to do and could go a long way.');
  if (p.age >= 31) notes.push('Past his best years; a short-term option.');
  const report: ScoutReport = {
    playerId: p.id, scoutId: s.id, scoutName: s.name, season: state.season, day: state.day,
    estCA, estPA, verdict, notes, clubId: p.clubId,
  };
  state.scouting.reports[p.id] = report;
  return report;
}

export const VERDICT_WORD: Record<ScoutReport['verdict'], string> = {
  sign: 'Sign him: he would improve your first team',
  future: 'One for the future: not ready yet, but could become a first-teamer',
  consider: 'Worth considering: first-team standard for you',
  squad: 'A squad player for you, no more',
  no: 'Not good enough for your club',
};

/** Pick the players a league tour turns up. */
function leagueFinds(state: GameState, rng: Rng, s: Scout, league: string, focus: Assignment['focus']): Player[] {
  const me = userClub(state);
  const level = levelOf(state, me);
  const budget = me.finance.transferBudget;
  const players = Object.values(state.players).filter((p) => p.clubId && p.clubId !== me.id && club(state, p.clubId).leagueId === league && !p.loan);
  // The scout's own eye decides what looks good, so better scouts find better players.
  const eye = (p: Player) => p.ca + rng.normal() * (21 - s.judgeAbility) * 1.2 + (focus === 'young' ? (p.pa - p.ca) * (s.judgePotential / 20) : 0);
  let pool = players;
  if (focus === 'young') pool = players.filter((p) => p.age <= 21);
  else if (focus === 'value') pool = players.filter((p) => p.ca >= level - 10 && p.age <= 29);
  else pool = players.filter((p) => p.ca >= level - 8);
  const ranked = pool.map((p) => ({ p, e: eye(p) })).sort((a, b) => b.e - a.e).map((x) => x.p);
  if (focus === 'value') {
    return ranked.filter((p) => p.contractEnd <= state.season + 1 || p.listed === 'transfer' || p.releaseClause !== null || budget > 0).slice(0, 8);
  }
  return ranked.slice(0, 8);
}

/** Finish an assignment: knowledge, reports and a message. */
function completeAssignment(state: GameState, rng: Rng, a: Assignment): void {
  const sc = state.scouting;
  const s = sc.scouts.find((x) => x.id === a.scoutId);
  if (!s) return;
  const quality = 40 + s.judgeAbility * 2.2;
  const names: string[] = [];
  let found: Player[] = [];
  if (a.kind === 'player') {
    const p = state.players[Number(a.target)];
    if (!p) return;
    learn(state, p.id, quality);
    const r = writeReport(state, rng, s, p);
    addNews(state, {
      kind: 'squad',
      title: `Scout report: ${p.firstName} ${p.lastName}`.replace('  ', ' '),
      body: `${s.name} has watched ${p.lastName}. Verdict: ${VERDICT_WORD[r.verdict].toLowerCase()}. ${r.notes.join(' ')}`,
      link: { label: 'Read the report', screen: 'player', playerId: p.id },
    });
    return;
  }
  if (a.kind === 'club') {
    const c = club(state, Number(a.target));
    const squad = c.playerIds.map((id) => state.players[id]);
    for (const p of squad) learn(state, p.id, quality * 0.55);
    found = squad.sort((x, y) => y.ca - x.ca).slice(0, 6);
  } else {
    const league = String(a.target);
    for (const p of Object.values(state.players)) if (p.clubId && club(state, p.clubId).leagueId === league) learn(state, p.id, quality * 0.2);
    found = leagueFinds(state, rng, s, league, a.focus);
    for (const p of found) learn(state, p.id, quality * 0.7);
  }
  for (const p of found) {
    const r = writeReport(state, rng, s, p);
    if (r.verdict === 'sign' || r.verdict === 'consider' || r.verdict === 'future') names.push(`${p.lastName} (${club(state, p.clubId!).short})`);
  }
  addNews(state, {
    kind: 'squad',
    title: `Scouting: ${assignmentLabel(state, a).replace(/^Watching |^Touring /, '')}`,
    body: `${s.name} is back with reports on ${found.length} players.${names.length ? ` He recommends: ${names.join(', ')}.` : ' Nobody he saw would improve your side.'}`,
    link: { label: 'Scouting reports', screen: 'scouting', tab: 'reports' },
  });
}

/** Each day: assignments that finish are reported on. */
export function scoutingDay(state: GameState, rng: Rng): void {
  const sc = state.scouting;
  if (!sc || !state.userClubId) return;
  // Saves from before former players were remembered: work them out from the transfer records.
  if (!sc.former) sc.former = [...new Set(state.transfers.filter((t) => t.fromId === state.userClubId).map((t) => t.playerId))];
  const done = sc.assignments.filter((a) => a.season < state.season || a.endDay <= state.day);
  if (!done.length) return;
  sc.assignments = sc.assignments.filter((a) => !done.includes(a));
  for (const a of done) completeAssignment(state, rng, a);
}

/** Playing against someone tells you a good deal about him: more for the whole match, less for a cameo. */
export function learnFromMatch(state: GameState, playerIds: number[], subs: number[] = []): void {
  if (!state.scouting) return;
  for (const id of playerIds) {
    const p = state.players[id];
    if (p && p.clubId !== state.userClubId) learn(state, id, 15);
  }
  for (const id of subs) {
    const p = state.players[id];
    if (p && p.clubId !== state.userClubId) learn(state, id, 8);
  }
}

/** Scouts' wages, paid with the monthly accounts. */
export function payScouts(state: GameState): void {
  if (!state.scouting || !state.userClubId) return;
  const me = userClub(state);
  const w = (state.scouting.scouts.reduce((s, x) => s + x.wage, 0) * 52) / 12;
  me.finance.balance -= w;
  me.finance.ledger.scouting = (me.finance.ledger.scouting ?? 0) + w;
}

/** The summer: knowledge fades a little (players change), old reports go, new scouts appear. */
export function scoutingSummer(state: GameState, rng: Rng): void {
  const sc = state.scouting;
  if (!sc) return;
  sc.former = (sc.former ?? []).filter((id) => state.players[id]);
  for (const id of Object.keys(sc.known)) {
    const v = sc.known[Number(id)] * 0.6;
    if (v < 3 || !state.players[Number(id)]) delete sc.known[Number(id)];
    else sc.known[Number(id)] = v;
  }
  for (const id of Object.keys(sc.reports)) {
    const r = sc.reports[Number(id)];
    if (r.season < state.season - 1 || !state.players[Number(id)]) delete sc.reports[Number(id)];
  }
  sc.shortlist = sc.shortlist.filter((id) => state.players[id]);
  sc.assignments = [];
  refreshPool(rng, state);
  setScoutBudget(state);
}

export function toggleShortlist(state: GameState, playerId: number): boolean {
  const sc = state.scouting;
  const i = sc.shortlist.indexOf(playerId);
  if (i >= 0) sc.shortlist.splice(i, 1);
  else sc.shortlist.push(playerId);
  return i < 0;
}

export { Rng };
