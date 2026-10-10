/**
 * The assistant manager's reading of a match: a report card at half time (a verdict, what he has
 * seen, and changes the manager can make with one tap) and a debrief after the final whistle
 * (marks for each part of the side, positives, concerns and the next game).
 *
 * Everything here is worked out from the numbers the match engine keeps for the manager's own
 * matches (MatchAnalysis): it never changes a result.
 */
import { hashString } from './attributes.js';
import { NATIONS } from './data.js';
import { club, ordinal } from './game.js';
import { leagueTable } from './league.js';
import type { LivePlayer, MatchSim } from './match.js';
import { Rng } from './rng.js';
import { misjudge, slotRating } from './tactics.js';
import type { Club, Fixture, GameState, MatchAnalysis, Mentality, Player, Pos, SideNumbers, Tactics } from './types.js';

/** The name older saves gave a club's assistant (a fixed name per club, from its own country). */
export function assistantName(g: GameState, c: Club): string {
  const nation = g.comps.find((k) => k.id === c.leagueId)?.nation ?? 'ENG';
  const pool = NATIONS.find((n) => n.code === nation) ?? NATIONS.find((n) => n.code === 'ENG') ?? NATIONS[0];
  const rng = new Rng(hashString(`assistant:${c.name}`));
  return `${rng.pick(pool.first)} ${rng.pick(pool.last)}`;
}

export type Tone = 'good' | 'bad' | 'warn';

export interface Observation {
  tone: Tone;
  text: string;
  evidence: string;
}

export type Suggestion =
  | { kind: 'instr'; key: keyof Tactics; value: string | boolean; text: string; why: string }
  | { kind: 'mentality'; value: Mentality; text: string; why: string }
  | { kind: 'sub'; offId: number; onId: number; intoIdx: number; cond: number; text: string; why: string }
  | { kind: 'run'; playerId: number; text: string; why: string };

export interface HalfTimeReport {
  /** A word or two for the badge, and its colour. */
  label: string;
  tone: Tone;
  /** Behind, or clearly second best: only then does he suggest substitutions. */
  badly: boolean;
  verdict: string;
  observations: Observation[];
  suggestions: Suggestion[];
  /** How the other side are setting up, in a line. */
  shape: string;
  /** The assistant's view if no change is needed. */
  keep: string;
}

