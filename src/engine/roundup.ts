import { cupById, stageLabel } from './cups.js';
import { leagueTable } from './league.js';
import type { Club, Fixture, GameState, MatchEvent, Player } from './types.js';

/**
 * Words about results: a short written report of a match, labels for the eye-catching
 * results of a round (upsets, big games, thrashings) and a league round-up.
 */

export type ResultTag = 'upset' | 'big' | 'thrashing' | 'goalfest';

export const TAG_LABEL: Record<ResultTag, string> = {
  upset: 'Upset',
  big: 'Big game',
  thrashing: 'Thrashing',
  goalfest: 'Goal-fest',
};

const clubOf = (g: GameState, id: number): Club => g.clubs[id - 1]?.id === id ? g.clubs[id - 1] : g.clubs.find((c) => c.id === id) ?? g.extClubs.find((c) => c.id === id)!;
const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();
const isGoal = (e: MatchEvent) => e.kind === 'goal' || e.kind === 'pen' || e.kind === 'og';

/** League positions before a given round was played, from results of earlier rounds only. */
function positionsBefore(g: GameState, comp: string, round: number): Map<number, number> | null {
  if (round < 4) return null; // too early for the table to mean much
  const saved = g.fixtures;
  const earlier = saved.filter((f) => f.comp === comp && f.round < round);
  const view = { ...g, fixtures: earlier } as GameState;
  return new Map(leagueTable(view, comp).map((r, i) => [r.clubId, i + 1] as [number, number]));
}

/** What makes a result stand out. Reputation decides upsets; once the season has shape, the table does too. */
export function resultTags(g: GameState, f: Fixture, positions: Map<number, number> | null = null): ResultTag[] {
  const r = f.result;
  if (!r) return [];
  const h = clubOf(g, f.homeId);
  const a = clubOf(g, f.awayId);
  const tags: ResultTag[] = [];
  const margin = Math.abs(r.hg - r.ag);
  if (r.hg !== r.ag) {
    const [win, lose] = r.hg > r.ag ? [h, a] : [a, h];
    const pw = positions?.get(win.id);
    const pl = positions?.get(lose.id);
    // Home advantage is worth about half a reputation point.
    const edge = lose.reputation - win.reputation + (win === a ? 0.5 : -0.5);
    if (edge >= 2 || (pw && pl && pw - pl >= 10 && edge >= 0.5)) tags.push('upset');
  }
  const top = (c: Club) => (positions?.get(c.id) ?? 99) <= 4;
  if ((h.reputation >= 8 && a.reputation >= 8) || (top(h) && top(a))) tags.push('big');
  if (margin >= 4) tags.push('thrashing');
  if (r.hg + r.ag >= 6) tags.push('goalfest');
  return tags;
}

/** Tags for every played fixture of a league round, judged against the table before it. */
export function roundTags(g: GameState, comp: string, round: number): Map<number, ResultTag[]> {
  const pos = positionsBefore(g, comp, round);
  const out = new Map<number, ResultTag[]>();
  for (const f of g.fixtures) if (f.comp === comp && f.round === round && f.result) out.set(f.id, resultTags(g, f, pos));
  return out;
}

const score = (g: GameState, f: Fixture) => `${clubOf(g, f.homeId).name} ${f.result!.hg}-${f.result!.ag} ${clubOf(g, f.awayId).name}`;

/** A news-style round-up of a completed league round. */
export function roundSummary(g: GameState, comp: string, round: number, leagueName: string): { title: string; body: string } {
  const list = g.fixtures.filter((f) => f.comp === comp && f.round === round && f.result);
  const tags = roundTags(g, comp, round);
  const parts: string[] = [];
  const upsets = list.filter((f) => tags.get(f.id)!.includes('upset'))
    .sort((x, y) => Math.abs(x.result!.hg - x.result!.ag) - Math.abs(y.result!.hg - y.result!.ag));
  if (upsets.length) parts.push(`Upset${upsets.length > 1 ? 's' : ''} of the weekend: ${upsets.map((f) => score(g, f)).join('; ')}.`);
  const big = list.filter((f) => tags.get(f.id)!.includes('big'));
  if (big.length) parts.push(`Big game${big.length > 1 ? 's' : ''}: ${big.map((f) => score(g, f)).join('; ')}.`);
  const widest = [...list].sort((x, y) => Math.abs(y.result!.hg - y.result!.ag) - Math.abs(x.result!.hg - x.result!.ag))[0];
  if (widest && Math.abs(widest.result!.hg - widest.result!.ag) >= 3) parts.push(`Biggest win: ${score(g, widest)}.`);
  const goals = list.reduce((s, f) => s + f.result!.hg + f.result!.ag, 0);
  parts.push(`${goals} goals in ${list.length} matches.`);
  const t = leagueTable(g, comp);
  if (t.length > 1) {
    const lead = t[0].pts - t[1].pts;
    parts.push(`${clubOf(g, t[0].clubId).name} ${lead > 0 ? `lead on ${t[0].pts} points, ${lead} clear of ${clubOf(g, t[1].clubId).name}` : `top the table on goal difference from ${clubOf(g, t[1].clubId).name}, both on ${t[0].pts} points`}.`);
  }
  parts.push(`All results: ${list.map((f) => score(g, f)).join('; ')}.`);
  return { title: `${leagueName} round-up: matchday ${round + 1}`, body: parts.join(' ') };
}

