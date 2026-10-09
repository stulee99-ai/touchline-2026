import { club, completeDay, startDay, trimSave, type LiveRound, userClub } from '../engine/game.js';
import { compName, cupById, stageLabel } from '../engine/cups.js';

/** "Matchday 5" for the league, "Third round" or "Semi-final, second leg" for a cup. */
function stageText(g: Parameters<typeof stageLabel>[0], f: Fixture): string {
  if (f.comp === 'FRI') return 'Pre-season friendly';
  if (!cupById(g, f.comp)) return `Matchday ${f.round + 1}`;
  const s = stageLabel(g, f).replace(compName(g, f.comp), '').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
import { halfTimeReport, type HalfTimeReport } from '../engine/analysis.js';
import type { ChangeMark, LivePlayer, MatchSim, SubSuggestion } from '../engine/match.js';
import { htCardHtml } from './assistantui.js';
import { FORMATIONS, getFormation, MAX_SUBS } from '../engine/tactics.js';
import type { Club, CommentaryLine, Fixture, Mentality, Tactics } from '../engine/types.js';
import type { Action, Ctx } from './ctx.js';
import type { DragSource, DropTarget } from './dnd.js';
import { runControls } from './runs.js';
import { clubStrip, condBar, condClass, esc, fullName, minuteLabel, shortName } from './format.js';
import { barColours, benchRow, INSTRUCTIONS, instructionSelect, primaryPos, statBar } from './screens.js';

/**
 * The live match screen. The engine is stepped one minute at a time; commentary
 * lines are queued and revealed with a delay so chances build tension. As in the
 * CM 01/02 text engine, the commentary panel takes the colours of the side on the ball.
 *
 * The manager runs his own side: the game stops for injuries and red cards with the
 * assistant's suggestion, and the Tactics view allows changes by drag and drop.
 */

type Speed = 'slow' | 'normal' | 'fast';
const LINE_MS: Record<Speed, number> = { slow: 2300, normal: 1300, fast: 420 };
const MINUTE_MS: Record<Speed, number> = { slow: 650, normal: 240, fast: 45 };

type Match = LiveRound['matches'][number];

interface Incident {
  kind: 'injury' | 'red';
  playerId: number;
  minute: number;
  et?: boolean;
  tip: SubSuggestion | null;
  text: string;
}

/** A change the manager makes at a stoppage, replayed if an earlier one is taken back. */
type PlanOp =
  | { kind: 'sub'; offId: number; onId: number; intoIdx?: number }
  | { kind: 'move'; playerId: number; toIdx: number }
  | { kind: 'formation'; name: string };

/**
 * Changes waiting for the restart. They are made on the sim straight away (so every view
 * shows the side as it will be), but can be taken back until play restarts, when they are
 * confirmed and announced.
 */
interface Plan {
  mark: ChangeMark;
  ops: PlanOp[];
  lines: Set<CommentaryLine>;
}

interface LiveState {
  round: LiveRound;
  mine: Match;
  side: 0 | 1;
  /** Same league, same kick-off: shown as they happen. */
  alongside: Match[];
  /** Same league, earlier kick-off the same day: already finished. */
  earlier: Match[];
  queue: CommentaryLine[];
  shown: CommentaryLine[];
  speed: Speed;
  paused: boolean;
  /** Stoppages reached so far (half time, before extra time, extra-time half time, before penalties). */
  breaks: Set<string>;
  timer: number | null;
  flash: Set<number>;
  done: boolean;
  /** Events already checked for incidents. */
  seenEvents: number;
  incident: Incident | null;
  view: 'match' | 'tactics';
  panel: 'mine' | 'opp';
  /** Tactics view: a shirt (formation slot) or bench place waiting for a second click. */
  selSlot: number | null;
  selBench: number | null;
  plan: Plan | null;
  /** The assistant's half-time card: his report, the suggestions already taken, and whether it's showing. */
  ht: { rep: HalfTimeReport; applied: Set<number>; open: boolean } | null;
}

let live: LiveState | null = null;
let speedPref: Speed = 'normal';

export function isLive(): boolean {
  return live !== null;
}

export function liveFinished(): boolean {
  return !!live?.done;
}

export function startLiveMatch(ctx: Ctx): void {
  const g = ctx.game;
  const round = startDay(g);
  const mine = round.matches.find((m) => m.fixture.homeId === g.userClubId || m.fixture.awayId === g.userClubId)!;
  const side: 0 | 1 = mine.fixture.homeId === g.userClubId ? 0 : 1;
  mine.sim.setHuman(side, true);
  const league = round.matches.filter((m) => m !== mine && m.fixture.comp === mine.fixture.comp);
  const earlier = league.filter((m) => m.fixture.time < mine.fixture.time);
  for (const m of earlier) while (!m.sim.finished) m.sim.step();
  live = {
    round, mine, side,
    alongside: league.filter((m) => m.fixture.time === mine.fixture.time),
    earlier,
    queue: [], shown: [], speed: speedPref, paused: false, breaks: new Set(), timer: null, flash: new Set(), done: false,
    seenEvents: 0, incident: null, view: 'match', panel: 'mine', selSlot: null, selBench: null, plan: null, ht: null,
  };
  ctx.go('match');
  schedule(ctx, 400);
}

/** Apply the day to the game and leave the match screen. */
export function finishLiveMatch(ctx: Ctx): void {
  if (!live) return;
  if (live.timer !== null) clearTimeout(live.timer);
  confirmPlan();
  for (const m of live.round.matches) while (!m.sim.finished) m.sim.step();
  const fixtureId = live.mine.fixture.id;
  completeDay(ctx.game, live.round);
  trimSave(ctx.game);
  live = null;
  ctx.save();
  ctx.go('report', { fixtureId, afterMatch: true });
}

function schedule(ctx: Ctx, ms: number): void {
  if (!live) return;
  if (live.timer !== null) clearTimeout(live.timer);
  live.timer = window.setTimeout(() => tick(ctx), ms);
}

function stepAll(): void {
  if (!live) return;
  // Play restarts: the changes made at the stoppage are confirmed.
  confirmPlan();
  for (const m of live.round.matches) {
    if (m.sim.finished) continue;
    const before = m.sim.score[0] + m.sim.score[1];
    const lines = m.sim.step();
    if (m === live.mine) live.queue.push(...lines);
    else if (m.sim.score[0] + m.sim.score[1] > before) live.flash.add(m.fixture.id);
  }
}

/** Look for new injuries and red cards to the manager's players; returns true if the game should stop. */
function checkIncidents(): boolean {
  const L = live;
  if (!L) return false;
  const sim = L.mine.sim;
  const events = sim.events;
  let found: Incident | null = null;
  for (let i = L.seenEvents; i < events.length; i++) {
    const e = events[i];
    if (e.side !== L.side || (e.kind !== 'injury' && e.kind !== 'red')) continue;
    const p = sim.livePlayers(L.side).find((o) => o.p.id === e.playerId)?.p ?? sim.sides[L.side].appeared.find((o) => o.p.id === e.playerId)?.p;
    const who = p ? fullName(p) : 'A player';
    if (e.kind === 'injury') {
      const tip = sim.suggestForInjury(L.side, e.playerId);
      const on = tip ? sim.benchPlayers(L.side).find((b) => b.id === tip.onId) : null;
      found = {
        kind: 'injury', playerId: e.playerId, minute: e.minute, et: e.et, tip,
        text: tip && on
          ? `${who} is injured and struggling. Your assistant suggests bringing on ${fullName(on)} (${primaryPos(on)}).`
          : `${who} is injured, but you can't make a substitution. He'll have to play on.`,
      };
    } else {
      const tip = sim.suggestForRed(L.side, e.playerId);
      const on = tip ? sim.benchPlayers(L.side).find((b) => b.id === tip.onId) : null;
      const off = tip ? sim.livePlayers(L.side).find((o) => o.p.id === tip.offId)?.p : null;
      const keeper = sim.subsMade(L.side).some((s) => s.minute === e.minute && s.otherId !== undefined && (sim.sides[L.side].appeared.find((o) => o.p.id === s.otherId)?.slot === 'GK'));
      found = {
        kind: 'red', playerId: e.playerId, minute: e.minute, et: e.et, tip,
        text: tip && on && off
          ? `${who} has been sent off and you're down to ten. Your assistant suggests taking off ${fullName(off)} and bringing on ${fullName(on)} to fill the gap.`
          : `${who} has been sent off and you're down to ten.${keeper ? ' Your assistant has sent on the substitute keeper.' : ''} Open Tactics to reorganise.`,
      };
    }
  }
  L.seenEvents = events.length;
  if (found) L.incident = found;
  return !!found;
}

function tick(ctx: Ctx): void {
  const L = live;
  if (!L) return;
  L.timer = null;
  if (L.paused || ctx.ui.screen !== 'match') return;
  if (L.queue.length) {
    const line = L.queue.shift()!;
    L.shown.push(line);
    showLine(ctx, line);
    const base = LINE_MS[L.speed];
    const next = L.queue[0];
    // Linger on build-up so the outcome lands; hurry through routine play.
    const wait = line.tone === 'goal' ? base * 1.6 : line.tone === 'var' ? base * 1.5 : line.tone === 'chance' && next?.minute === line.minute ? base : line.tone === 'plain' ? base * 0.55 : base * 0.8;
    schedule(ctx, wait);
    return;
  }
  if (!L.mine.sim.finished) {
    const br = pendingBreak(L.mine.sim);
    if (br) {
      L.breaks.add(br);
      L.paused = true;
      // Extra time brings a new substitution: show the controls afresh. Half time brings the assistant's card.
      if (br === 'ht' && openHalfTime()) ctx.render();
      else if (br === 'et' || br === 'pens') ctx.render();
      else updateControls(ctx);
      return;
    }
    stepAll();
    if (checkIncidents()) {
      // Show the moment itself, then stop.
      L.shown.push(...L.queue);
      L.queue = [];
      L.paused = true;
      ctx.render();
      return;
    }
    updateBoard(ctx);
    schedule(ctx, MINUTE_MS[L.speed]);
    return;
  }
  // Our match is over: let the other grounds finish too.
  for (const m of L.round.matches) while (!m.sim.finished) m.sim.step();
  L.done = true;
  L.view = 'match';
  L.incident = null;
  ctx.render();
}

function sideClub(ctx: Ctx, side: 0 | 1 | undefined): Club | null {
  if (!live || side === undefined) return null;
  return club(ctx.game, side === 0 ? live.mine.fixture.homeId : live.mine.fixture.awayId);
}

/** Commentary panel colours: the club on the ball, or neutral for general announcements. */
function stageStyle(ctx: Ctx, line?: CommentaryLine): string {
  const c = sideClub(ctx, line && line.tone !== 'info' && line.tone !== 'var' ? line.side : undefined);
  if (!c) return '';
  return clubStrip(c).replace('--strip-bg', '--lm-bg').replace('--strip-fg', '--lm-fg');
}

function showLine(ctx: Ctx, line: CommentaryLine): void {
  const stage = document.getElementById('lm-stage');
  if (stage) {
    stage.setAttribute('style', stageStyle(ctx, line));
    stage.classList.toggle('goal', line.tone === 'goal');
  }
  const cur = document.getElementById('lm-line');
  if (cur) {
    cur.className = `lm-line t-${line.tone}`;
    cur.textContent = line.text;
  }
  const log = document.getElementById('lm-log');
  if (log && line.tone !== 'plain') {
    const li = document.createElement('li');
    li.className = `t-${line.tone}`;
    li.innerHTML = `<span class="min">${minuteLabel(line.minute, line.stage)}</span>${esc(line.text)}`;
    log.prepend(li);
  }
  if (line.tone === 'goal') updateBoard(ctx);
}

function mentalityButtons(sim: MatchSim, side: 0 | 1): string {
  const cur = sim.sides[side].tactics.mentality;
  return (['defensive', 'balanced', 'attacking'] as Mentality[])
    .map((m) => `<button class="seg${m === cur ? ' on' : ''}" data-act="live-mentality" data-m="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('');
}

function playerRows(sim: MatchSim, side: 0 | 1, hl: number | null): string {
  const incoming = new Set(live && side === live.side ? waitingSubs().map((w) => w.onId) : []);
  return sim.livePlayers(side).map((o) => `<tr class="${o.p.id === hl ? 'hl' : ''}${incoming.has(o.p.id) ? ' incoming' : ''}"><td class="slot">${o.slot}</td><td>${incoming.has(o.p.id) ? '<span class="in-tag">IN</span> ' : ''}${esc(shortName(o.p))}${o.goals ? ' <i class="ic goal" title="Scored"></i>'.repeat(o.goals) : ''}${o.yellow ? ' <i class="ic yel" title="Booked"></i>' : ''}${o.injured ? ' <i class="ic inj" title="Injured"></i>' : ''}</td>
      <td class="cond-cell"><span class="condbar" title="Condition ${Math.round(o.cond)}%"><i style="width:${o.cond}%" class="${o.cond < 65 ? 'low' : ''}"></i></span> <b class="${condClass(o.cond)}">${Math.round(o.cond)}%</b></td>
      <td class="n rating">${Math.max(3, Math.min(10, o.rating)).toFixed(1)}</td></tr>`).join('');
}

function subsStatus(sim: MatchSim, side: 0 | 1): string {
  const made = sim.subsMade(side).length;
  const left = sim.sides[side].subsLeft;
  const total = made + left;
  if (sim.finished) return `${made} substitution${made === 1 ? '' : 's'} made`;
  if (sim.phase === 'pens') return 'No changes during a shoot-out';
  if (!left) return `All ${total === MAX_SUBS ? 'five' : 'six'} substitutions made`;
  const w = sim.windowsLeft(side);
  const waiting = live && side === live.side ? waitingSubs().length : 0;
  if (waiting) return `${left} of ${total} subs left · ${waiting} waiting for the restart`;
  const open = sim.interval ? ` · ${sim.phase === 'et' ? 'a break in play' : 'half time'}: changes now don't use a stoppage` : '';
  return `${left} of ${total} subs left · ${w} stoppage${w === 1 ? '' : 's'} left${open}`;
}

function subControls(sim: MatchSim, side: 0 | 1): string {
  if (sim.finished) return '';
  const tip = live?.incident?.tip;
  const plan = planHtml();
  if (!sim.canSub(side)) return `${plan}<p class="small-note" style="margin:6px 8px 0">${esc(subsStatus(sim, side))}.${sim.sides[side].subsLeft && sim.phase !== 'pens' ? ' No stoppages left for changes.' : ''}</p>`;
  const off = sim.livePlayers(side).sort((x, y) => Number(y.injured) - Number(x.injured) || (x.slot === 'GK' ? 1 : 0) - (y.slot === 'GK' ? 1 : 0) || x.cond - y.cond)
    .map((o) => `<option value="${o.p.id}"${tip?.offId === o.p.id ? ' selected' : ''}>${o.slot} ${esc(o.p.lastName)} (${o.injured ? 'injured' : `${Math.round(o.cond)}%`})</option>`).join('');
  const on = sim.benchPlayers(side).map((p) => `<option value="${p.id}"${tip?.onId === p.id ? ' selected' : ''}>${primaryPos(p)} ${esc(p.lastName)} (${Math.round(p.condition)}%)</option>`).join('');
  return `${plan}<div class="subs"><label>Off <select class="cm" id="sub-off">${off}</select></label><label>On <select class="cm" id="sub-on">${on}</select></label>
    <button class="btn small" data-act="live-sub">Substitute</button></div><p class="small-note" style="margin:4px 8px 0">${esc(subsStatus(sim, side))}</p>`;
}

function instructionsHtml(sim: MatchSim, side: 0 | 1): string {
  const t = sim.sides[side].tactics as Tactics;
  return `<div class="instr-row"><label for="ti-passing">Passing</label>${instructionSelect(t, 'passing', [['short', 'Short'], ['mixed', 'Mixed'], ['long', 'Long']], 'live-instruction')}
    <label for="ti-closingDown">Closing down</label>${instructionSelect(t, 'closingDown', [['own-half', 'Own half'], ['mixed', 'Mixed'], ['all-over', 'All over']], 'live-instruction')}</div>`;
}

function statsHtml(ctx: Ctx, sim: MatchSim): string {
  const [h, a] = sim.sides;
  const poss = h.possession + a.possession || 1;
  const hp = Math.round((h.possession / poss) * 100);
  const cols = barColours(club(ctx.game, h.club.id), club(ctx.game, a.club.id));
  return statBar('Possession', [hp, 100 - hp], cols, true) + statBar('Shots', [h.shots, a.shots], cols) + statBar('On target', [h.onTarget, a.onTarget], cols) + statBar('Corners', [h.corners, a.corners], cols);
}

function scoreLine(ctx: Ctx, m: Match, extra = ''): string {
  const h = club(ctx.game, m.fixture.homeId);
  const a = club(ctx.game, m.fixture.awayId);
  const fl = live!.flash.has(m.fixture.id);
  return `<li class="${fl ? 'flash' : ''}"><span class="r">${esc(h.name)}</span><b>${m.sim.score[0]}-${m.sim.score[1]}</b><span>${esc(a.name)}${extra}</span></li>`;
}

function othersHtml(ctx: Ctx): string {
  if (!live) return '';
  const now = live.alongside.map((m) => scoreLine(ctx, m)).join('');
  const before = live.earlier.map((m) => scoreLine(ctx, m, ` <i class="ft">FT</i>`)).join('');
  if (!now && !before) return '<li class="none">No other games in this league kick off at the same time.</li>';
  return (now || '<li class="none">No other games kick off at the same time.</li>') + (before ? `<li class="sub-label">Earlier today</li>${before}` : '');
}

/** The clock, or where the match has got to: half time, extra time, penalties. */
function clockText(sim: MatchSim): string {
  const pens = sim.shootout;
  if (sim.finished) {
    if (pens) return `${pens[0]}-${pens[1]} ON PENALTIES`;
    return sim.phase === 'et' ? 'AFTER EXTRA TIME' : 'FULL TIME';
  }
  if (sim.phase === 'pens') return pens && sim.kicksTaken ? `PENALTIES ${pens[0]}-${pens[1]}` : 'PENALTIES';
  if (sim.minute === 0) return 'KICK-OFF';
  if (live?.paused && sim.phase === 'normal' && sim.minute === 45 && live.breaks.has('ht')) return 'HALF TIME';
  if (live?.paused && sim.phase === 'et' && sim.minute === 90) return 'AFTER 90 MINS';
  if (live?.paused && sim.phase === 'et' && sim.minute === 105) return 'ET HALF TIME';
  return `${sim.clockLabel}'`;
}

/** Second legs: the aggregate score. */
function aggText(sim: MatchSim): string {
  if (!sim.isSecondLeg) return '';
  const [x, y] = sim.aggregate;
  return `Aggregate ${x}-${y}`;
}

/** Stoppages where the match waits for the manager: half time, before extra time, its half time, before penalties. */
function pendingBreak(sim: MatchSim): 'ht' | 'et' | 'et-ht' | 'pens' | null {
  if (sim.finished || !live) return null;
  const b = live.breaks;
  if (sim.phase === 'normal' && sim.minute === 45 && !b.has('ht')) return 'ht';
  if (sim.phase === 'et' && sim.minute === 90 && !b.has('et')) return 'et';
  if (sim.phase === 'et' && sim.minute === 105 && !b.has('et-ht')) return 'et-ht';
  if (sim.phase === 'pens' && sim.kicksTaken === 0 && !b.has('pens')) return 'pens';
  return null;
}

/** At a stoppage now (paused, waiting to restart)? */
function atBreak(sim: MatchSim): boolean {
  if (!live || sim.finished) return false;
  const b = live.breaks;
  return (sim.phase === 'normal' && sim.minute === 45 && b.has('ht'))
    || (sim.phase === 'et' && sim.minute === 90 && b.has('et'))
    || (sim.phase === 'et' && sim.minute === 105 && b.has('et-ht'))
    || (sim.phase === 'pens' && b.has('pens') && sim.kicksTaken === 0);
}

function updateBoard(ctx: Ctx): void {
  if (!live) return;
  const sim = live.mine.sim;
  const set = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('lm-score', `${sim.score[0]} - ${sim.score[1]}`);
  set('lm-clock', clockText(sim));
  set('lm-agg', aggText(sim));
  set('lm-stats', statsHtml(ctx, sim));
  set('lm-others', othersHtml(ctx));
  const side = live.panel === 'mine' ? live.side : (1 - live.side) as 0 | 1;
  set('lm-team', playerRows(sim, side, live.panel === 'mine' ? incidentHl() : null));
  if (live.panel === 'opp') set('lm-opp-bench', oppBench(sim, side));
  live.flash.clear();
}

function updateControls(ctx: Ctx): void {
  if (!live) return;
  const el = document.getElementById('lm-controls');
  if (el) el.innerHTML = controlsHtml();
  const subs = document.getElementById('lm-subs');
  if (subs && live.panel === 'mine') subs.innerHTML = subControls(live.mine.sim, live.side);
  updateBoard(ctx);
}

function controlsHtml(): string {
  if (!live) return '';
  if (live.done) return `<button class="btn primary" data-act="live-finish">Match report</button>`;
  const sim = live.mine.sim;
  const speeds = (['slow', 'normal', 'fast'] as Speed[]).map((s) => `<button class="seg${s === live!.speed ? ' on' : ''}" data-act="live-speed" data-s="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('');
  const ht = live.paused && atBreak(sim);
  const restart = sim.phase === 'pens' ? 'Start the shoot-out' : sim.phase === 'et' ? (sim.minute === 90 ? 'Start extra time' : 'Start second half of extra time') : 'Start second half';
  const tactics = live.view === 'tactics'
    ? '<button class="btn primary" data-act="live-view" data-v="match">Back to the match</button>'
    : sim.phase === 'pens' ? '' : '<button class="btn" data-act="live-view" data-v="tactics">Tactics</button>';
  const skipHt = sim.phase === 'normal' && sim.minute < 45 ? '<button class="btn ghost" data-act="live-skip-ht">Skip to half time</button>' : '';
  return `<div class="segs" role="group" aria-label="Speed">${speeds}</div>
    <button class="btn${(ht || waitingSubs().length) && live.view === 'match' ? ' primary' : ''}" data-act="live-pause">${live.paused ? (ht ? restart : waitingSubs().length ? 'Restart play' : 'Resume') : 'Pause'}</button>
    ${tactics}${skipHt}
    <button class="btn ghost" data-act="live-skip">${sim.phase === 'normal' ? 'Skip to full time' : 'Skip to the end'}</button>`;
}

/** The assistant reads the first half (once). Returns true if there's a card to show. */
function openHalfTime(): boolean {
  const L = live;
  if (!L || L.ht) return !!L?.ht;
  const rep = halfTimeReport(L.mine.sim, L.side);
  if (!rep) return false;
  L.ht = { rep, applied: new Set(), open: true };
  return true;
}

function htHtml(ctx: Ctx): string {
  const L = live;
  if (!L?.ht?.open || L.done || L.view !== 'match' || L.incident) return '';
  const sim = L.mine.sim;
  if (!(sim.phase === 'normal' && sim.minute === 45 && atBreak(sim))) return '';
  return htCardHtml(ctx.game, userClub(ctx.game), L.ht.rep, L.ht.applied);
}

/** Make one of the assistant's half-time changes. */
function applyHt(ctx: Ctx, i: number): boolean {
  const L = live;
  const s = L?.ht?.rep.suggestions[i];
  if (!L || !L.ht || !s || L.ht.applied.has(i)) return false;
  const sim = L.mine.sim;
  let ok = true;
  if (s.kind === 'sub') ok = makeSub(ctx, s.offId, s.onId, s.intoIdx);
  else if (s.kind === 'mentality') sim.setMentality(L.side, s.value);
  else if (s.kind === 'instr') sim.setInstruction(L.side, s.key, s.value as never);
  else sim.setRuns(L.side, s.playerId, { ...sim.runsOf(L.side, s.playerId), ball: true });
  if (!ok) return false;
  if (s.kind !== 'sub') flushChanges();
  L.ht.applied.add(i);
  return true;
}

function incidentHtml(): string {
  const I = live?.incident;
  if (!I) return '';
  const canApply = I.tip && live!.mine.sim.canSub(live!.side);
  return `<div class="incident ${I.kind}" role="alert" id="incident"><span class="inc-icon" aria-hidden="true">${I.kind === 'red' ? '' : '✚'}</span>
    <p><b>${minuteLabel(I.minute, I.et)}</b> ${esc(I.text)}</p>
    <div class="inc-actions">${canApply ? '<button class="btn primary" data-act="live-apply-tip">Make the change</button>' : ''}
    ${live!.view === 'tactics' ? '' : '<button class="btn" data-act="live-view" data-v="tactics">Tactics</button>'}
    <button class="btn ghost" data-act="live-dismiss">Carry on</button></div></div>`;
}

/** The player to pick out after an incident: the one the assistant suggests taking off, else the one hurt. */
function incidentHl(): number | null {
  const I = live?.incident;
  return I ? I.tip?.offId ?? I.playerId : null;
}

/* ───────────────────────── Opposition ───────────────────────── */

const INSTR_WORD: Record<string, Record<string, string>> = {
  passing: { short: 'Short passing', mixed: 'Mixed passing', long: 'Long ball' },
  tackling: { easy: 'Stays on feet', normal: 'Normal tackling', hard: 'Hard tackling' },
  closingDown: { 'own-half': 'Sits off', mixed: 'Presses at times', 'all-over': 'Presses all over' },
};

function oppSummary(sim: MatchSim, side: 0 | 1): string {
  const t = sim.sides[side].tactics;
  const bits = [
    sim.formationOf(side),
    t.mentality[0].toUpperCase() + t.mentality.slice(1),
    INSTR_WORD.passing[t.passing],
    INSTR_WORD.closingDown[t.closingDown],
    INSTR_WORD.tackling[t.tackling],
    t.counterAttack ? 'Counter-attacks' : '',
    t.offsideTrap ? 'Plays offside trap' : '',
  ].filter(Boolean);
  return `<p class="opp-shape">${bits.map((b) => `<span class="chip">${esc(b)}</span>`).join(' ')}</p>`;
}

function oppBench(sim: MatchSim, side: 0 | 1): string {
  const subs = sim.subsMade(side);
  const bench = sim.benchPlayers(side);
  return `<b>Bench:</b> ${bench.length ? bench.map((p) => `${esc(p.lastName)} (${primaryPos(p)})`).join(', ') : 'none left'}${subs.length ? ` · <b>${subs.length}</b> sub${subs.length > 1 ? 's' : ''} made` : ''}`;
}

/* ───────────────────────── Tactics view ───────────────────────── */

function famClass(o: LivePlayer): string {
  const fam = o.p.pos[o.slot] ?? 0;
  return fam >= 20 ? 'nat' : fam >= 15 ? 'acc' : 'awk';
}

/** The pitch as it stands: shirts in formation places, gaps after red cards, and (for the manager's side) drag and drop. */
function livePitch(sim: MatchSim, side: 0 | 1, c: Club, interactive: boolean, sel: number | null, hl: number | null): string {
  const f = getFormation(sim.formationOf(side));
  const players = sim.livePlayers(side);
  const vacant = new Set(sim.vacantSlots(side));
  const tokens = f.coords.map(([x, y], i) => {
    if (vacant.has(i)) {
      return `<div class="token vacant" style="left:${x}%;bottom:${y}%" ${interactive ? `data-drop-slot="${i}"` : ''}><span class="shirt">–</span><span class="tname">${f.slots[i]}</span></div>`;
    }
    const o = players.find((q) => q.idx === i);
    if (!o) return '';
    const incoming = interactive && waitingSubs().some((w) => w.onId === o.p.id);
    const tired = interactive && o.cond < 85 ? ` <span class="tcond ${condClass(o.cond)}">${Math.round(o.cond)}%</span>` : '';
    const attrs = interactive ? `data-act="lt-slot" data-i="${i}" data-drag="xi" data-id="${o.p.id}" data-drop-slot="${i}"` : 'tabindex="-1" disabled';
    return `<button class="token ${famClass(o)}${sel === i ? ' sel' : ''}${hl === o.p.id ? ' hl' : ''}${incoming ? ' incoming' : ''}" style="left:${x}%;bottom:${y}%;--k1:${c.colours[0]};--k2:${c.colours[1]}" ${attrs} aria-label="${o.slot}: ${esc(fullName(o.p))}">
      <span class="shirt">${o.p.squadNo}${incoming ? '<span class="in-tag">IN</span>' : ''}</span><span class="tname">${o.injured ? '<b class="inj">✚</b> ' : ''}${esc(o.p.lastName)}${tired}</span>${interactive ? condBar(o.cond) : ''}</button>`;
  }).join('');
  const ctl = interactive
    ? players.filter((o) => o.slot !== 'GK' && !vacant.has(o.idx)).map((o) => runControls(f.coords[o.idx][0], f.coords[o.idx][1], o.p.id, sim.runsOf(side, o.p.id), 'live-run')).join('')
    : '';
  return `<div class="pitch${interactive ? '' : ' small'}">${tokens}${ctl}<span class="pitch-line half"></span><span class="pitch-circle"></span><span class="pitch-box top"></span><span class="pitch-box bottom"></span></div>`;
}

function tacticsView(ctx: Ctx): string {
  const L = live!;
  const sim = L.mine.sim;
  const me = sideClub(ctx, L.side)!;
  const oppSide = (1 - L.side) as 0 | 1;
  const opp = sideClub(ctx, oppSide)!;
  const t = sim.sides[L.side].tactics as Tactics;
  const formations = FORMATIONS.map((x) => `<option value="${x.name}"${x.name === sim.formationOf(L.side) ? ' selected' : ''}>${x.name}</option>`).join('');
  const instr = INSTRUCTIONS.map((i) => `<label for="ti-${String(i.key)}">${i.label}</label>${instructionSelect(t, i.key, i.opts, 'live-instruction')}`).join('');
  const bench = sim.benchPlayers(L.side);
  const canSub = sim.canSub(L.side);
  const hint = L.selSlot !== null
    ? 'Click another shirt to swap them, or a substitute to bring him on here.'
    : L.selBench !== null
      ? 'Now click the shirt of the player to take off.'
      : canSub
        ? 'Drag a substitute onto a shirt to bring him on, or drag one shirt onto another to swap positions. Clicking works too.'
        : 'Drag one shirt onto another to swap positions.';
  const benchHtml = benchRow(bench, me.colours, { sel: L.selBench, drop: false, act: canSub ? 'lt-bench' : undefined, count: subsStatus(sim, L.side) });
  return `<div class="live-tactics">
      <div class="lt-main">
        <div class="instr-row"><label for="lt-formation"><b>Formation</b></label><select class="cm" id="lt-formation" data-change="live-formation">${formations}</select>
          <div class="segs small" role="group" aria-label="Mentality">${mentalityButtons(sim, L.side)}</div></div>
        <p class="hint">${hint}</p>
        ${livePitch(sim, L.side, me, true, L.selSlot, L.incident?.playerId ?? null)}
        <p class="legend"><i>White</i> natural position · <i class="acc">Green</i> accomplished · <i class="awk">Red</i> out of position · <i class="awk">✚</i> injured</p>
        ${planHtml()}
        ${benchHtml}
      </div>
      <div class="lt-side">
        <div class="lm-col"><h4>TEAM INSTRUCTIONS</h4><div class="instr compact">${instr}</div></div>
        <div class="lm-col"><h4>OPPOSITION · ${esc(opp.name.toUpperCase())}</h4>${oppSummary(sim, oppSide)}<div class="opp-pitch">${livePitch(sim, oppSide, opp, false, null, null)}</div><p class="small-note opp-bench">${oppBench(sim, oppSide)}</p></div>
      </div>
    </div>`;
}

/* ───────────────────────── Screen ───────────────────────── */

export function matchScreen(ctx: Ctx): string {
  if (!live) return '<section class="panel"><p class="pad">No match in progress.</p></section>';
  const g = ctx.game;
  const sim = live.mine.sim;
  const f: Fixture = live.mine.fixture;
  const h = club(g, f.homeId);
  const a = club(g, f.awayId);
  const last = live.shown[live.shown.length - 1];
  const log = live.shown.filter((l) => l.tone !== 'plain').slice().reverse()
    .map((l) => `<li class="t-${l.tone}"><span class="min">${minuteLabel(l.minute, l.stage)}</span>${esc(l.text)}</li>`).join('');
  const me = userClub(g);
  const oppSide = (1 - live.side) as 0 | 1;
  const opp = sideClub(ctx, oppSide)!;
  const tabs = `<div class="segs small tabs" role="tablist" aria-label="Team shown"><button class="seg${live.panel === 'mine' ? ' on' : ''}" data-act="live-panel" data-p="mine" role="tab" aria-selected="${live.panel === 'mine'}">${esc(me.name)}</button><button class="seg${live.panel === 'opp' ? ' on' : ''}" data-act="live-panel" data-p="opp" role="tab" aria-selected="${live.panel === 'opp'}">${esc(opp.name)}</button></div>`;
  const teamCol = live.panel === 'mine'
    ? `<div class="segs small" role="group" aria-label="Mentality">${mentalityButtons(sim, live.side)}</div>
        ${sim.finished ? '' : instructionsHtml(sim, live.side)}
        <table class="grid compact live-team"><tbody id="lm-team">${playerRows(sim, live.side, incidentHl())}</tbody></table>
        <div id="lm-subs">${subControls(sim, live.side)}</div>`
    : `${oppSummary(sim, oppSide)}
        <table class="grid compact live-team"><tbody id="lm-team">${playerRows(sim, oppSide, null)}</tbody></table>
        <p class="small-note opp-bench" id="lm-opp-bench">${oppBench(sim, oppSide)}</p>`;
  const body = live.view === 'tactics' && !live.done
    ? tacticsView(ctx)
    : `<div class="live-grid">
      <div class="lm-col">
        <h4>KEY MOMENTS</h4>
        <ol class="lm-log" id="lm-log">${log}</ol>
      </div>
      <div class="lm-col">
        <h4>MATCH STATS</h4><div class="stats-block" id="lm-stats">${statsHtml(ctx, sim)}</div>
        <h4>LATEST SCORES · ${esc(compName(g, f.comp).toUpperCase())}</h4><ul class="others" id="lm-others">${othersHtml(ctx)}</ul>
      </div>
      <div class="lm-col">
        <h4>TEAMS</h4>${tabs}
        ${teamCol}
      </div>
    </div>`;
  return `<section class="panel live">
    <header class="strip"><h2>${esc(compName(g, f.comp))} <small>– ${esc(stageText(g, f))}</small></h2><span class="strip-meta">${esc(f.neutral ?? h.stadium)} · ${f.time}</span></header>
    <div class="scoreboard live-sb">
      <div class="sb-team" style="${clubStrip(h)}">${esc(h.name)}</div>
      <div class="sb-mid"><div class="sb-score" id="lm-score">${sim.score[0]} - ${sim.score[1]}</div><div class="sb-clock" id="lm-clock">${clockText(sim)}</div><div class="sb-agg" id="lm-agg">${aggText(sim)}</div></div>
      <div class="sb-team" style="${clubStrip(a)}">${esc(a.name)}</div>
    </div>
    <div class="lm-stage${last?.tone === 'goal' ? ' goal' : ''}" id="lm-stage" style="${stageStyle(ctx, last)}"><p id="lm-line" class="lm-line ${last ? `t-${last.tone}` : 't-info'}" aria-live="polite">${last ? esc(last.text) : `Welcome to ${esc(f.neutral ?? h.stadium)}.`}</p></div>
    ${incidentHtml()}
    ${htHtml(ctx)}
    <div class="lm-controls" id="lm-controls">${controlsHtml()}</div>
    ${body}
  </section>`;
}

/** Called after a full re-render of the match screen, so the loop keeps going. */
export function resumeAfterRender(ctx: Ctx): void {
  if (live && !live.paused && !live.done && live.timer === null) schedule(ctx, 300);
  if (live) updateBoard(ctx);
}

/** Lines the sim produced outside step() (tactical changes, subs) that are not yet queued or shown. */
function drainNew(sim: MatchSim): CommentaryLine[] {
  if (!live) return [];
  const known = new Set([...live.shown, ...live.queue]);
  const held = live.plan?.lines;
  return sim.lines.filter((l) => !known.has(l) && !held?.has(l));
}

/** After a change: show it in the commentary (straight away if paused). */
function flushChanges(): void {
  if (!live) return;
  const fresh = drainNew(live.mine.sim);
  if (live.paused) live.shown.push(...fresh);
  else live.queue.push(...fresh);
  live.seenEvents = live.mine.sim.events.length;
}

function applyOp(sim: MatchSim, side: 0 | 1, op: PlanOp): boolean {
  if (op.kind === 'sub') return sim.substitute(side, op.offId, op.onId, op.intoIdx);
  if (op.kind === 'move') return sim.movePlayer(side, op.playerId, op.toIdx);
  if (sim.formationOf(side) === op.name) return false;
  sim.setFormation(side, op.name);
  return true;
}

/** Make a change. A substitution starts (or joins) the plan for the restart; other changes join a plan already open. */
function change(op: PlanOp): boolean {
  const L = live;
  if (!L) return false;
  const sim = L.mine.sim;
  if (!L.plan && op.kind !== 'sub') return applyOp(sim, L.side, op);
  const fresh = !L.plan;
  if (fresh) L.plan = { mark: sim.markChanges(L.side), ops: [], lines: new Set() };
  const plan = L.plan!;
  const n = sim.lines.length;
  if (!applyOp(sim, L.side, op)) {
    if (fresh) L.plan = null;
    return false;
  }
  for (const l of sim.lines.slice(n)) plan.lines.add(l);
  plan.ops.push(op);
  return true;
}

/** Play restarts: the waiting changes are confirmed and announced. */
function confirmPlan(): void {
  const L = live;
  if (!L?.plan) return;
  const held = L.plan.lines;
  L.plan = null;
  L.queue.push(...L.mine.sim.lines.filter((l) => held.has(l)));
  L.seenEvents = L.mine.sim.events.length;
}

/** Take back one waiting substitution (index into the plan), or all of them. */
function undoPlan(index: number | 'all'): void {
  const L = live;
  if (!L?.plan) return;
  const sim = L.mine.sim;
  const { mark, ops, lines } = L.plan;
  sim.rollback(L.side, mark, lines);
  L.plan = null;
  if (index !== 'all') {
    const keep = ops.filter((_, i) => i !== index);
    // Replay what's left; a change that depended on the one taken back simply drops out.
    for (const op of keep) {
      if (op.kind === 'sub' || L.plan) change(op);
      else applyOp(sim, L.side, op);
    }
    if (L.plan && !(L.plan as Plan).ops.some((o) => o.kind === 'sub')) {
      L.plan = null;
      flushChanges();
    }
  }
  L.seenEvents = sim.events.length;
  L.selSlot = null;
  L.selBench = null;
}

function waitingSubs(): Extract<PlanOp, { kind: 'sub' }>[] {
  return (live?.plan?.ops.filter((o) => o.kind === 'sub') ?? []) as Extract<PlanOp, { kind: 'sub' }>[];
}

function makeSub(ctx: Ctx, offId: number, onId: number, intoIdx?: number): boolean {
  if (!live) return false;
  const sim = live.mine.sim;
  if (!sim.canSub(live.side)) {
    ctx.toast(sim.sides[live.side].subsLeft ? 'No stoppages left for substitutions.' : 'You have made all five substitutions.');
    return false;
  }
  const on = sim.benchPlayers(live.side).find((p) => p.id === onId);
  if (!change({ kind: 'sub', offId, onId, intoIdx })) return false;
  if (live.incident && (live.incident.playerId === offId || live.incident.tip?.offId === offId)) live.incident = null;
  // A change is made at a stoppage: the game waits for the manager to restart it.
  if (!live.paused) {
    live.paused = true;
    if (live.timer !== null) clearTimeout(live.timer);
    live.timer = null;
  }
  flushChanges();
  ctx.toast(`${on ? on.lastName : 'The substitute'} goes on when play restarts`);
  return true;
}

/** The waiting substitutions, each with an undo, and the restart button. */
function planHtml(): string {
  const L = live;
  const subs = waitingSubs();
  if (!L || !subs.length) return '';
  const sim = L.mine.sim;
  const name = (id: number) => {
    const p = sim.sides[L.side].appeared.find((o) => o.p.id === id)?.p ?? sim.benchPlayers(L.side).find((b) => b.id === id);
    return p ? esc(p.lastName) : '?';
  };
  const ops = L.plan!.ops;
  const rows = subs.map((op) => `<li><span class="in">▲ ${name(op.onId)}</span> <span class="for">for</span> <span class="out">▼ ${name(op.offId)}</span> <button class="btn tiny" data-act="plan-undo" data-i="${ops.indexOf(op)}">Undo</button></li>`).join('');
  return `<div class="sub-plan" role="status"><div class="sp-head"><b>Waiting to come on</b><span class="small-note">Confirmed when play restarts</span></div><ul>${rows}</ul>
    <div class="sp-actions"><button class="btn small primary" data-act="live-restart">Restart play ►</button>${subs.length > 1 ? '<button class="btn small ghost" data-act="plan-undo" data-i="all">Undo all</button>' : ''}</div></div>`;
}

/** Drag and drop during the match: swap positions, or drag a substitute onto the player to replace. */
export function liveDrop(ctx: Ctx, src: DragSource, target: DropTarget): void {
  const L = live;
  if (!L || L.done) return;
  const sim = L.mine.sim;
  const at = (idx: number) => sim.livePlayers(L.side).find((o) => o.idx === idx);
  let changed = false;
  if (target.slot !== null) {
    if (src.kind === 'xi') changed = change({ kind: 'move', playerId: src.playerId, toIdx: target.slot });
    else if (src.kind === 'bench') {
      const off = at(target.slot);
      if (off) changed = makeSub(ctx, off.p.id, src.playerId);
      else ctx.toast('Drop the substitute on the player you want to take off.');
    }
  } else if (target.bench !== null && src.kind === 'xi') {
    const on = sim.benchPlayers(L.side)[target.bench];
    if (on) changed = makeSub(ctx, src.playerId, on.id);
  }
  if (changed) {
    L.selSlot = null;
    L.selBench = null;
    flushChanges();
    ctx.render();
  }
}

/** Leave the tactics view or an incident and get the game going again (unless it's half time, or subs are waiting). */
function carryOn(ctx: Ctx, restart = false): void {
  const L = live;
  if (!L) return;
  L.incident = null;
  L.view = 'match';
  // Substitutions waiting to go on keep the game stopped until the manager restarts it.
  L.paused = atBreak(L.mine.sim) || (!restart && waitingSubs().length > 0);
  ctx.render();
  if (!L.paused) schedule(ctx, 300);
}

export const liveActions: Record<string, Action> = {
  'live-speed': (ctx, el) => {
    if (!live) return;
    live.speed = speedPref = el.dataset.s as Speed;
    updateControls(ctx);
  },
  'live-pause': (ctx) => {
    if (!live) return;
    live.paused = !live.paused;
    if (!live.paused) {
      live.incident = null;
      live.view = 'match';
      ctx.render();
      schedule(ctx, 200);
    } else updateControls(ctx);
  },
  'live-skip': (ctx) => {
    if (!live) return;
    if (live.timer !== null) clearTimeout(live.timer);
    live.timer = null;
    confirmPlan();
    // The assistant looks after the side for the rest of the game, injuries included.
    live.mine.sim.setHuman(live.side, false);
    while (!live.mine.sim.finished) stepAll();
    live.shown.push(...live.queue);
    live.queue = [];
    live.paused = false;
    live.incident = null;
    live.view = 'match';
    for (const m of live.round.matches) while (!m.sim.finished) m.sim.step();
    live.done = true;
    ctx.render();
  },
  'live-skip-ht': (ctx) => {
    const L = live;
    if (!L || L.mine.sim.minute >= 45 || L.mine.sim.phase !== 'normal') return;
    if (L.timer !== null) clearTimeout(L.timer);
    L.timer = null;
    let stopped = false;
    while (L.mine.sim.minute < 45) {
      stepAll();
      if (checkIncidents()) {
        stopped = true;
        break;
      }
    }
    L.shown.push(...L.queue);
    L.queue = [];
    L.paused = true;
    if (!stopped) {
      L.breaks.add('ht');
      openHalfTime();
    }
    ctx.render();
  },
  'live-finish': (ctx) => finishLiveMatch(ctx),
  'ht-apply': (ctx, el) => {
    if (applyHt(ctx, Number(el.dataset.i))) ctx.render();
  },
  'ht-apply-all': (ctx) => {
    const n = live?.ht?.rep.suggestions.length ?? 0;
    let any = false;
    for (let i = 0; i < n; i++) any = applyHt(ctx, i) || any;
    if (any) {
      ctx.toast('Changes made: they take effect when the second half starts');
      ctx.render();
    }
  },
  'ht-dismiss': (ctx) => {
    if (live?.ht) live.ht.open = false;
    ctx.render();
  },
  'live-view': (ctx, el) => {
    if (!live) return;
    live.selSlot = null;
    live.selBench = null;
    if (el.dataset.v === 'tactics') {
      live.view = 'tactics';
      live.paused = true;
      ctx.render();
    } else carryOn(ctx);
  },
  'live-panel': (ctx, el) => {
    if (!live) return;
    live.panel = el.dataset.p as 'mine' | 'opp';
    ctx.render();
  },
  'live-dismiss': (ctx) => carryOn(ctx, true),
  'live-restart': (ctx) => {
    const L = live;
    if (!L || L.done) return;
    L.incident = null;
    L.view = 'match';
    L.paused = false;
    ctx.render();
    schedule(ctx, 200);
  },
  'plan-undo': (ctx, el) => {
    if (!live?.plan) return;
    const i = el.dataset.i === 'all' ? 'all' : Number(el.dataset.i);
    undoPlan(i);
    ctx.toast(i === 'all' ? 'Substitutions taken back' : 'Substitution taken back');
    ctx.render();
  },
  'live-apply-tip': (ctx) => {
    if (!live?.incident?.tip) return;
    const { offId, onId, intoIdx } = live.incident.tip;
    if (makeSub(ctx, offId, onId, intoIdx)) carryOn(ctx);
  },
  'live-mentality': (_ctx, el) => {
    if (!live || live.mine.sim.finished) return;
    live.mine.sim.setMentality(live.side, el.dataset.m as Mentality);
    flushChanges();
    const seg = el.parentElement;
    if (seg) seg.innerHTML = mentalityButtons(live.mine.sim, live.side);
  },
  'live-sub': (ctx) => {
    if (!live) return;
    const off = Number((document.getElementById('sub-off') as HTMLSelectElement | null)?.value);
    const on = Number((document.getElementById('sub-on') as HTMLSelectElement | null)?.value);
    if (makeSub(ctx, off, on)) ctx.render();
  },
  'live-run': (ctx, el) => {
    if (!live || live.mine.sim.finished) return;
    const id = Number(el.dataset.id);
    const k = el.dataset.k as 'ball' | 'off';
    const cur = { ...live.mine.sim.runsOf(live.side, id) };
    cur[k] = !cur[k];
    live.mine.sim.setRuns(live.side, id, cur);
    ctx.render();
  },
  'lt-slot': (ctx, el) => {
    const L = live;
    if (!L) return;
    const i = Number(el.dataset.i);
    const sim = L.mine.sim;
    const here = sim.livePlayers(L.side).find((o) => o.idx === i);
    if (L.selBench !== null && here) {
      const on = sim.benchPlayers(L.side)[L.selBench];
      if (on) makeSub(ctx, here.p.id, on.id);
      L.selBench = null;
    } else if (L.selSlot !== null && L.selSlot !== i) {
      const mover = sim.livePlayers(L.side).find((o) => o.idx === L.selSlot);
      if (mover) change({ kind: 'move', playerId: mover.p.id, toIdx: i });
      L.selSlot = null;
    } else {
      L.selSlot = L.selSlot === i ? null : i;
    }
    ctx.render();
  },
  'lt-bench': (ctx, el) => {
    const L = live;
    if (!L) return;
    const b = Number(el.dataset.i);
    const sim = L.mine.sim;
    if (L.selSlot !== null) {
      const off = sim.livePlayers(L.side).find((o) => o.idx === L.selSlot);
      const on = sim.benchPlayers(L.side)[b];
      if (off && on) makeSub(ctx, off.p.id, on.id);
      L.selSlot = null;
    } else {
      L.selBench = L.selBench === b ? null : b;
    }
    ctx.render();
  },
};

export const liveChangeActions: Record<string, (ctx: Ctx, el: HTMLSelectElement) => void> = {
  'live-instruction': (ctx, el) => {
    if (!live || live.mine.sim.finished) return;
    const key = el.dataset.key as keyof Tactics;
    const v = el.value;
    live.mine.sim.setInstruction(live.side, key, (v === 'true' ? true : v === 'false' ? false : v) as never);
    const label = INSTRUCTIONS.find((i) => i.key === key)?.label ?? String(key);
    ctx.toast(`${label}: ${el.options[el.selectedIndex].text.toLowerCase()}`);
  },
  'live-formation': (ctx, el) => {
    if (!live || live.mine.sim.finished) return;
    change({ kind: 'formation', name: el.value });
    flushChanges();
    live.selSlot = null;
    ctx.render();
  },
};