const pct = (a: number, b: number): number => (a + b > 0 ? Math.round((a / (a + b)) * 100) : 50);
const CHANNEL = ['the left', 'the middle', 'the right'];
const chOf = (slot: Pos): 0 | 1 | 2 => (slot === 'GK' ? 1 : slot.endsWith('L') ? 0 : slot.endsWith('R') ? 2 : 1);
const isDef = (slot: Pos) => slot === 'DC' || slot === 'DL' || slot === 'DR';
const s1 = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : w.endsWith('s') ? 'es' : 's'}`;

/** "4-5-1, sitting deep, pressing only in their own half": the other side in a phrase. */
export function shapeLine(t: Tactics, formation: string): string {
  const deep = t.mentality === 'defensive' ? 'sitting deep' : t.mentality === 'attacking' ? 'pushing men forward' : 'balanced';
  const press = t.closingDown === 'all-over' ? 'pressing all over the pitch' : t.closingDown === 'own-half' ? 'pressing only in their own half' : 'pressing in midfield';
  const ball = t.passing === 'long' ? 'going long' : t.passing === 'short' ? 'passing it short' : '';
  const extra = [t.counterAttack ? 'breaking quickly when they win it' : '', ball].filter(Boolean).join(', ');
  return `${formation}, ${deep}, ${press}${extra ? `, ${extra}` : ''}.`;
}

interface Ctx {
  us: SideNumbers;
  them: SideNumbers;
  mine: LivePlayer[];
  theirs: LivePlayer[];
  tac: Tactics;
  opp: Tactics;
  lead: number;
  poss: number;
  players: MatchAnalysis['players'];
}

/** The assistant's half-time report card for the manager's side, or null if no numbers were kept. */
export function halfTimeReport(sim: MatchSim, side: 0 | 1): HalfTimeReport | null {
  const an = sim.analysisNow();
  if (!an) return null;
  const other = (1 - side) as 0 | 1;
  const c: Ctx = {
    us: an.sides[side], them: an.sides[other], mine: sim.livePlayers(side), theirs: sim.livePlayers(other),
    tac: sim.sides[side].tactics, opp: sim.sides[other].tactics, lead: sim.score[side] - sim.score[other],
    poss: pct(an.sides[side].poss, an.sides[other].poss), players: an.players,
  };
  const { us, them } = c;
  // How well he reads a game (1–20): a top assistant sees all of this; a weaker one sees less of it,
  // ranks it less well and backs it up with fewer numbers. Seeded on the match so the card is steady.
  const asst = sim.sides[side].asst;
  const read = asst?.read ?? 20;
  const blur = Math.max(0, 20 - read);
  const nrng = new Rng(hashString(`ht:${asst?.id ?? 0}:${sim.score.join('-')}:${us.shots}:${them.shots}:${us.poss}`));
  const fog = () => nrng.normal() * blur / 4;
  const perf = (us.shots - them.shots) + (us.onTarget - them.onTarget) * 1.5 + (c.poss - 50) / 5 + fog();
  const toothless = c.poss >= 56 && us.onTarget <= 1;
  const crossed = us.crosses >= 6 && us.crossesDone / us.crosses < 0.35;
  const air = pct(us.aerialsWon, them.aerialsWon);
  const onBreak = (them.kinds.counter ?? 0) + (them.kinds.through ?? 0);
  const name = (o: LivePlayer) => o.p.lastName;

  // ── What he has seen, most telling first.
  const obs: (Observation & { w: number })[] = [];
  if (toothless) {
    obs.push({
      w: 9, tone: 'bad',
      text: `${c.poss}% of the ball, but ${us.onTarget ? 'only one shot' : 'not one shot'} on target.${crossed ? ' We keep crossing from deep and they win it in the air.' : ' We\'re passing it around in front of them.'}`,
      evidence: crossed ? `Crosses ${us.crosses}, found a man ${us.crossesDone} · Aerial duels won ${air}%` : `Shots ${us.shots}, on target ${us.onTarget}`,
    });
  }
  if (them.shots >= us.shots + 4 || them.onTarget >= us.onTarget + 2) {
    obs.push({ w: 8, tone: 'bad', text: `They've had the better chances: ${s1(them.shots, 'shot')} to our ${us.shots}.`, evidence: `On target ${them.onTarget}-${us.onTarget} · Possession ${100 - c.poss}%` });
  } else if (us.shots >= them.shots + 4 && us.onTarget >= them.onTarget + 1 && !toothless) {
    obs.push({ w: 6, tone: 'good', text: `We're on top: ${s1(us.shots, 'shot')} to their ${them.shots}.`, evidence: `On target ${us.onTarget}-${them.onTarget} · Possession ${c.poss}%` });
  }
  if (onBreak >= 2) {
    obs.push({ w: 7, tone: 'warn', text: `They're hurting us on the break: ${onBreak} of their ${s1(them.shots, 'shot')} came from balls in behind.`, evidence: `${c.tac.offsideTrap ? 'Our offside trap is being beaten' : c.tac.mentality === 'attacking' ? 'We\'re committing men forward' : 'Space behind our back line'}` });
  }
  if ((them.kinds.cross ?? 0) + (them.kinds.corner ?? 0) >= 2 && air < 45) {
    obs.push({ w: 5, tone: 'warn', text: 'We\'re losing the battle in the air at the back.', evidence: `Aerial duels won ${air}% · ${(them.kinds.cross ?? 0) + (them.kinds.corner ?? 0)} of their shots from crosses and corners` });
  }
  // Our best outlet: a wide man doing well, or the top-rated player.
  const star = [...c.mine].filter((o) => o.slot !== 'GK').sort((a, b) => b.rating - a.rating)[0];
  if (star && star.rating >= 7.0) {
    const ch = chOf(star.slot);
    const kp = c.players[star.p.id]?.kp ?? 0;
    obs.push({
      w: 5, tone: 'good',
      text: ch === 1 ? `${name(star)} is our best player so far.` : `${name(star)} is getting joy down ${CHANNEL[ch]}.`,
      evidence: `Rated ${star.rating.toFixed(1)}${kp ? ` · ${s1(kp, 'key pass')}` : ''}${star.goals ? ` · ${s1(star.goals, 'goal')}` : ''}`,
    });
  }
  // Their key man.
  const danger = [...c.theirs].map((o) => ({ o, n: (c.players[o.p.id]?.kp ?? 0) + (c.players[o.p.id]?.sh ?? 0) })).sort((a, b) => b.n - a.n)[0];
  if (danger && danger.n >= 3) {
    obs.push({ w: 6, tone: 'warn', text: `Everything good they do goes through ${name(danger.o)}.`, evidence: `${s1(c.players[danger.o.p.id]?.kp ?? 0, 'key pass')}, ${s1(c.players[danger.o.p.id]?.sh ?? 0, 'shot')}` });
  }
  // Where they're getting in.
  const worst = them.shotFlank.indexOf(Math.max(...them.shotFlank)) as 0 | 1 | 2;
  if (worst !== 1 && them.shotFlank[worst] >= 3) {
    const fb = c.mine.find((o) => isDef(o.slot) && chOf(o.slot) === (2 - worst));
    obs.push({ w: 5, tone: 'warn', text: `They're getting in down our ${worst === 0 ? 'right' : 'left'}${fb && fb.rating < 6.4 ? `; ${name(fb)} is struggling` : ''}.`, evidence: `${them.shotFlank[worst]} of their ${s1(them.shots, 'shot')} came from that side` });
  }
  // People problems.
  for (const o of c.mine) {
    if (o.slot !== 'GK' && o.yellow && o.rating < 6.4) obs.push({ w: 7, tone: 'warn', text: `${name(o)} is on a yellow and having a difficult game. One more and we're down to ten.`, evidence: `Rated ${o.rating.toFixed(1)} · condition ${Math.round(o.cond)}%` });
    else if (o.cond < 68) obs.push({ w: 4, tone: 'warn', text: `${name(o)} is tiring.`, evidence: `Condition ${Math.round(o.cond)}%` });
  }
  for (const o of obs) o.w += fog();
  obs.sort((a, b) => b.w - a.w);
  const maxObs = read >= 15 ? 3 : read >= 7 ? 2 : 1;
  const chosen: Observation[] = [];
  for (const o of obs) {
    if (chosen.length >= maxObs) break;
    // Keep a mix: at most two of the same tone.
    if (chosen.filter((x) => x.tone === o.tone).length >= 2 && obs.some((x) => !chosen.includes(x) && x.tone !== o.tone)) continue;
    chosen.push({ tone: o.tone, text: o.text, evidence: read >= 8 ? o.evidence : '' });
  }
  if (!chosen.length) chosen.push({ tone: 'good', text: 'Even game. Nobody has taken control yet.', evidence: read >= 8 ? `Shots ${us.shots}-${them.shots} · Possession ${c.poss}%` : '' });

  // ── The verdict.
  let verdict: string;
  if (c.lead > 0) verdict = perf < -3 ? 'We\'re ahead, but we\'re riding our luck.' : perf > 3 ? 'Good half. Keep doing what we\'re doing.' : 'We\'re in front. Stay switched on.';
  else if (c.lead < 0) verdict = perf > 2 ? 'We don\'t deserve to be behind. Stay patient, but sharpen up.' : perf < -2 ? 'We\'re behind and second best. Something has to change.' : 'We need more from the second half.';
  else if (toothless) verdict = 'We\'ve got the ball, but we\'re not hurting them.';
  else verdict = perf > 3 ? 'We\'re the better side. The goal will come.' : perf < -3 ? 'We\'re second best. Something has to change.' : 'Tight game. Small margins.';

  const label = c.lead > 0 ? (perf < -3 ? 'Riding our luck' : 'In control') : c.lead < 0 ? (perf > 2 ? 'Unlucky' : perf < -2 ? 'Second best' : 'Behind') : toothless ? 'Toothless' : perf > 3 ? 'On top' : perf < -3 ? 'Under pressure' : 'Even';
  const tone: Tone = c.lead > 0 ? (perf < -3 ? 'warn' : 'good') : c.lead < 0 ? (perf > 2 ? 'warn' : 'bad') : perf > 3 ? 'good' : perf < -3 ? 'bad' : 'warn';
  const badly = c.lead < 0 || (c.lead === 0 && perf < -3) || (c.lead > 0 && perf < -6);

  // ── What he'd change.
  const sugg: (Suggestion & { w: number })[] = [];
  if (toothless && crossed && c.tac.passing !== 'short') {
    sugg.push({ w: 9, kind: 'instr', key: 'passing', value: 'short', text: 'Play it to feet: shorter passing, fewer crosses.', why: `Only ${us.crossesDone} of ${us.crosses} crosses found a man.` });
  }
  if ((toothless || c.lead < 0) && c.tac.mentality !== 'attacking' && c.lead <= 0) {
    sugg.push({ w: c.lead < 0 ? 9 : 6, kind: 'mentality', value: 'attacking', text: 'Push more men forward.', why: c.lead < 0 ? 'We need a goal.' : 'We have the ball; get more bodies in the box.' });
  }
  if (onBreak >= 2) {
    if (c.tac.offsideTrap) sugg.push({ w: 8, kind: 'instr', key: 'offsideTrap', value: false, text: 'Drop the offside trap.', why: 'They keep getting in behind us.' });
    else if (c.tac.mentality === 'attacking' && c.lead >= 0) sugg.push({ w: 7, kind: 'mentality', value: 'balanced', text: 'Get back into a balanced shape.', why: 'We\'re leaving gaps for their breaks.' });
  }
  if (c.lead > 0 && perf < -3) {
    if (c.tac.mentality !== 'defensive') sugg.push({ w: 8, kind: 'mentality', value: 'defensive', text: 'Shut up shop: drop deeper.', why: 'We\'re ahead but they\'re creating more.' });
    if (!c.tac.counterAttack) sugg.push({ w: 5, kind: 'instr', key: 'counterAttack', value: true, text: 'Hit them on the counter.', why: 'They\'ll come at us; the space will be behind them.' });
  }
  if (perf < -3 && c.lead <= 0 && c.tac.closingDown !== 'all-over') {
    const tired = c.mine.filter((o) => o.cond < 70).length;
    if (tired <= 2) sugg.push({ w: 6, kind: 'instr', key: 'closingDown', value: 'all-over', text: 'Press them higher up the pitch.', why: 'We\'re letting them play.' });
  }
  if (danger && danger.n >= 3 && c.tac.tackling !== 'hard' && c.mine.filter((o) => o.yellow).length < 2) {
    sugg.push({ w: 5, kind: 'instr', key: 'tackling', value: 'hard', text: `Get tighter: tackle harder, especially on ${danger.o.p.lastName}.`, why: 'He\'s had too much time on the ball.' });
  }
  if (star && star.rating >= 7.2 && chOf(star.slot) !== 1 && !sim.runsOf(side, star.p.id).ball) {
    sugg.push({ w: 4, kind: 'run', playerId: star.p.id, text: `Tell ${star.p.lastName} to run at them with the ball.`, why: 'Their full-back can\'t live with him.' });
  }
  // A substitution (only when things are going badly): booked and struggling, tired, or simply having a poor game.
  if (badly && sim.canSub(side)) {
    const bench = sim.benchPlayers(side);
    const reason = (o: LivePlayer): [number, string] | null => {
      if (o.injured) return null; // the injury alert covers this
      if (o.yellow && o.rating < 6.4 && o.slot !== 'GK') return [8, `${o.p.lastName} is booked and at ${Math.round(o.cond)}%.`];
      if (o.cond < 66 && o.slot !== 'GK') return [6, `${o.p.lastName} is tiring (${Math.round(o.cond)}%).`];
      if (o.rating <= 5.8) return [5, `${o.p.lastName} is having a poor game (${o.rating.toFixed(1)}).`];
      return null;
    };
    const cands = c.mine.map((o) => ({ o, r: reason(o) })).filter((x) => x.r).sort((a, b) => b.r![0] - a.r![0]);
    const used = new Set<number>();
    for (const { o, r } of cands.slice(0, 2)) {
      const on = bench.filter((b) => !used.has(b.id) && !b.injury && (o.slot === 'GK') === ((b.pos.GK ?? 0) >= 15))
        .sort((a, b) => slotRating(b, o.slot) * misjudge(asst, b.id) - slotRating(a, o.slot) * misjudge(asst, a.id))[0];
      if (!on || slotRating(on, o.slot) < slotRating(o.p, o.slot) - 3) continue;
      used.add(on.id);
      sugg.push({ w: r![0], kind: 'sub', offId: o.p.id, onId: on.id, intoIdx: o.idx, cond: Math.round(o.cond), text: `${o.p.lastName} off, ${on.lastName} on.`, why: r![1] });
    }
  }
  for (const x of sugg) x.w += fog();
  sugg.sort((a, b) => b.w - a.w);
  const maxSugg = read >= 15 ? 3 : read >= 7 ? 2 : 1;
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const s of sugg) {
    const key = s.kind === 'instr' ? `i:${String(s.key)}` : s.kind === 'mentality' ? 'm' : s.kind === 'sub' ? `s:${s.offId}` : `r:${s.playerId}`;
    if (seen.has(key) || suggestions.length >= maxSugg) continue;
    seen.add(key);
    const { w: _w, ...rest } = s;
    suggestions.push(rest as Suggestion);
  }
  const keep = c.lead > 0 ? 'Or leave it: we\'re winning.' : perf > 2 ? 'Or leave it: we\'re on top, a goal will come.' : 'Or leave it as it is.';
  return { label, tone, badly, verdict, observations: chosen, suggestions, shape: shapeLine(c.opp, sim.formationOf(other)), keep };
}