/**
 * A few sentences on how a match went, from one club's point of view if given:
 * the story of the scoring, the moments that mattered, the numbers and what it means.
 */
export function matchStory(g: GameState, f: Fixture): string[] {
  const r = f.result;
  if (!r) return [];
  const h = clubOf(g, f.homeId);
  const a = clubOf(g, f.awayId);
  const name = (id: number) => g.players[id]?.lastName ?? 'a player';
  const goals = r.events.filter(isGoal).sort((x, y) => x.minute - y.minute);
  const out: string[] = [];

  if (f.comp === 'FRI') {
    const scorers = goals.map((e) => `${name(e.playerId)} (${e.minute}')`);
    out.push(r.hg === r.ag ? `${h.name} and ${a.name} drew ${r.hg}-${r.ag} in a pre-season friendly at ${h.stadium}.` : `${r.hg > r.ag ? h.name : a.name} won ${Math.max(r.hg, r.ag)}-${Math.min(r.hg, r.ag)} in a pre-season friendly at ${h.stadium}.`);
    if (scorers.length) out.push(`Goals: ${scorers.join(', ')}.`);
    out.push('Friendlies are about match sharpness and trying things out: the result means little.');
    return out;
  }

  // How the score moved: comebacks, late winners, a lead thrown away.
  let hs = 0;
  let as = 0;
  let hTrailed = false;
  let aTrailed = false;
  let hLedBy2 = false;
  let aLedBy2 = false;
  for (const e of goals) {
    if (e.side === 0) hs++; else as++;
    if (hs < as) hTrailed = true;
    if (as < hs) aTrailed = true;
    if (hs - as >= 2) hLedBy2 = true;
    if (as - hs >= 2) aLedBy2 = true;
  }
  const last = goals[goals.length - 1];
  const winSide = r.hg > r.ag ? 0 : r.hg < r.ag ? 1 : null;
  const W = winSide === 0 ? h : a;
  const L = winSide === 0 ? a : h;
  const wg = Math.max(r.hg, r.ag);
  const lg = Math.min(r.hg, r.ag);
  const at = `at ${f.neutral ?? h.stadium}`;
  const cupTie = f.tieId !== undefined;
  let lead: string;
  if (winSide === null) {
    if (r.hg === 0) lead = `${h.name} and ${a.name} fought out a goalless draw ${at}.`;
    else if ((hLedBy2 || aLedBy2)) lead = `${hLedBy2 ? h.name : a.name} threw away a two-goal lead as ${hLedBy2 ? a.name : h.name} fought back for a ${r.hg}-${r.ag} draw ${at}.`;
    else if (last && last.minute >= 85) lead = `A late ${name(last.playerId)} goal earned ${last.side === 0 ? h.name : a.name} a ${r.hg}-${r.ag} draw with ${last.side === 0 ? a.name : h.name} ${at}.`;
    else lead = cupTie ? `${h.name} and ${a.name} could not be separated, drawing ${r.hg}-${r.ag} ${at}.` : `${h.name} and ${a.name} shared the points in a ${r.hg}-${r.ag} draw ${at}.`;
  } else {
    const trailed = winSide === 0 ? hTrailed : aTrailed;
    // The winning goal is the one that put the winner ahead for good.
    let x = 0;
    let y = 0;
    let decisive: MatchEvent | undefined;
    for (const e of goals) {
      const before = winSide === 0 ? x - y : y - x;
      if (e.side === 0) x++; else y++;
      const after = winSide === 0 ? x - y : y - x;
      if (before <= 0 && after > 0) decisive = e;
    }
    if (trailed) lead = `${W.name} came from behind to beat ${L.name} ${wg}-${lg} ${at}.`;
    else if (decisive && decisive.minute >= 85 && wg - lg === 1) lead = `${name(decisive.playerId)} struck late to give ${W.name} a ${wg}-${lg} win over ${L.name} ${at}.`;
    else if (wg - lg >= 4) lead = `${W.name} thrashed ${L.name} ${wg}-${lg} ${at}.`;
    else if (wg - lg >= 2) lead = `${W.name} beat ${L.name} ${wg}-${lg} comfortably ${at}.`;
    else lead = `${W.name} edged past ${L.name} ${wg}-${lg} ${at}.`;
    if (lg === 0) lead = lead.replace(/\.$/, ', keeping a clean sheet.');
  }
  out.push(lead);
  if (r.aet && !r.pens) out.push('It was settled in extra time.');
  if (r.pens) {
    const w = r.pens[0] > r.pens[1] ? h : a;
    out.push(`${r.aet ? 'Extra time could not separate them, and ' : 'It went straight to penalties, and '}${w.name} won the shoot-out ${Math.max(...r.pens)}-${Math.min(...r.pens)}.`);
  }

  // Scorers, with braces and hat-tricks called out.
  if (goals.length) {
    const tally = new Map<number, { n: number; side: 0 | 1; mins: number[]; og: boolean }>();
    for (const e of goals) {
      const k = e.playerId;
      const t = tally.get(k) ?? { n: 0, side: e.side, mins: [], og: e.kind === 'og' };
      t.n++;
      t.mins.push(e.minute);
      tally.set(k, t);
    }
    const bits = [...tally].map(([id, t]) => {
      const who = t.og ? `an own goal by ${name(id)}` : name(id);
      const extra = !t.og && t.n >= 3 ? ' (hat-trick)' : !t.og && t.n === 2 ? ' (two)' : '';
      return `${who}${extra} ${t.mins.map((m) => `${m}'`).join(', ')}`;
    });
    out.push(`Goals: ${bits.join('; ')}.`);
  }

  // Moments that turned it: red cards, missed penalties, injuries.
  const moments: string[] = [];
  for (const e of r.events) {
    const team = e.side === 0 ? h.name : a.name;
    if (e.kind === 'red') moments.push(`${team} had ${name(e.playerId)} sent off in the ${e.minute}th minute`);
    if (e.kind === 'penmiss') moments.push(`${name(e.playerId)} missed a penalty for ${team}`);
    if (e.kind === 'injury') moments.push(`${team} lost ${name(e.playerId)} to injury (${e.minute}')`);
  }
  if (moments.length) out.push(`${moments.join('; ').replace(/^./, (c) => c.toUpperCase())}.`);

  // The numbers, and whether the result matched them.
  const s = r.stats;
  const [ph, pa] = s.possession;
  const [sh, sa] = s.shots;
  const domSide = ph >= 58 && sh >= sa + 5 ? 0 : pa >= 58 && sa >= sh + 5 ? 1 : null;
  let numbers = `${h.name} had ${ph}% of the ball and ${sh} shots (${s.onTarget[0]} on target) to ${sa} (${s.onTarget[1]}) for ${a.name}.`;
  if (domSide !== null && winSide !== null && domSide !== winSide) numbers += ` ${W.name} won against the run of play.`;
  else if (domSide !== null && winSide === null) numbers += ` ${domSide === 0 ? h.name : a.name} will feel they deserved more.`;
  out.push(numbers);

  const motm = g.players[r.motm];
  if (motm && r.ratings[r.motm]) out.push(`Man of the match: ${fullName(motm)} (${r.ratings[r.motm].toFixed(1)}).`);

  // Where it leaves both clubs.
  const cup = cupById(g, f.comp);
  if (cup) {
    const tie = f.tieId !== undefined ? cup.ties.find((x) => x.id === f.tieId) : undefined;
    if (tie?.winnerId) {
      const w = clubOf(g, tie.winnerId);
      const final = tie.round === cup.rounds.length - 1;
      out.push(final ? `${w.name} are the ${cup.name} winners.` : `${w.name} go through to the ${cup.rounds[tie.round + 1].name.toLowerCase()}.`);
    } else if (!tie) out.push(`${stageLabel(g, f).replace(/^./, (c) => c.toUpperCase())}.`);
    return out;
  }
  const t = leagueTable(g, f.comp);
  const posOf = (id: number) => t.findIndex((row) => row.clubId === id) + 1;
  const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  const played = t[0]?.p ?? 0;
  if (played >= 3) out.push(`${h.name} are ${ord(posOf(h.id))} and ${a.name} ${ord(posOf(a.id))} in the table.`);
  return out;
}