/* ───────────────────────── After the match ───────────────────────── */

export interface Grade {
  unit: string;
  grade: string;
  note: string;
  good: boolean;
}

export interface DebriefPlayer {
  id: number;
  name: string;
  rating: number;
  kp: number;
  sh: number;
  tk: number;
  motm: boolean;
}

export interface Debrief {
  /** The verdict badge and its colour. */
  label: string;
  tone: Tone;
  /** The story of the game in two or three points. */
  points: string[];
  /** Shots per 15 minutes (index 6 = extra time), ours and theirs, and the two short names. */
  spells: { ours: number[]; theirs: number[] };
  codes: [string, string];
  /** Player notes: the best four and the worst, with key passes, shots and tackles. */
  players: DebriefPlayer[];
  /** Our side's numbers and theirs, full match and first half. */
  us: SideNumbers;
  them: SideNumbers;
  half: [SideNumbers, SideNumbers] | null;
  grades: Grade[];
  positives: string[];
  concerns: string[];
  next: string[];
  nextLabel: string;
  /** Changes the manager made, in words. */
  changes: string[];
  turning: string | null;
  /** The assistant's reading of the game (1–20) when the match was played. */
  read: number;
}

const LETTERS = ['E', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
const letter = (score: number): string => LETTERS[Math.max(0, Math.min(LETTERS.length - 1, Math.round(score)))];

const INSTR_WORD: Record<string, (v: string) => string> = {
  mentality: (v) => `mentality to ${v}`,
  passing: (v) => (v === 'short' ? 'shorter passing' : v === 'long' ? 'longer passing' : 'mixed passing'),
  tackling: (v) => (v === 'hard' ? 'harder tackling' : v === 'easy' ? 'staying on their feet' : 'normal tackling'),
  closingDown: (v) => (v === 'all-over' ? 'pressing all over' : v === 'own-half' ? 'pressing only in our half' : 'pressing in midfield'),
  counterAttack: (v) => (v === 'true' ? 'counter-attacking' : 'no counter-attacks'),
  offsideTrap: (v) => (v === 'true' ? 'playing offside' : 'no offside trap'),
  formation: (v) => `a ${v}`,
};

/** The assistant's debrief of one of the manager's matches, or null if no numbers were kept. */
export function debrief(g: GameState, f: Fixture): Debrief | null {
  const r = f.result;
  const an = r?.analysis;
  if (!r || !an) return null;
  const side: 0 | 1 = f.homeId === g.userClubId ? 0 : f.awayId === g.userClubId ? 1 : 0;
  const other = (1 - side) as 0 | 1;
  // A weaker reader of the game tells the story in fewer points and sees less of the next opponent.
  const read = an.read ?? 20;
  const nPoints = read >= 15 ? 3 : read >= 8 ? 2 : 1;
  const us = an.sides[side];
  const them = an.sides[other];
  const gf = side === 0 ? r.hg : r.ag;
  const ga = side === 0 ? r.ag : r.hg;
  const me = club(g, side === 0 ? f.homeId : f.awayId);
  const ours = [...r.lineups[side], ...r.events.filter((e) => e.kind === 'sub' && e.side === side).map((e) => e.otherId!)];
  const P = (id: number): Player | undefined => g.players[id];
  const rated = ours.filter((id) => r.ratings[id] !== undefined && P(id));
  const role = (id: number): 'GK' | 'D' | 'M' | 'A' => {
    const p = P(id)!;
    const best = (Object.entries(p.pos) as [Pos, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'MC';
    return best === 'GK' ? 'GK' : best.startsWith('D') && best !== 'DM' ? 'D' : best === 'ST' || best.startsWith('AM') ? 'A' : 'M';
  };
  const avgOf = (ids: number[]) => (ids.length ? ids.reduce((s, id) => s + r.ratings[id], 0) / ids.length : 6.5);
  const defIds = rated.filter((id) => role(id) === 'D' || role(id) === 'GK');
  const midIds = rated.filter((id) => role(id) === 'M');
  const attIds = rated.filter((id) => role(id) === 'A');
  const poss = pct(us.poss, them.poss);
  const og = r.events.some((e) => e.kind === 'og' && e.side === other);

  // ── Marks (index into LETTERS: 7 = B).
  const dScore = 9 - Math.min(ga, 4) * 1.6 + (them.onTarget <= 2 ? 1 : them.onTarget >= 6 ? -1 : 0) + (avgOf(defIds) - 6.6) * 2 - (og ? 1 : 0);
  const mScore = 6 + (poss - 50) / 6 + (us.shots - them.shots) / 3 + (avgOf(midIds) - 6.6) * 2;
  const aScore = 5 + gf * 1.6 + (us.onTarget - 3) * 0.4 + (avgOf(attIds) - 6.6) * 2;
  const grades: Grade[] = [
    { unit: 'Defence', grade: letter(dScore), good: dScore >= 7, note: ga === 0 ? `A clean sheet; they managed ${s1(them.onTarget, 'shot')} on target.` : og ? `An own goal cost us; ${s1(ga, 'goal')} conceded in all.` : `${s1(ga, 'goal')} conceded from ${s1(them.onTarget, 'shot')} on target.` },
    { unit: 'Midfield', grade: letter(mScore), good: mScore >= 7, note: `${poss}% of the ball; ${s1(us.shots, 'shot')} to their ${them.shots}.` },
    { unit: 'Attack', grade: letter(aScore), good: aScore >= 7, note: gf === 0 ? `No goals from ${s1(us.onTarget, 'shot')} on target.` : `${s1(gf, 'goal')} from ${s1(us.onTarget, 'shot')} on target.` },
  ];

  // ── The manager's changes, and whether they worked.
  const subs = r.events.filter((e) => e.kind === 'sub' && e.side === side);
  const instr = an.changes.filter((c) => c.side === side);
  const changes = [
    ...instr.map((c) => `${c.minute}': ${INSTR_WORD[c.key]?.(c.value) ?? `${c.key} ${c.value}`}`),
    ...subs.map((e) => `${e.minute}': ${P(e.otherId!)?.lastName ?? '?'} on for ${P(e.playerId)?.lastName ?? '?'}`),
  ].sort((a, b) => parseInt(a) - parseInt(b));
  let turning: string | null = null;
  const half = an.half;
  if (half) {
    const h1 = half[side];
    const h1o = half[other];
    const s2 = us.shots - h1.shots;
    const s2o = them.shots - h1o.shots;
    const htChange = instr.some((c) => c.minute === 45) || subs.some((e) => e.minute === 45);
    if (htChange || changes.length) {
      const better = s2 - s2o > h1.shots - h1o.shots + 2 || (us.goals - h1.goals) > (h1.goals) + 1;
      const worse = s2 - s2o < h1.shots - h1o.shots - 3;
      const first = instr.find((c) => c.minute === 45) ?? instr[0];
      const what = first ? INSTR_WORD[first.key]?.(first.value) ?? first.key : subs.length ? `the substitution${subs.length > 1 ? 's' : ''}` : 'your changes';
      grades.push({ unit: 'Your changes', grade: better ? 'A' : worse ? 'C-' : 'B', good: !worse, note: better ? `${what[0].toUpperCase() + what.slice(1)} made a difference: ${s1(s2, 'shot')} to their ${s2o} after the break (${h1.shots}-${h1o.shots} before).` : worse ? 'The second half was worse than the first.' : 'No great change either way.' });
      if (better) turning = `${what[0].toUpperCase() + what.slice(1)}${htChange ? ' at half time' : ''} made a difference: ${s1(s2, 'shot')} to their ${s2o} after the break (${h1.shots}-${h1o.shots} before).`;
    }
  }

  // ── Positives and concerns.
  const positives: string[] = [];
  const concerns: string[] = [];
  const motm = r.motm >= 0 && ours.includes(r.motm) ? P(r.motm) : undefined;
  if (motm) positives.push(`${motm.lastName} was man of the match (${r.ratings[motm.id].toFixed(1)}).`);
  if (half) {
    const g2 = us.goals - half[side].goals;
    const sh2 = us.shots - half[side].shots;
    if (g2 >= 2 || sh2 >= half[side].shots + 4) positives.push(`A strong second half: ${s1(sh2, 'shot')}, ${s1(g2, 'goal')}.`);
  }
  if (ga === 0) positives.push('A clean sheet.');
  if (gf - ga >= 3) positives.push(`A ${gf}-${ga} win: our biggest margin is worth noting.`);
  const kpTop = rated.map((id) => ({ id, kp: an.players[id]?.kp ?? 0 })).sort((a, b) => b.kp - a.kp)[0];
  if (kpTop && kpTop.kp >= 3 && kpTop.id !== motm?.id) positives.push(`${P(kpTop.id)!.lastName} made ${kpTop.kp} key passes.`);
  const air = pct(us.aerialsWon, them.aerialsWon);
  if (air >= 60) positives.push(`We dominated in the air (${air}% of aerial duels).`);

  const starters = r.lineups[side].filter((id) => r.ratings[id] !== undefined && P(id));
  const poor = [...starters].sort((a, b) => r.ratings[a] - r.ratings[b])[0];
  if (poor !== undefined && r.ratings[poor] < 6.2) {
    const p = P(poor)!;
    const recent = p.form.slice(-4);
    const bad = recent.filter((x) => x < 6.3).length;
    const extra = [r.events.some((e) => e.kind === 'og' && e.playerId === poor) ? 'own goal' : '', r.events.some((e) => e.kind === 'yellow' && e.playerId === poor) ? 'booked' : ''].filter(Boolean).join(', ');
    concerns.push(`${p.lastName}: ${r.ratings[poor].toFixed(1)}${extra ? `, ${extra}` : ''}.${bad >= 3 ? ` That's ${bad} poor games in his last ${recent.length}.` : ''}`);
  }
  if (us.crosses >= 10 && us.crossesDone / us.crosses < 0.3) concerns.push(`We crossed ${us.crosses} times and found a man ${us.crossesDone} times.`);
  if (them.shots >= us.shots + 5) concerns.push(`They out-shot us ${them.shots}-${us.shots}.`);
  const reds = r.events.filter((e) => e.kind === 'red' && e.side === side);
  for (const e of reds) concerns.push(`${P(e.playerId)?.lastName ?? 'A player'} was sent off and will be suspended.`);
  const hurt = r.events.filter((e) => e.kind === 'injury' && e.side === side);
  for (const e of hurt) {
    const p = P(e.playerId);
    if (p?.injury) concerns.push(`${p.lastName} is injured (${p.injury.name}, about ${Math.max(1, Math.ceil(p.injury.days / 7))} week${p.injury.days > 7 ? 's' : ''}).`);
  }
  const onBreak = (them.kinds.counter ?? 0) + (them.kinds.through ?? 0);
  if (onBreak >= 3) concerns.push(`${onBreak} of their chances came from balls in behind us.`);
  if (!positives.length) positives.push(gf >= ga ? 'We got the job done.' : 'We kept going to the end.');
  if (!concerns.length) concerns.push('Nothing to worry about.');

  // ── The next game.
  const nextF = g.fixtures.filter((x) => !x.result && (x.homeId === me.id || x.awayId === me.id) && x.day >= f.day).sort((a, b) => a.day - b.day)[0];
  const next: string[] = [];
  let nextLabel = 'Next';
  if (nextF) {
    const home = nextF.homeId === me.id;
    const opp: Club = club(g, home ? nextF.awayId : nextF.homeId);
    const t = opp.tactics;
    const days = nextF.day - g.day;
    nextLabel = `Next: ${opp.name} (${home ? 'H' : 'A'})${days >= 0 ? `, in ${days === 0 ? 'less than a day' : s1(days, 'day')}` : ''}`;
    if (g.comps.some((k) => k.id === nextF.comp && k.clubIds.includes(opp.id))) {
      const tbl = leagueTable(g, nextF.comp);
      const row = tbl.findIndex((x) => x.clubId === opp.id);
      if (row >= 0) nextLabel += ` · ${ordinal(row + 1)}${tbl[row].form.length ? `, form ${tbl[row].form.join('')}` : ''}`;
    }
    if (read >= 8) next.push(`They set up ${shapeLine(t, t.formation).replace(/\.$/, '')}.`);
    const tired = me.playerIds.map((id) => g.players[id]).filter((p) => p && ours.includes(p.id) && p.condition < 78)
      .sort((a, b) => a.condition - b.condition).slice(0, 3);
    if (tired.length && days <= 4) next.push(`${tired.map((p) => `${p.lastName} (${p.condition}%)`).join(', ')} ${tired.length > 1 ? 'need' : 'needs'} a rest${days <= 3 ? ' with the game so soon' : ''}.`);
    const banned = me.playerIds.map((id) => g.players[id]).filter((p) => p && p.suspended > 0);
    if (banned.length) next.push(`Suspended: ${banned.map((p) => p.lastName).join(', ')}.`);
    if (read >= 12 && t.closingDown === 'all-over') next.push('They press high: shorter passing and quick feet will help.');
    else if (read >= 12 && t.mentality === 'defensive') next.push('Expect them to sit deep: be patient and get men into the box.');
  }
  // ── The verdict and the story.
  const pens = r.pens;
  const won = gf > ga || (gf === ga && !!pens && pens[side] > pens[other]);
  const lost = gf < ga || (gf === ga && !!pens && pens[side] < pens[other]);
  const perf = (us.shots - them.shots) + (us.onTarget - them.onTarget) * 1.5 + (poss - 50) / 5;
  const label = won ? (perf > 3 ? 'Deserved' : perf < -3 ? 'Smash and grab' : 'Job done') : lost ? (perf > 3 ? 'Unlucky' : perf < -3 ? 'Second best' : 'Disappointing') : perf > 3 ? 'Should have won' : perf < -3 ? 'A point gained' : 'Fair result';
  const tone: Tone = won ? 'good' : lost ? 'bad' : 'warn';
  const points: string[] = [];
  if (half) {
    const a1 = half[side].shots;
    const b1 = half[other].shots;
    const a2 = us.shots - a1;
    const b2 = them.shots - b1;
    if (a1 < b1 - 1 && a2 > b2 + 1) points.push(`A good response after the break. We were second best in the first half (${a1} shots to ${b1}), then had ${a2} of the ${a2 + b2} in the second.`);
    else if (a1 > b1 + 1 && a2 < b2 - 1) points.push(`We faded. We had the better of the first half (${a1} shots to ${b1}), but they had ${b2} of the ${a2 + b2} after the break.`);
    else if (perf > 3) points.push(`We were the better side throughout: ${us.shots} shots to ${them.shots} and ${poss}% of the ball.`);
    else if (perf < -3) points.push(`They had the better of it: ${them.shots} shots to our ${us.shots}, and ${100 - poss}% of the ball.`);
    else points.push(`A close game: ${us.shots} shots to ${them.shots}, ${poss}% of the ball for us.`);
  }
  if (us.shots >= 4) {
    const fl = us.shotFlank;
    const max = Math.max(...fl);
    const ch = fl.indexOf(max) as 0 | 1 | 2;
    const kpTop2 = rated.map((id) => ({ id, kp: an.players[id]?.kp ?? 0 })).sort((a, b) => b.kp - a.kp)[0];
    const maker = kpTop2 && kpTop2.kp >= 3 ? ` ${P(kpTop2.id)!.lastName} set up ${kpTop2.kp} on his own.` : '';
    if (max / us.shots >= 0.5) points.push(`Most of our chances came ${ch === 1 ? 'through the middle' : `down ${CHANNEL[ch]}`}: ${max} of our ${us.shots} shots.${maker}`);
    else if (maker) points.push(`Our chances came from all over: ${fl[0]} down the left, ${fl[1]} through the middle, ${fl[2]} down the right.${maker}`);
  }
  const KIND: Record<string, string> = { cross: 'crosses', long: 'shots from distance', box: 'scrambles in the box', through: 'balls in behind', counter: 'counter-attacks', corner: 'corners', freekick: 'free kicks', penalty: 'penalties' };
  const kinds = Object.entries(them.kinds).sort((a, b) => b[1] - a[1]);
  if (them.shots >= 3 && kinds[0] && kinds[0][1] >= 2) {
    const setPiece = (them.kinds.corner ?? 0) + (them.kinds.freekick ?? 0);
    const airNote = them.aerialsWon > us.aerialsWon + 4 ? ` They won ${them.aerialsWon} headers to our ${us.aerialsWon}.` : '';
    points.push(setPiece >= 2 && setPiece >= kinds[0][1] ? `Their main threat was set pieces: ${setPiece} shots from corners and free kicks.${airNote}` : `Their main threat was ${KIND[kinds[0][0]] ?? kinds[0][0]}: ${kinds[0][1]} of their ${s1(them.shots, 'shot')}.${airNote}`);
  }
  const notes: DebriefPlayer[] = rated
    .map((id) => ({ id, name: `${P(id)!.firstName ? `${P(id)!.firstName[0]}. ` : ''}${P(id)!.lastName}`, rating: r.ratings[id], kp: an.players[id]?.kp ?? 0, sh: an.players[id]?.sh ?? 0, tk: an.players[id]?.tk ?? 0, motm: r.motm === id }))
    .sort((a, b) => b.rating - a.rating);
  const players = notes.length > 5 ? [...notes.slice(0, 4), notes[notes.length - 1]] : notes;
  const code = (c: Club) => (c.short || c.name.slice(0, 3)).toUpperCase();
  const opp = club(g, side === 0 ? f.awayId : f.homeId);
  const nSpells = r.aet ? 7 : 6;
  return {
    label, tone, points: points.slice(0, nPoints), spells: { ours: us.periods.slice(0, nSpells), theirs: them.periods.slice(0, nSpells) }, codes: [code(me), code(opp)], players,
    us, them, half, grades, positives: positives.slice(0, nPoints), concerns: concerns.slice(0, nPoints), next, nextLabel, changes, turning: read >= 10 ? turning : null, read,
  };
}
