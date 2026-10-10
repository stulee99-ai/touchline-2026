import { landscape } from './layout.js';
import { ATTR_LABEL, GOALKEEPING, MENTAL, PHYSICAL, TECHNICAL } from '../engine/attributes.js';
import { TRAIT_DEFS, traitsOf } from '../engine/traits.js';
import { sharpOf } from '../engine/prep.js';
import { banSummary, bookingSummary } from '../engine/discipline.js';
import { boardSummary, ensureBoard, takeNewJob } from '../engine/board.js';
import { compareButtons } from './compare.js';
import { savePanel } from './saveio.js';
import { fullScreenPanel } from './fullscreen.js';
import { staffTab } from './staffui.js';
import { ARROW_BALL, ARROW_OFF, runControls } from './runs.js';
import { surgeryPanel, treatedNote } from './injuryui.js';
import { canTreat } from '../engine/surgery.js';
import { acknowledgeInjury, lineupBlockers, pendingDecisions } from '../engine/decisions.js';
import {
  boardExpectation, club, dateOf as dateOfDay, dayLabel, targetText, ordinal, seasonLabel, seasonOver,
  startNewSeason, userClub, userNextFixture,
} from '../engine/game.js';
import { clubFixtures, comp, fixturesForRound, leagueTable } from '../engine/league.js';
import { KICKOFFS, byKickoff, roundCount } from '../engine/fixtures.js';
import { COUNTRY_NAMES, leagueCountry, level, pyramidOf, tierOf } from '../engine/pyramid.js';
import { matchStory, type ResultTag, roundTags, TAG_LABEL } from '../engine/roundup.js';
import { autoPickXI, BENCH_SIZE, FORMATIONS, getFormation, resolveBench, resolveLineup, slotRating } from '../engine/tactics.js';
import type { AttrKey, Club, Fixture, GameState, Mentality, Player, Pos, Tactics, TransferRecord } from '../engine/types.js';
import { fmtMoney } from '../engine/finance.js';
import type { Action, Ctx } from './ctx.js';
import { type SCol, sortableTable, sortActions } from './sortable.js';
import { dealPanel, squadContracts } from './market.js';
import { stadiumTab } from './stadiumui.js';
import { compChip, compLink, clubCupsHtml, firstLegNote, resultLetter, scoreHtml, standingText } from './cupui.js';
import { cupById, stageLabel } from '../engine/cups.js';
import { DOMESTIC_2026, EURO_2026 } from '../engine/db/cups-2026.js';
import { ensureSquad, isExtPlayer } from '../engine/ext.js';
import { awayText, nationName } from '../engine/intl.js';
import { keepCover } from '../engine/tournaments.js';
import { MAX_SQUAD, squadCount } from '../engine/transfers.js';
import { ballonDays } from '../engine/ballon.js';
import type { BallonEdition } from '../engine/types.js';
import { resultTags } from '../engine/roundup.js';
import { storyHtml } from './article.js';
import { debriefHtml } from './assistantui.js';
import { abilityStars, attrCell, playerScoutPanel, scoutWords } from './scoutui.js';
import { estimatedCA, knowledge } from '../engine/scouting.js';
import {
  injuryWeeks, avgRating, clubStrip, esc, formAvg, fullName, kit, minuteLabel, moraleWord, pos,
  shortName, starBar, starBarRaw, statusChips, condBar, condClass, condPill, nationLink,
} from './format.js';

export function dateOf(season: number, day: number): string {
  return dayLabel(season, day);
}

/** "Sun 23 Nov 2026 · 16:30", or "· TBC" until the TV picks confirm it. */
export function kickoffLabel(g: GameState, f: Fixture): string {
  return `${dateOf(g.season, f.day)} · ${f.tbc ? 'time TBC' : f.time}`;
}

/** Moved from the league's traditional kick-off for live TV. */
function isTv(f: Fixture): boolean {
  const base = KICKOFFS[f.comp]?.base;
  return !!base && !f.tbc && (f.day !== f.weekend + base[0] || f.time !== base[1]);
}

const tvChip = (f: Fixture) => (isTv(f) ? ' <span class="chip tv" title="Selected for live TV">TV</span>' : '');

/** The competition shown on league-wide screens: the one picked, else the manager's own league. */
function shownComp(ctx: Ctx): string {
  const id = ctx.ui.compId;
  return id && ctx.game.comps.some((c) => c.id === id) ? id : userClub(ctx.game).leagueId;
}

/** Tabs for switching between the six leagues. */
function compTabs(ctx: Ctx, current: string): string {
  return `<div class="segs comp-tabs" role="tablist" aria-label="League">${ctx.game.comps.map((c) => `<button class="seg${c.id === current ? ' on' : ''}" data-act="comp" data-c="${c.id}" role="tab" aria-selected="${c.id === current}">${esc(c.name)}</button>`).join('')}</div>`;
}

/** A CM-style window: title bar in club colours ("Arsenal – Squad"), then the content. */
export function panel(c: Club, title: string, body: string, extra = '', cls = ''): string {
  return `<section class="panel${cls ? ` ${cls}` : ''}"><header class="strip" style="${clubStrip(c)}"><h2>${esc(c.name)} <small>– ${title}</small></h2>${extra}</header>${body}</section>`;
}

function leaguePanel(ctx: Ctx, title: string, body: string, extra = '', compId = shownComp(ctx)): string {
  return `<section class="panel"><header class="strip"><h2>${esc(comp(ctx.game, compId).name)} <small>– ${title}</small></h2>${extra}</header>${body}</section>`;
}

/** A club name on a scoreboard, clickable through to the club. */
function sbClub(g: GameState, id: number): string {
  return `<button class="link sb-link" data-act="club-view" data-id="${id}">${esc(club(g, id).name)}</button>`;
}

export function clubLink(g: GameState, id: number, bold = false): string {
  const c = club(g, id);
  const me = id === g.userClubId;
  return `<button class="link club-name${me || bold ? ' me' : ''}" data-act="club-view" data-id="${id}" title="View ${esc(c.name)}">${kit(c)}${esc(c.name)}</button>`;
}

export function playerLink(p: Player, label = fullName(p)): string {
  return `<button class="link" data-act="player" data-id="${p.id}">${esc(label.trim())}</button>`;
}

export function tablePos(g: GameState, clubId: number): number {
  const c = club(g, clubId);
  if (c.external) return 0;
  return leagueTable(g, c.leagueId).findIndex((r) => r.clubId === clubId) + 1;
}

/** A club's league row (null for clubs outside the six leagues). */
function leagueRow(g: GameState, clubId: number) {
  const c = club(g, clubId);
  if (c.external) return null;
  const t = leagueTable(g, c.leagueId);
  const i = t.findIndex((r) => r.clubId === clubId);
  return { row: t[i], pos: i + 1 };
}

function hasPlayed(g: GameState, clubId: number): boolean {
  return g.fixtures.some((f) => f.result && (f.homeId === clubId || f.awayId === clubId));
}

export const segs = (items: [string, string][], current: string, act: string, key: string) =>
  `<div class="segs" role="group">${items.map(([v, l]) => `<button class="seg${v === current ? ' on' : ''}" data-act="${act}" data-${key}="${v}">${l}</button>`).join('')}</div>`;

/* ───────────────────────── Inbox ───────────────────────── */

function nextMatchCard(ctx: Ctx): string {
  const g = ctx.game;
  if (seasonOver(g)) {
    return `<div class="next"><div class="next-label">SEASON COMPLETE</div><div class="next-main">The ${seasonLabel(g)} season is over.</div><button class="btn primary" data-act="continue">Season review</button></div>`;
  }
  const f = userNextFixture(g);
  if (!f) {
    // Nothing left for the manager's club, but the season isn't over (play-offs, cup finals elsewhere).
    return `<div class="next"><div class="next-label">NO MATCH</div><div class="next-main">${esc(userClub(g).name)} have no games left this season.</div><p class="small-note">Other competitions are still being played. Continue to play them out.</p></div>`;
  }
  const home = f.homeId === g.userClubId;
  const opp = club(g, home ? f.awayId : f.homeId);
  const cup = cupById(g, f.comp);
  const oppLg = leagueRow(g, opp.id);
  const form = oppLg ? oppLg.row.form.map((x) => `<span class="res res-${x}">${x}</span>`).join('') : '';
  let meta: string;
  if (f.comp === 'FRI') {
    meta = `A pre-season friendly: build match sharpness, try things out, and get used to your shape. Result and stats don't count.`;
  } else if (cup) {
    const leg = firstLegNote(g, f);
    meta = `${esc(opp.name)}: ${esc(standingText(g, opp.id, hasPlayed(g, opp.id) ? oppLg?.pos ?? null : null))}.${leg ? ` ${esc(leg)}.` : ''}${f.neutral ? ` At ${esc(f.neutral)}.` : ''}${form ? ` League form: ${form}` : ''}`;
  } else {
    meta = hasPlayed(g, g.userClubId)
      ? `${esc(opp.name)} are ${ordinal(oppLg!.pos)}, you are ${ordinal(tablePos(g, g.userClubId))}.${form ? ` Their form: ${form}` : ''}`
      : `Opening day at ${esc(club(g, f.homeId).stadium)}.`;
  }
  const what = f.comp === 'FRI' ? 'PRE-SEASON FRIENDLY' : cup ? compLink(g, f.comp, stageLabel(g, f).toUpperCase()) : `${compLink(g, f.comp, comp(g, f.comp).name.toUpperCase())} MATCHDAY ${f.round + 1} OF ${roundCount(g.fixtures, f.comp)}`;
  return `<div class="next${cup ? ` next-cup next-${cup.kind === 'euro' ? cup.id.toLowerCase() : 'cup'}` : ''}">
    <div class="next-label">NEXT MATCH: ${kickoffLabel(g, f).toUpperCase()} · ${what}${isTv(f) ? ' · LIVE ON TV' : ''}</div>
    <div><div class="next-main">${clubLink(g, f.homeId, true)} v ${clubLink(g, f.awayId, true)}</div><div class="next-meta">${meta}</div></div>
    <button class="btn" data-act="continue">Prepare for match</button>
  </div>`;
}

/** What is waiting for an answer: the game won't move on until each is dealt with. */
export function decisionsBox(g: GameState): string {
  const list = pendingDecisions(g);
  if (!list.length) return '';
  const rows = list.map((d) => {
    const open = d.kind === 'preseason'
      ? `<button class="btn small primary" data-act="nav" data-s="training">Open training</button>`
      : d.kind === 'bid'
      ? `<button class="btn small primary" data-act="news-link" data-s="transfers" data-t="offers">Open offers</button>`
      : `<button class="btn small primary" data-act="player" data-id="${d.playerId}">Open ${d.kind === 'injury' ? 'player' : 'talks'}</button>`;
    const treatable = d.kind === 'injury' && canTreat(g, g.players[d.playerId]);
    const extra = d.kind === 'injury' ? ` <button class="btn small" data-act="ack-injury" data-id="${d.playerId}">${treatable ? 'Decide later' : 'Noted'}</button>` : '';
    return `<li><span>${esc(d.text)}</span><span class="row-btns">${open}${extra}</span>${treatable ? surgeryPanel(g, g.players[d.playerId]) : ''}</li>`;
  }).join('');
  return `<div class="todo warnbox bad"><b>Waiting for your answer (${list.length}).</b> The game won't continue until you deal with ${list.length > 1 ? 'these' : 'this'}.<ul>${rows}</ul></div>`;
}

export function inbox(ctx: Ctx): string {
  const g = ctx.game;
  const filter = ctx.ui.newsFilter ?? 'all';
  const matches = (k: string) => filter === 'all' || (filter === 'result' ? k === 'result' || k === 'fixture' || k === 'cup' : filter === 'squad' ? ['squad', 'injury', 'training', 'transfer'].includes(k) : ['board', 'season', 'finance', 'headline'].includes(k));
  const news = g.news.filter((n) => matches(n.kind));
  const sel = news.find((n) => n.id === ctx.ui.newsId) ?? news[0];
  if (sel && !sel.read) sel.read = true;
  const list = news.map((n) => `<li><button class="news-item${n === sel ? ' on' : ''}${n.read ? '' : ' unread'}" data-act="news" data-id="${n.id}">
      <span class="news-kind k-${n.kind}" title="${n.kind}"></span><span class="news-title">${esc(n.title)}</span><span class="news-date">${dateOf(n.season, n.day)}</span>
    </button></li>`).join('');
  const target = boardExpectation(g, g.userClubId);
  const unread = g.news.filter((n) => !n.read).length;
  const body = `${decisionsBox(g)}${nextMatchCard(ctx)}
    <div class="pad-top">${segs([['all', 'All'], ['result', 'Results'], ['squad', 'Squad'], ['board', 'Board']], filter, 'news-filter', 'f')}
      ${unread ? `<button class="btn small ghost" data-act="news-read-all">Mark all read (${unread})</button>` : ''}</div>
    <div class="inbox">
      <ul class="news-list" aria-label="Messages" data-keep-scroll="news-list">${list || '<li class="pad small-note">No messages.</li>'}</ul>
      <article class="news-body${sel?.kind === 'headline' ? ' story' : ''}">${sel ? `${sel.debrief ? debriefHtml(g, sel) : storyHtml(g, sel)}${sel.link ? `<p><button class="btn" data-act="news-link" data-s="${sel.link.screen}"${sel.link.playerId ? ` data-p="${sel.link.playerId}"` : ''}${sel.link.tab ? ` data-t="${sel.link.tab}"` : ''}>${esc(sel.link.label)} ►</button></p>` : ''}` : ''}
        <p class="board-note">Board target: ${esc(targetText(g, g.userClubId))} (around ${ordinal(target)}).</p>
      </article>
    </div>`;
  return panel(userClub(g), 'News', body);
}

/* ───────────────────────── Squad ───────────────────────── */

type Col = { key: string; label: string; title?: string; num?: boolean; cls?: string; val: (p: Player) => number | string; html?: (p: Player) => string };

const POS_ORDER: Pos[] = ['GK', 'DR', 'DC', 'DL', 'DM', 'MR', 'MC', 'ML', 'AMR', 'AMC', 'AML', 'ST'];
export const primaryPos = (p: Player) => POS_ORDER.find((k) => p.pos[k] === 20) ?? 'ST';
export const posOrder = (p: Player) => POS_ORDER.indexOf(primaryPos(p));
const GROUPS: Record<string, Pos[]> = { gk: ['GK'], def: ['DR', 'DC', 'DL'], mid: ['DM', 'MR', 'MC', 'ML'], att: ['AMR', 'AMC', 'AML', 'ST'] };

export function squad(ctx: Ctx): string {
  const g = ctx.game;
  const c = userClub(g);
  const xi = resolveLineup(c, g.players);
  const bench = resolveBench(c, g.players, xi);
  const filter = ctx.ui.squadFilter ?? 'all';
  const cols: Col[] = [
    { key: 'no', label: 'No', num: true, val: (p) => p.squadNo },
    { key: 'name', label: 'Name', val: (p) => p.lastName, html: (p) => playerLink(p) + ' ' + statusChips(p) + (p.releaseClause && !p.loan ? ` <span class="chip rc" title="Release clause: a club bidding ${fmtMoney(p.releaseClause)} can talk to him, and you can't refuse">RC ${fmtMoney(p.releaseClause)}</span>` : '') },
    { key: 'pos', label: 'Position', val: (p) => posOrder(p), html: (p) => esc(pos(p)) },
    { key: 'sel', label: 'Sel', title: 'Selection for the next match', val: (p) => (xi.includes(p.id) ? 0 : bench.includes(p.id) ? 1 : 2), html: (p) => (xi.includes(p.id) ? '<span class="chip on">XI</span>' : bench.includes(p.id) ? '<span class="chip">S</span>' : '') },
    { key: 'age', label: 'Age', num: true, val: (p) => p.age },
    { key: 'nat', label: 'Nat', cls: 'hide-sm', val: (p) => p.nation, html: (p) => nationLink(p.nation) },
    { key: 'ca', label: 'Ability', title: "Your assistant's rating", val: (p) => p.ca, html: (p) => starBar(p.ca) },
    { key: 'cond', label: 'Con', title: 'Condition', num: true, val: (p) => p.condition, html: (p) => `<span class="cond ${p.condition < 75 ? 'low' : ''}">${Math.round(p.condition)}%</span>` },
    { key: 'sharp', label: 'Sharp', title: 'Match sharpness', num: true, cls: 'hide-sm', val: (p) => sharpOf(p), html: (p) => `<span class="cond ${sharpOf(p) < 70 ? 'low' : ''}">${Math.round(sharpOf(p))}%</span>` },
    { key: 'mor', label: 'Morale', cls: 'hide-sm', val: (p) => p.morale, html: (p) => moraleWord(p.morale) },
    { key: 'form', label: 'Form', title: 'Average of last five ratings', num: true, cls: 'hide-sm', val: (p) => (p.form.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : 0), html: formAvg },
    { key: 'apps', label: 'Apps', num: true, cls: 'hide-xs', val: (p) => p.stats.apps + p.stats.subApps / 100, html: (p) => `${p.stats.apps}${p.stats.subApps ? `(${p.stats.subApps})` : ''}` },
    { key: 'gls', label: 'Gls', num: true, cls: 'hide-xs', val: (p) => p.stats.goals },
    { key: 'ast', label: 'Ast', num: true, cls: 'hide-sm', val: (p) => p.stats.assists },
    { key: 'avr', label: 'Av R', title: 'Average rating', num: true, val: (p) => Number(avgRating(p)) || 0, html: avgRating },
  ];
  const view = ctx.ui.squadView ?? 'overview';
  if (view === 'form') cols.splice(0, cols.length, ...formCols(xi, bench));
  const key = ctx.ui.sortKey ?? 'sel';
  const dir = ctx.ui.sortDir ?? 1;
  const col = cols.find((x) => x.key === key) ?? cols.find((x) => x.key === 'sel') ?? cols[3];
  const shown = c.playerIds.map((id) => g.players[id]).filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'avail') return !p.injury && !p.suspended;
    return GROUPS[filter].includes(primaryPos(p));
  });
  const players = shown.sort((a, b) => {
    const va = col.val(a);
    const vb = col.val(b);
    const d = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return d * dir || posOrder(a) - posOrder(b) || b.ca - a.ca;
  });
  const head = cols.map((x) => `<th class="${x.num ? 'n' : ''}${x.key === key ? ' sorted' : ''} ${x.cls ?? ''}"${x.title ? ` title="${x.title}"` : ''}><button data-act="sort" data-key="${x.key}">${x.label}${x.key === key ? (dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
  const rows = players.map((p) => `<tr>${cols.map((x) => `<td class="${x.num ? 'n' : ''} ${x.cls ?? ''}">${x.html ? x.html(p) : esc(x.val(p))}</td>`).join('')}</tr>`).join('');
  const all = c.playerIds.map((id) => g.players[id]);
  const inj = all.filter((p) => p.injury).length;
  const sus = all.filter((p) => p.suspended).length;
  const avgAge = all.reduce((s, p) => s + p.age, 0) / all.length;
  const aca = all.filter((p) => p.cover).length;
  const extra = `<span class="strip-meta">${all.length - aca} players${aca ? ` + ${aca} academy` : ''} · avg age ${avgAge.toFixed(1)}${inj ? ` · ${inj} injured` : ''}${sus ? ` · ${sus} suspended` : ''}</span>`;
  const filters = segs([['all', 'All'], ['gk', 'Goalkeepers'], ['def', 'Defenders'], ['mid', 'Midfielders'], ['att', 'Attackers'], ['avail', 'Available']], filter, 'squad-filter', 'f');
  const views = segs([['overview', 'Overview'], ['form', 'Form'], ['contracts', 'Contracts & wages']], view, 'squad-view', 'v');
  const formNote = view === 'form' ? '<p class="pad small-note form-key">This season, all competitions. <b>Last 5</b>: match ratings, newest on the right. <b>Trend</b>: recent form against his season average. <b>/90</b>: goals and assists per 90 minutes played. <b>CS</b>: clean sheets (keepers).</p>' : '';
  if (view === 'contracts') return panel(c, 'Squad', `<div class="pad-top">${views}</div>${squadContracts(ctx)}`, extra);
  return panel(c, 'Squad', `<div class="pad-top">${views}${filters}</div>${formNote}<div class="scroll"><table class="grid squad${view === 'form' ? ' form-view' : ''}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`, extra);
}

/** Squad screen, Form view: how each player is playing this season, recent games first. */
function formCols(xi: number[], bench: number[]): Col[] {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const season = (p: Player) => { const n = p.stats.apps + p.stats.subApps; return n ? p.stats.ratingSum / n : 0; };
  const mins = (p: Player) => p.stats.mins ?? p.stats.apps * 86 + p.stats.subApps * 22;
  const per90 = (p: Player) => { const m = mins(p); return m >= 90 ? ((p.stats.goals + p.stats.assists) * 90) / m : -1; };
  const rc = (r: number) => (r >= 7.5 ? 'r-hi' : r >= 6.9 ? 'r-good' : r >= 6.4 ? 'r-mid' : 'r-low');
  const trend = (p: Player) => (p.form.length >= 3 && season(p) ? avg(p.form) - season(p) : 0);
  const isGk = (p: Player) => (p.pos.GK ?? 0) >= 15;
  return [
    { key: 'no', label: 'No', num: true, val: (p) => p.squadNo },
    { key: 'name', label: 'Name', val: (p) => p.lastName, html: (p) => playerLink(p) + ' ' + statusChips(p) },
    { key: 'pos', label: 'Pos', val: (p) => posOrder(p), html: (p) => esc(primaryPos(p)) },
    { key: 'sel', label: 'Sel', title: 'Selection for the next match', val: (p) => (xi.includes(p.id) ? 0 : bench.includes(p.id) ? 1 : 2), html: (p) => (xi.includes(p.id) ? '<span class="chip on">XI</span>' : bench.includes(p.id) ? '<span class="chip">S</span>' : '') },
    { key: 'last5', label: 'Last 5', title: 'Last five match ratings, newest on the right', val: (p) => avg(p.form), html: (p) => (p.form.length ? `<span class="last5">${p.form.map((r) => `<i class="${rc(r)}">${r.toFixed(1)}</i>`).join('')}</span>` : '<span class="small-note">-</span>') },
    { key: 'form', label: 'Form', title: 'Average of the last five ratings', num: true, val: (p) => avg(p.form), html: formAvg },
    { key: 'trend', label: 'Trend', title: 'Recent form against his season average', num: true, val: trend, html: (p) => { const t = trend(p); return p.form.length < 3 ? '-' : t >= 0.25 ? `<b class="c-good" title="+${t.toFixed(2)}">▲</b>` : t <= -0.25 ? `<b class="c-low" title="${t.toFixed(2)}">▼</b>` : '<span class="small-note" title="Steady">–</span>'; } },
    { key: 'avr', label: 'Av R', title: 'Average rating this season', num: true, val: (p) => Number(avgRating(p)) || 0, html: avgRating },
    { key: 'apps', label: 'Apps', num: true, val: (p) => p.stats.apps + p.stats.subApps / 100, html: (p) => `${p.stats.apps}${p.stats.subApps ? `(${p.stats.subApps})` : ''}` },
    { key: 'mins', label: 'Mins', num: true, val: mins, html: (p) => mins(p).toLocaleString('en-GB') },
    { key: 'gls', label: 'Gls', num: true, val: (p) => p.stats.goals },
    { key: 'ast', label: 'Ast', num: true, val: (p) => p.stats.assists },
    { key: 'ga90', label: 'G+A /90', title: 'Goals plus assists per 90 minutes', num: true, val: per90, html: (p) => (per90(p) < 0 ? '-' : per90(p).toFixed(2)) },
    { key: 'motm', label: 'PoM', title: 'Player of the match awards', num: true, val: (p) => p.stats.motm },
    { key: 'cs', label: 'CS', title: 'Clean sheets (keepers)', num: true, val: (p) => (isGk(p) ? p.stats.cleanSheets : -1), html: (p) => (isGk(p) ? String(p.stats.cleanSheets) : '-') },
    { key: 'yel', label: 'Yel', title: 'Yellow cards', num: true, val: (p) => p.stats.yellow, html: (p) => (p.stats.yellow ? `<i class="ic yel"></i> ${p.stats.yellow}` : '0') },
    { key: 'red', label: 'Red', title: 'Red cards', num: true, val: (p) => p.stats.red, html: (p) => (p.stats.red ? `<i class="ic red"></i> ${p.stats.red}` : '0') },
  ];
}

/* ───────────────────────── Player ───────────────────────── */

/**
 * The player page. On a landscape phone his club's squad sits in a list beside the profile, so you can
 * flick through the players without going back each time.
 */
export function player(ctx: Ctx): string {
  const page = playerProfile(ctx);
  if (!landscape()) return page;
  const g = ctx.game;
  const p = g.players[ctx.ui.playerId ?? -1];
  const c = p?.clubId ? club(g, p.clubId) : null;
  if (!p || !c) return page;
  const mine = c.id === g.userClubId;
  const rows = c.playerIds.map((id) => g.players[id]).filter(Boolean)
    .sort((a, b) => posOrder(a) - posOrder(b) || b.ca - a.ca)
    .map((q) => `<li><button class="ls-row${q.id === p.id ? ' on' : ''}" data-act="player" data-id="${q.id}"${q.id === p.id ? ' aria-current="true"' : ''}><span class="ls-no">${q.squadNo || ''}</span><span class="ls-name">${esc(fullName(q))}</span><span class="ls-pos">${esc(primaryPos(q))}</span>${mine ? `<span class="ls-con ${q.condition < 75 ? 'low' : ''}">${Math.round(q.condition)}%</span>` : `<span class="ls-con">${q.age}</span>`}</button></li>`).join('');
  return `<div class="ls-split">
      <section class="panel ls-list"><header class="strip" style="${clubStrip(c)}"><h2>${esc(c.name)} <small>– Squad</small></h2><span class="strip-meta">${c.playerIds.filter((id) => !g.players[id]?.cover).length}${c.playerIds.some((id) => g.players[id]?.cover) ? ` + ${c.playerIds.filter((id) => g.players[id]?.cover).length} academy` : ""}</span></header>
        <ul class="ls-rows" data-keep-scroll="pl-list">${rows}</ul></section>
      <div class="ls-detail" data-keep-scroll="pl-detail-${p.id}">${page}</div>
    </div>`;
}

function playerProfile(ctx: Ctx): string {
  const g = ctx.game;
  const p = g.players[ctx.ui.playerId ?? -1];
  const back = `<button class="btn small" data-act="back">◄ Back</button>`;
  if (!p) return panel(userClub(g), 'Player', '<p class="pad">This player is no longer at a club in this league.</p>', back);
  const c = p.clubId ? club(g, p.clubId) : userClub(g);
  const isGK = (p.pos.GK ?? 0) >= 15;
  // CM 01/02 listed attributes alphabetically in columns rather than grouping them.
  const keys: AttrKey[] = [...TECHNICAL, ...MENTAL, ...PHYSICAL, ...(isGK ? GOALKEEPING : [])]
    .filter((k) => !isGK || !['crossing', 'dribbling', 'finishing', 'heading', 'longShots', 'marking', 'tackling', 'offTheBall'].includes(k))
    .sort((a, b) => ATTR_LABEL[a].localeCompare(ATTR_LABEL[b]));
  const per = Math.ceil(keys.length / 3);
  const col = (ks: AttrKey[]) => `<dl>${ks.map((k) => `<div><dt>${ATTR_LABEL[k]}</dt>${attrCell(g, p, k)}</div>`).join('')}</dl>`;
  const known = knowledge(g, p) >= 100;
  const words = scoutWords(g, p);
  const traitBlock = known && traitsOf(p).length
    ? `<div class="traits"><h4>TRAITS <span class="small-note">Hover or tap one to see what it does</span></h4>${traitsOf(p).map((id) => `<span class="trait ${TRAIT_DEFS[id].good ? 'good' : 'bad'}" tabindex="0" role="note" data-tip="${esc(TRAIT_DEFS[id].blurb)}" aria-label="${esc(TRAIT_DEFS[id].label)}: ${esc(TRAIT_DEFS[id].blurb)}">${esc(TRAIT_DEFS[id].label)}</span>`).join('')}</div>`
    : '';
  const attrs = `<div class="attr-block"><h4>ATTRIBUTES</h4><div class="attr-cols">${col(keys.slice(0, per))}${col(keys.slice(per, per * 2))}${col(keys.slice(per * 2))}</div></div>`;
  const posMap = (['ST', 'AML', 'AMC', 'AMR', 'ML', 'MC', 'MR', 'DM', 'DL', 'DC', 'DR', 'GK'] as const).map((k) => {
    const f = p.pos[k] ?? 0;
    const cls = f >= 20 ? 'nat' : f >= 15 ? 'acc' : f >= 10 ? 'unc' : '';
    return `<span class="pm pm-${k} ${cls}" title="${k}${f >= 20 ? ' (natural)' : f >= 15 ? ' (accomplished)' : f >= 10 ? ' (unconvincing)' : ''}">${k}</span>`;
  }).join('');
  const apps = p.stats.apps + p.stats.subApps;
  const season = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
  const career = p.career.slice().reverse().map((e) => `<tr><td>${season(e.season)}</td><td>${g.clubs.find((x) => x.id === e.clubId) ? clubLink(g, e.clubId) : '-'}</td><td class="n">${e.apps}</td><td class="n">${e.goals}</td><td class="n">${e.avgRating.toFixed(2)}</td></tr>`).join('');
  const release = isExtPlayer(p) ? `<p class="pad small-note">${esc(c.name)} play outside the six leagues, so their players can't be scouted or signed.</p>` : playerScoutPanel(ctx, p) + dealPanel(ctx, p);
  const body = `
    <div class="player-head" style="${clubStrip(c)}">
      <span class="shirt">${p.squadNo}</span>
      <div><h3>${esc(fullName(p).trim())}</h3><p>${p.clubId ? `<button class="link head-link" data-act="club-view" data-id="${c.id}">${esc(c.name)}</button>` : 'Free agent'} · ${esc(pos(p))}</p></div>
    </div>
    <div class="player-grid">
      <div class="bio">
        <dl class="facts">
          <div><dt>Age</dt><dd>${p.age}</dd></div>
          <div><dt>Nationality</dt><dd>${nationLink(p.nation, nationName(p.nation))}</dd></div>
          <div><dt>International</dt><dd>${p.intl?.caps ? `${p.intl.caps} cap${p.intl.caps > 1 ? 's' : ''}, ${p.intl.goals} goal${p.intl.goals === 1 ? '' : 's'}${p.stats.intlApps ? ` (${p.stats.intlApps} this season)` : ''}` : 'Uncapped'}</dd></div>
          ${p.honours?.length ? `<div><dt>Honours</dt><dd class="honours-cell">${p.honours.slice().reverse().map((h) => `<span class="chip ${/Ballon d'Or \d{4}$|Player of the/.test(h) ? 'on' : ''}">${esc(h)}</span>`).join(' ')}</dd></div>` : ''}
          ${p.cover && p.clubId === g.userClubId ? `<div><dt>Academy</dt><dd>Covering for the internationals; goes back to the academy on ${esc(dayLabel(g.season, p.cover.until))}. <button class="btn small" data-act="keep-cover" data-id="${p.id}">Keep in the squad</button></dd></div>` : p.cover ? `<div><dt>Academy</dt><dd>Covering for the internationals until ${esc(dayLabel(g.season, p.cover.until))}</dd></div>` : ''}
          <div><dt>Preferred foot</dt><dd>${p.foot === 'B' ? 'Either' : p.foot === 'L' ? 'Left' : 'Right'}</dd></div>
          <div><dt>Condition</dt><dd>${known ? `${Math.round(p.condition)}%` : '-'}</dd></div>
          ${known && p.clubId === g.userClubId ? `<div><dt>Sharpness</dt><dd>${Math.round(sharpOf(p))}%</dd></div>` : ''}
          ${known && p.clubId === g.userClubId ? `<div><dt>Training</dt><dd>${p.train ? ('attr' in p.train ? `Working on ${esc(ATTR_LABEL[p.train.attr].toLowerCase())}` : `Learning ${p.train.pos} (${Math.floor(p.train.progress)}/20)`) : 'No individual programme'} <button class="link" data-act="nav" data-s="training">Set</button></dd></div>` : ''}
          <div><dt>Morale</dt><dd>${known ? moraleWord(p.morale) : '-'}</dd></div>
          <div><dt>Status</dt><dd>${p.injury ? `${esc(p.injury.name)} (${injuryWeeks(p)} wk)${p.injury.treated ? ` · ${esc(treatedNote(p))}` : ''}` : p.suspended ? `Suspended (${p.suspended})` : p.away ? esc(awayText(g, p)) : 'Available'}</dd></div>
          ${known && (banSummary(g, p) || bookingSummary(g, p).length) ? `<div><dt>Discipline</dt><dd>${[banSummary(g, p) ? `Banned: ${esc(banSummary(g, p))}` : '', ...bookingSummary(g, p).map((b) => `${esc(b.label)} ${b.yellows}/${b.limit} yellows`)].filter(Boolean).join(' · ')}</dd></div>` : ''}
          <div><dt>${known ? 'Coach' : 'Scout'}: ability</dt><dd class="report-word">${esc(words.ability)}</dd></div>
          <div><dt>${known ? 'Coach' : 'Scout'}: potential</dt><dd class="report-word">${esc(words.potential)}</dd></div>
        </dl>
        ${known && p.clubId === g.userClubId ? surgeryPanel(g, p) : ''}
        ${traitBlock}
        <div class="posmap" aria-label="Positions">${posMap}</div>
        ${release}
      </div>
      <div>${attrs}</div>
    </div>
    <div class="player-stats">
      <h4>${seasonLabel(g)} season <small>(all competitions${p.lstats && (p.lstats.apps + p.lstats.subApps) !== apps ? `; league: ${p.lstats.apps + p.lstats.subApps} apps, ${p.lstats.goals} goals` : ""})</small></h4>
      <dl class="statline">
        <div><dt>Apps</dt><dd>${p.stats.apps}${p.stats.subApps ? ` (${p.stats.subApps})` : ''}</dd></div>
        <div><dt>Goals</dt><dd>${p.stats.goals}</dd></div>
        <div><dt>Assists</dt><dd>${p.stats.assists}</dd></div>
        <div><dt>Av rating</dt><dd>${apps ? (p.stats.ratingSum / apps).toFixed(2) : '-'}</dd></div>
        <div><dt>MoM</dt><dd>${p.stats.motm}</dd></div>
        <div><dt>Cards</dt><dd>${p.stats.yellow}Y ${p.stats.red}R</dd></div>
        ${isGK ? `<div><dt>Clean sheets</dt><dd>${p.stats.cleanSheets}</dd></div>` : ''}
      </dl>
      ${career ? `<h4>Career</h4><div class="scroll"><table class="grid"><thead><tr><th>Season</th><th>Club</th><th class="n">Apps</th><th class="n">Gls</th><th class="n">Av R</th></tr></thead><tbody>${career}</tbody></table></div>` : ''}
    </div>`;
  return panel(c, 'Player Profile', body, `${compareButtons(ctx, p)} ${back}`);
}

/* ───────────────────────── Tactics ───────────────────────── */

export const INSTRUCTIONS: { key: keyof Tactics; label: string; opts: [string, string][]; note: string }[] = [
  { key: 'passing', label: 'Passing', opts: [['short', 'Short'], ['mixed', 'Mixed'], ['long', 'Long']], note: 'Short keeps the ball; long gets it forward quickly to strong strikers.' },
  { key: 'tackling', label: 'Tackling', opts: [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], note: 'Hard tackling unsettles attackers but gives away more fouls and cards.' },
  { key: 'closingDown', label: 'Closing down', opts: [['own-half', 'Own half'], ['mixed', 'Mixed'], ['all-over', 'All over']], note: 'Pressing all over the pitch stifles opponents but tires your side.' },
  { key: 'counterAttack', label: 'Counter attack', opts: [['false', 'No'], ['true', 'Yes']], note: 'Breaks quickly when the opposition commit men forward.' },
  { key: 'offsideTrap', label: 'Offside trap', opts: [['false', 'No'], ['true', 'Yes']], note: 'Catches runners offside, but quick forwards who beat it are clean through.' },
];

export function instructionSelect(t: Tactics, key: keyof Tactics, opts: [string, string][], act: string): string {
  const cur = String(t[key]);
  return `<select class="cm" id="ti-${String(key)}" data-change="${act}" data-key="${String(key)}">${opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
}

/** True on narrow screens, where the tactics board uses the bottom sheet instead of arrows on the pitch. */
export function phoneTactics(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(max-width: 980px)').matches;
}

/** After opening the sheet, scroll so the pitch sits just above it. */
function revealPitch(ctx: Ctx): void {
  if (!phoneTactics() || (ctx.ui.slot ?? null) === null && (ctx.ui.benchSlot ?? null) === null) return;
  document.querySelector('.pitch')?.scrollIntoView({ block: 'start' });
}

/** Put a player into a formation slot. If he is already in the XI, the two swap places. */
export function placePlayer(ctx: Ctx, slot: number, playerId: number): boolean {
  const g = ctx.game;
  const c = userClub(g);
  const p = g.players[playerId];
  if (!p || !c.playerIds.includes(playerId)) return false;
  if (p.injury || p.suspended) {
    ctx.toast(`${fullName(p)} is ${p.injury ? 'injured' : 'suspended'} and can't be picked.`);
    return false;
  }
  const xi = [...resolveLineup(c, g.players)];
  const at = xi.indexOf(playerId);
  if (at === slot) return false;
  if (at >= 0) [xi[at], xi[slot]] = [xi[slot], xi[at]];
  else xi[slot] = playerId;
  c.lineup = xi;
  ctx.ui.slot = null;
  ctx.save();
  return true;
}

/** Swap the players in two formation slots. */
export function swapSlots(ctx: Ctx, a: number, b: number): boolean {
  if (a === b) return false;
  const c = userClub(ctx.game);
  const xi = [...resolveLineup(c, ctx.game.players)];
  [xi[a], xi[b]] = [xi[b], xi[a]];
  c.lineup = xi;
  ctx.ui.slot = null;
  ctx.save();
  return true;
}

/** The substitutes the club will name, as the manager's own list (starting from the assistant's picks). */
function benchList(ctx: Ctx): number[] {
  const c = userClub(ctx.game);
  return [...resolveBench(c, ctx.game.players, resolveLineup(c, ctx.game.players))];
}

function setBench(ctx: Ctx, ids: number[]): void {
  userClub(ctx.game).bench = ids.slice(0, BENCH_SIZE);
  ctx.ui.benchSlot = null;
  ctx.ui.slot = null;
  ctx.save();
}

/**
 * Put a player in a place on the bench. From the XI, he swaps with the substitute in that
 * place; from elsewhere on the bench, the two swap; otherwise he replaces or joins the bench.
 */
export function placeOnBench(ctx: Ctx, place: number, playerId: number): boolean {
  const g = ctx.game;
  const c = userClub(g);
  const p = g.players[playerId];
  if (!p || !c.playerIds.includes(playerId)) return false;
  if (p.injury || p.suspended) {
    ctx.toast(`${fullName(p)} is ${p.injury ? 'injured' : 'suspended'} and can't be named.`);
    return false;
  }
  const bench = benchList(ctx);
  const xi = [...resolveLineup(c, g.players)];
  const inXi = xi.indexOf(playerId);
  if (inXi >= 0) {
    const sub = bench[place];
    if (sub === undefined) {
      ctx.toast('Drop him onto a substitute to swap them, so the XI stays complete.');
      return false;
    }
    xi[inXi] = sub;
    bench[place] = playerId;
    c.lineup = xi;
    setBench(ctx, bench);
    return true;
  }
  const at = bench.indexOf(playerId);
  if (at === place) return false;
  if (at >= 0) [bench[at], bench[place]] = [bench[place], bench[at]];
  else if (place < bench.length) bench[place] = playerId;
  else if (bench.length < BENCH_SIZE) bench.push(playerId);
  else {
    ctx.toast(`The bench is full (${BENCH_SIZE}). Take someone off it first.`);
    return false;
  }
  setBench(ctx, bench.filter((x) => x !== undefined));
  return true;
}

/** Bring a substitute into the XI; the player he replaces takes his place on the bench. */
export function benchToXi(ctx: Ctx, place: number, slot: number): boolean {
  const g = ctx.game;
  const c = userClub(g);
  const bench = benchList(ctx);
  const sub = bench[place];
  if (sub === undefined) return false;
  const xi = [...resolveLineup(c, g.players)];
  const out = xi[slot];
  if (out === -1) bench.splice(place, 1);
  else bench[place] = out;
  xi[slot] = sub;
  c.lineup = xi;
  setBench(ctx, bench);
  return true;
}

function toggleBench(ctx: Ctx, playerId: number): void {
  const bench = benchList(ctx);
  const at = bench.indexOf(playerId);
  if (at >= 0) {
    bench.splice(at, 1);
    setBench(ctx, bench);
    return;
  }
  placeOnBench(ctx, bench.length, playerId);
}

/** A row of substitutes under the pitch; each can be dragged onto a shirt, or have a player dropped on it. */
export function benchRow(players: Player[], colours: [string, string], opts: { sel?: number | null; drop: boolean; act?: string; count?: string; extra?: string }): string {
  const shirts = players.map((p, i) => `<button class="bench-shirt${opts.sel === i ? ' sel' : ''}" ${opts.act ? `data-act="${opts.act}" data-i="${i}"` : ''} data-drag="bench" data-id="${p.id}" data-drop-bench="${i}" data-name="${esc(p.lastName)}" style="--k1:${colours[0]};--k2:${colours[1]}" aria-label="Substitute ${esc(fullName(p))}, ${primaryPos(p)}">
      <span class="shirt">${p.squadNo}</span><span class="tname">${esc(p.lastName)}</span><span class="bpos">${primaryPos(p)} · <b class="${condClass(p.condition)}">${Math.round(p.condition)}%</b></span>${condBar(p.condition)}</button>`).join('');
  const empty = opts.drop && players.length < BENCH_SIZE
    ? `<div class="bench-shirt empty" data-drop-bench="${players.length}" title="Drag a player here to add him to the bench">+</div>`
    : '';
  return `<div class="bench-row"><div class="bench-head"><b>Substitutes</b> <span class="small-note">${opts.count ?? `${players.length}/${BENCH_SIZE}`}</span>${opts.extra ?? ''}</div><div class="bench-slots">${shirts}${empty}</div></div>`;
}

/** The pitch, team instructions and squad picker. Used on the Tactics screen and before kick-off. */
export function tacticsBoard(ctx: Ctx): string {
  const g = ctx.game;
  const c = userClub(g);
  const f = getFormation(c.tactics.formation);
  const xi = resolveLineup(c, g.players);
  const bench = resolveBench(c, g.players, xi);
  const sel = ctx.ui.slot ?? null;
  const bsel = ctx.ui.benchSlot ?? null;
  const tokens = f.slots.map((slot, i) => {
    const p = g.players[xi[i]];
    if (!p) {
      const [vx, vy] = f.coords[i];
      return `<button class="token vacant${sel === i ? ' sel' : ''}" style="left:${vx}%;bottom:${vy}%;--k1:${c.colours[0]};--k2:${c.colours[1]}" data-act="slot" data-i="${i}" data-drop-slot="${i}" aria-label="Empty ${slot} slot"><span class="shirt">+</span><span class="tname">${slot}</span></button>`;
    }
    const fam = p.pos[slot] ?? 0;
    const cls = fam >= 20 ? 'nat' : fam >= 15 ? 'acc' : 'awk';
    const [x, y] = f.coords[i];
    const tired = p.condition < 75 ? ` <span class="tcond" title="Condition">${Math.round(p.condition)}%</span>` : '';
    const rf = c.runs?.[p.id];
    const badge = rf && (rf.ball || rf.off) ? `<span class="rbadge" title="Runs: ${[rf.ball ? 'with the ball' : '', rf.off ? 'without it' : ''].filter(Boolean).join(' and ')}">${rf.ball ? ARROW_BALL : ''}${rf.off ? ARROW_OFF : ''}</span>` : '';
    return `<button class="token ${cls}${sel === i ? ' sel' : ''}" style="left:${x}%;bottom:${y}%;--k1:${c.colours[0]};--k2:${c.colours[1]}" data-act="slot" data-i="${i}" data-drag="xi" data-id="${p.id}" data-drop-slot="${i}" aria-label="${slot}: ${esc(fullName(p))}">
      <span class="shirt">${p.squadNo}${badge}</span><span class="tname">${esc(p.lastName)}${tired}</span>${condBar(p.condition)}</button>`;
  }).join('');
  const runCtl = f.slots.map((slot, i) => {
    const p = g.players[xi[i]];
    if (!p || slot === 'GK') return '';
    return runControls(f.coords[i][0], f.coords[i][1], p.id, c.runs?.[p.id] ?? {}, 'run-toggle');
  }).join('');
  const pickDir = sel === null ? ctx.ui.pickSort ?? null : null;
  const pickCol = ctx.ui.pickCol ?? 'picked';
  const slotPos = sel !== null ? f.slots[sel] : null;
  const list = c.playerIds.map((id) => g.players[id])
    .sort((a, b) => {
      if (pickDir && pickCol === 'pos') {
        // By natural position, keeper to strikers, best first within each.
        return (posOrder(a) - posOrder(b)) * (pickDir === 'desc' ? -1 : 1) || b.ca - a.ca;
      }
      if (pickDir) {
        // XI first (goalkeeper, defenders, midfielders, attackers by the slot he fills), then subs, then the rest.
        const rank = (p: Player) => {
          const i = xi.indexOf(p.id);
          return i >= 0 ? POS_ORDER.indexOf(f.slots[i] as Pos) : bench.includes(p.id) ? 100 + posOrder(p) : 200 + posOrder(p);
        };
        return (rank(a) - rank(b) || b.ca - a.ca) * (pickDir === 'desc' ? -1 : 1);
      }
      return slotPos ? slotRating(b, slotPos) - slotRating(a, slotPos) : posOrder(a) - posOrder(b) || b.ca - a.ca;
    })
    .map((p) => {
      const inXi = xi.indexOf(p.id);
      const onBench = bench.includes(p.id);
      const tag = inXi >= 0 ? `<span class="chip on">${f.slots[inXi]}</span>` : onBench ? '<span class="chip">S</span>' : '';
      const suit = slotPos ? starBar(slotRating(p, slotPos) * 10, `Suitability at ${slotPos}`) : starBar(p.ca);
      const unavailable = !!(p.injury || p.suspended);
      const grip = unavailable ? '<td class="grip off"></td>' : '<td class="grip" title="Drag onto the pitch" aria-hidden="true">⠿</td>';
      const picking = (slotPos || bsel !== null) && !unavailable;
      const subBtn = inXi >= 0 || unavailable ? '' : `<button class="btn tiny${onBench ? ' on' : ''}" data-act="bench-toggle" data-id="${p.id}" title="${onBench ? 'Take him off the bench' : 'Name him as a substitute'}">${onBench ? '−S' : '+S'}</button>`;
      return `<tr class="${unavailable ? 'dim' : 'draggable'}" ${unavailable ? '' : `data-drag="squad" data-id="${p.id}"`} data-drop-player="${p.id}">${grip}<td>${tag}</td><td class="pname">${picking ? `<button class="link" data-act="assign" data-id="${p.id}">${esc(fullName(p))}</button>` : playerLink(p)} ${statusChips(p)}</td><td class="n">${condPill(p.condition)}</td><td class="npos">${pos(p).split(', ').map((x) => `<span>${esc(x)}</span>`).join(', ')}</td><td>${suit}</td><td class="n hide-xs">${Math.round(sharpOf(p))}%</td><td class="r">${subBtn}</td></tr>`;
    }).join('');
  const formations = FORMATIONS.map((x) => `<option value="${x.name}"${x.name === f.name ? ' selected' : ''}>${x.name}</option>`).join('');
  const ments = segs([['defensive', 'Defensive'], ['balanced', 'Balanced'], ['attacking', 'Attacking']], c.tactics.mentality, 'mentality', 'm');
  const instr = INSTRUCTIONS.map((i) => `<label for="ti-${String(i.key)}">${i.label}</label>${instructionSelect(c.tactics, i.key, i.opts, 'instruction')}`).join('');
  const hint = sel !== null
    ? `Pick a player below to play at <b>${f.slots[sel]}</b>, or drag one onto the pitch. The list is sorted by suitability for that position.`
    : bsel !== null
      ? `Pick a player below for the bench, or click a shirt on the pitch to bring <b>${esc(g.players[bench[bsel]]?.lastName ?? '')}</b> into the XI.`
      : `${c.lineup ? '<b>Your XI.</b>' : '<b>Assistant\'s XI.</b>'} Drag a player from the list onto a shirt to bring him in, or drag one shirt onto another to swap them. Name up to ${BENCH_SIZE} substitutes with <b>+S</b>, or drag players onto the bench. You can also click a shirt, then a player.`;
  const benchExtra = c.bench ? ' <button class="link small" data-act="bench-auto">Let the assistant pick</button>' : ' <span class="small-note">(assistant\'s picks)</span>';
  const benchHtml = benchRow(bench.map((id) => g.players[id]), c.colours, { sel: bsel, drop: true, act: 'bench-slot', extra: benchExtra });
  const sheet = tacticsSheet(ctx, xi, bench, sel, bsel);
  // The same pieces make up both layouts, so nothing is lost by turning the phone.
  const formRow = `<div class="instr-row"><label for="formation"><b>Formation</b></label><select class="cm" id="formation" data-change="formation">${formations}</select>${ments}</div>`;
  const pickActions = `<div class="row-btns pick-actions">${c.lineup ? '<button class="btn" data-act="autopick">Let the assistant pick</button>' : '<button class="btn" data-act="keep-xi">Use this XI as my team</button>'}<button class="btn ghost" data-act="unpick-all" title="Empty the XI and the bench so you can pick everyone yourself">Unpick all players</button>${sel !== null || bsel !== null ? '<button class="btn ghost" data-act="slot-cancel">Cancel</button>' : ''}</div>`;
  const pitchHtml = `<div class="pitch">${tokens}${runCtl}<span class="pitch-line half"></span><span class="pitch-circle"></span><span class="pitch-box top"></span><span class="pitch-box bottom"></span></div>`;
  const runLegend = `<p class="legend runleg"><span class="runkey">${ARROW_BALL}</span><span>runs with the ball</span><span class="runkey">${ARROW_OFF}</span><span>forward runs without it</span><span class="small-note desk-only">Click the arrows above a shirt to switch them on.</span><span class="small-note mob-only">Tap a shirt to change the player or set his runs.</span>${Object.values(c.runs ?? {}).some((r) => r.ball || r.off) ? '<button class="link small" data-act="run-clear">Clear all arrows</button>' : ''}</p>`;
  const fitLegend = `<p class="legend"><i class="nat">Green</i> natural position · <i class="acc">Amber</i> accomplished (small penalty) · <i class="awk">Red</i> out of position (big penalty)</p>`;
  const instrBlock = `<div class="instr"><span class="sub-head" style="grid-column:1/-1;padding:0 0 4px">Team instructions</span>${instr}<p class="instr-note">${INSTRUCTIONS.map((i) => `<b>${i.label}:</b> ${i.note}`).join(' ')}</p></div>`;
  const pickerTable = `<table class="grid compact picker-table"><thead><tr><th></th><th class="${pickDir && pickCol === 'picked' ? 'sorted' : ''}" title="Sort by selection: XI (keeper to attackers), then substitutes"><button data-act="pick-sort">Picked${pickDir && pickCol === 'picked' ? (pickDir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th><th>Name</th><th class="n" title="Condition">Con</th><th class="${pickDir && pickCol === 'pos' ? 'sorted' : ''}" title="Natural positions: sort keeper to strikers"><button data-act="pos-sort">Pos${pickDir && pickCol === 'pos' ? (pickDir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th><th>${slotPos ? `At ${slotPos}` : 'Ability'}</th><th class="n hide-xs" title="Match sharpness">Sharp</th><th class="r" title="Substitutes">Sub</th></tr></thead><tbody>${list}</tbody></table>`;
  if (landscape()) {
    // Landscape phones: the pitch on its side. Beside it the shape and the pick buttons (always on show), then three tabs.
    const tab = ctx.ui.tacTab ?? 'squad';
    const tb = (k: 'squad' | 'bench' | 'shape', label: string) => `<button class="lt-tab${tab === k ? ' on' : ''}" data-act="tac-tab" data-t="${k}" role="tab" aria-selected="${tab === k}">${label}</button>`;
    const pane = tab === 'bench' ? benchHtml : tab === 'shape' ? `${runLegend}${fitLegend}${instrBlock}` : `<p class="hint">${hint}</p>${pickerTable}`;
    return `<div class="tactics tac-ls">
        <div class="tac-pitch"><div class="pitch-h">${pitchHtml}</div></div>
        <div class="tac-side" data-keep-scroll="tac-${tab}">
          <div class="tac-head">${formRow}${pickActions}</div>
          <div class="lt-tabs" role="tablist" aria-label="Tactics">${tb('squad', 'Squad')}${tb('bench', `Bench (${bench.length})`)}${tb('shape', 'Shape &amp; instructions')}</div>
          <div class="tac-pane">${pane}</div>
        </div>
        ${sheet}
      </div>`;
  }
  return `
    <div class="tactics">
      <div class="pitch-wrap">
        <div class="controls">
          ${formRow}
        ${pickActions}
        </div>
        ${pitchHtml}
        ${runLegend}
        ${fitLegend}
        ${benchHtml}
        ${instrBlock}
      </div>
      <div class="picker">
        <p class="hint">${hint}</p>
        <div class="scroll">${pickerTable}</div>
      </div>
      ${sheet}
    </div>`;
}

/**
 * On phones, choosing a shirt or a substitute opens a sheet along the bottom of the screen: the run toggles for that
 * player and the squad ordered by suitability, one tap to swap. It stays open so several changes can be made in a row.
 * Hidden on wider screens, where the pitch, arrows and drag and drop do the job.
 */
function tacticsSheet(ctx: Ctx, xi: number[], bench: number[], sel: number | null, bsel: number | null): string {
  if (sel === null && bsel === null) return '';
  const g = ctx.game;
  const c = userClub(g);
  const f = getFormation(c.tactics.formation);
  const slotPos = sel !== null ? (f.slots[sel] as Pos) : null;
  const cur = sel !== null ? g.players[xi[sel]] : g.players[bench[bsel!]];
  const title = sel !== null
    ? `${slotPos} · ${cur ? esc(cur.lastName) : 'empty'}`
    : `Substitute ${bsel! + 1} · ${cur ? esc(cur.lastName) : 'empty'}`;
  const rf = cur && sel !== null && slotPos !== 'GK' ? c.runs?.[cur.id] ?? {} : null;
  const runBtn = (k: 'ball' | 'off', on: boolean) => `<button class="run-tog${on ? ' on' : ''}" data-act="run-toggle" data-id="${cur!.id}" data-k="${k}" aria-pressed="${on}">${k === 'ball' ? ARROW_BALL : ARROW_OFF}<span>${k === 'ball' ? 'Runs with ball' : 'Forward runs'}</span></button>`;
  const runs = rf ? `<div class="sheet-runs">${runBtn('ball', !!rf.ball)}${runBtn('off', !!rf.off)}</div>` : '';
  const players = c.playerIds.map((id) => g.players[id]).sort((a, b) => slotPos ? slotRating(b, slotPos) - slotRating(a, slotPos) : posOrder(a) - posOrder(b) || b.ca - a.ca);
  const rows = players.map((p) => {
    const inXi = xi.indexOf(p.id);
    const tag = inXi >= 0 ? f.slots[inXi] : bench.includes(p.id) ? 'S' : '';
    const unavailable = !!(p.injury || p.suspended);
    const here = cur?.id === p.id;
    const fam = slotPos ? p.pos[slotPos] ?? 0 : 20;
    const fit = slotPos ? `<span class="sfit ${fam >= 20 ? 'nat' : fam >= 15 ? 'acc' : 'awk'}" title="Rating in this position, out of 20">${slotRating(p, slotPos).toFixed(1)}</span>` : `<span class="sfit">${esc(primaryPos(p))}</span>`;
    return `<button class="sheet-row${here ? ' here' : ''}${unavailable ? ' dim' : ''}" data-act="assign" data-id="${p.id}" ${unavailable ? 'disabled' : ''}><span class="chip${inXi >= 0 ? ' on' : ''}">${tag || '·'}</span><span class="sname">${esc(fullName(p))}${here ? ' <i>(here now)</i>' : ''} ${statusChips(p)}<span class="spos">${esc(pos(p))}</span></span>${fit}<span class="scon">${Math.round(p.condition)}%</span></button>`;
  }).join('');
  const sub = slotPos ? `Rating at ${slotPos} (out of 20), best first. Green is natural, amber accomplished, red out of position. Tap to swap.` : 'Tap a player to name him as this substitute.';
  return `<div class="tac-sheet" role="dialog" aria-label="Choose a player"><div class="sheet-head"><b>${title}</b><button class="btn small ghost" data-act="slot-cancel">Done ✕</button></div>${runs}<p class="sheet-sub">${sub}</p><div class="sheet-list">${rows}</div></div>`;
}

export function tactics(ctx: Ctx): string {
  const c = userClub(ctx.game);
  const f = getFormation(c.tactics.formation);
  return panel(c, 'Tactics', tacticsBoard(ctx), `<span class="strip-meta">${f.name} · ${c.tactics.mentality} · ${c.lineup ? 'your XI' : "assistant's XI"}</span>`, landscape() ? 'ls-fill' : '');
}

/* ───────────────────────── Pre-match ───────────────────────── */

/** Things the manager should know before kick-off. */
export type Note = { text: string; level: 'info' | 'warn' | 'bad' };

export function prematchWarnings(ctx: Ctx): { picked: boolean; notes: Note[] } {
  const g = ctx.game;
  const c = userClub(g);
  const notes: Note[] = lineupBlockers(g).map((text) => ({ level: 'bad' as const, text: `Fix this before kick-off: ${text}` }));
  const xi = resolveLineup(c, g.players);
  const slots = getFormation(c.tactics.formation).slots;
  // Out of position: "accomplished" is a small cost, anything less is a real one.
  const awkward: string[] = [];
  const stretched: string[] = [];
  xi.forEach((id, i) => {
    const p = g.players[id];
    if (!p) return;
    const fam = p.pos[slots[i]] ?? 0;
    if (fam >= 20) return;
    const text = `${p.lastName} at ${slots[i]} (his natural role: ${pos(p)})`;
    (fam >= 15 ? stretched : awkward).push(text);
  });
  if (awkward.length) notes.push({ level: 'bad', text: `Playing out of position: ${awkward.join('; ')}. This will hurt their performance.` });
  if (stretched.length) notes.push({ level: 'warn', text: `Accomplished but not natural in the role: ${stretched.join('; ')}. A small drop in performance.` });
  const exhausted = xi.map((id) => g.players[id]).filter((p) => p && p.condition < 60);
  const tired = xi.map((id) => g.players[id]).filter((p) => p && p.condition >= 60 && p.condition < 75);
  if (exhausted.length) notes.push({ level: 'bad', text: `Very low condition: ${exhausted.map((p) => `${p.lastName} (${Math.round(p.condition)}%)`).join(', ')}. They will tire quickly and are injury risks.` });
  if (tired.length) notes.push({ level: 'warn', text: `Short of match fitness: ${tired.map((p) => `${p.lastName} (${Math.round(p.condition)}%)`).join(', ')}.` });
  const nf = userNextFixture(g);
  const blunt = xi.map((id) => g.players[id]).filter((p) => p && sharpOf(p) < 65);
  if (blunt.length >= 3 && nf?.comp !== 'FRI') notes.push({ level: 'warn', text: `Short of match sharpness: ${blunt.slice(0, 5).map((p) => `${p.lastName} (${Math.round(sharpOf(p))}%)`).join(', ')}${blunt.length > 5 ? ` and ${blunt.length - 5} more` : ''}. They will tire sooner and are more likely to pick up injuries.` });
  const bench = resolveBench(c, g.players, xi);
  if (c.bench && c.bench.length > bench.length) notes.push({ level: 'warn', text: `${c.bench.length - bench.length} of your substitutes ${c.bench.length - bench.length > 1 ? 'are' : 'is'} unavailable or in the XI, so the bench is ${bench.length}.` });
  if (!bench.some((id) => (g.players[id].pos.GK ?? 0) >= 15)) notes.push({ level: 'warn', text: 'There is no goalkeeper on the bench.' });
  else if (c.bench && bench.length < BENCH_SIZE) notes.push({ level: 'info', text: `You have named ${bench.length} substitutes; up to ${BENCH_SIZE} are allowed.` });
  return { picked: !!c.lineup, notes };
}

export function prematch(ctx: Ctx): string {
  const g = ctx.game;
  const c = userClub(g);
  const f = userNextFixture(g);
  if (!f) return panel(c, 'Pre-match', '<p class="pad">There is no match to play.</p>');
  const home = f.homeId === c.id;
  const opp = club(g, home ? f.awayId : f.homeId);
  ensureSquad(g, opp);
  const cup = cupById(g, f.comp);
  const form = (id: number) => {
    const lr = leagueRow(g, id);
    if (!lr) return '<span class="small-note">-</span>';
    return lr.row.form.map((x) => `<span class="res res-${x}">${x}</span>`).join('') || '<span class="small-note">No games yet</span>';
  };
  const oppXi = resolveLineup(opp, g.players).map((id) => g.players[id]);
  const danger = [...oppXi].sort((a, b) => estimatedCA(g, b) - estimatedCA(g, a)).slice(0, 3);
  const oppOut = opp.playerIds.map((id) => g.players[id]).filter((p) => p.injury || p.suspended);
  const played = hasPlayed(g, c.id);
  const posLine = (id: number) => {
    const lr = leagueRow(g, id);
    if (!lr) return esc(standingText(g, id, null));
    if (!played) return cup || f.comp === 'FRI' ? esc(g.comps.find((x) => x.id === club(g, id).leagueId)?.name ?? '') : 'Opening day';
    return cup || f.comp === 'FRI' ? esc(standingText(g, id, lr.pos, lr.row.pts)) : `${ordinal(lr.pos)} · ${lr.row.pts} pts`;
  };
  const leg = firstLegNote(g, f);
  const decider = f.tieId !== undefined && f.leg !== 1;
  const rule = !cup ? '' : decider
    ? (cup.rounds[f.round].extraTime ? 'If it is level at the end, there will be extra time (with a sixth substitute) and then penalties.' : 'If it is level at the end, it goes straight to penalties.')
    : f.leg === 1 ? 'A draw is no disaster tonight: the tie is decided over two legs.' : 'Three points for a win, one for a draw, as in the league.';
  const cupNote = cup ? `<div class="warnbox cup-note"><b>${esc(stageLabel(g, f))}.</b> ${leg ? `${esc(leg)}. ` : ''}${rule}</div>` : '';
  const w = prematchWarnings(ctx);
  const notes = w.notes.map((n) => `<div class="warnbox ${n.level}"><b>${n.level === 'bad' ? 'Warning: ' : n.level === 'warn' ? 'Note: ' : ''}</b>${esc(n.text)}</div>`).join('');
  const header = `
    <div class="scoreboard prematch-sb">
      <div class="sb-team" style="${clubStrip(club(g, f.homeId))}">${sbClub(g, f.homeId)}</div>
      <div class="sb-score">v</div>
      <div class="sb-team" style="${clubStrip(club(g, f.awayId))}">${sbClub(g, f.awayId)}</div>
    </div>
    <p class="sb-meta">${kickoffLabel(g, f)}${tvChip(f)} · ${f.comp === 'FRI' ? 'Pre-season friendly' : cup ? compLink(g, f.comp, stageLabel(g, f)) : `${compLink(g, f.comp)} matchday ${f.round + 1}`} · ${esc(f.neutral ?? club(g, f.homeId).stadium)}</p>
    ${cupNote}
    <div class="prematch-grid">
      <dl class="facts">
        <div><dt>${esc(c.short)} position</dt><dd>${posLine(c.id)}</dd></div>
        <div><dt>${esc(c.short)} form</dt><dd>${form(c.id)}</dd></div>
        <div><dt>${esc(opp.short)} position</dt><dd>${posLine(opp.id)}</dd></div>
        <div><dt>${esc(opp.short)} form</dt><dd>${form(opp.id)}</dd></div>
      </dl>
      <dl class="facts">
        <div><dt>${esc(opp.name)} shape</dt><dd>${esc(opp.tactics.formation)}</dd></div>
        <div><dt>Players to watch</dt><dd>${danger.map((p) => playerLink(p, p.lastName)).join(', ')}</dd></div>
        <div><dt>Missing for them</dt><dd>${oppOut.length ? oppOut.map((p) => playerLink(p, p.lastName)).join(', ') : 'Nobody'}</dd></div>
      </dl>
    </div>
    ${notes}`;
  const kick = `<div class="kickoff-bar"><button class="btn primary big" data-act="kickoff">Kick off ►</button></div>`;
  return panel(c, `Pre-match: ${home ? 'v' : 'at'} ${esc(opp.name)}`, header + kick + tacticsBoard(ctx) + kick, `<span class="strip-meta">${c.lineup ? 'Your XI' : "Assistant's XI"}</span>`);
}

/* ───────────────────────── Fixtures ───────────────────────── */

function fixtureRow(g: GameState, f: Fixture, perspective?: number, tags?: ResultTag[]): string {
  const r = f.result;
  let res = '';
  if (r && perspective) {
    const x = resultLetter(r, f.homeId === perspective);
    res = `<span class="res res-${x}">${x}</span>`;
  }
  const score = r ? `<button class="score-btn" data-act="report" data-id="${f.id}">${scoreHtml(r)}</button>` : '<span class="vs">v</span>';
  const mine = f.homeId === g.userClubId || f.awayId === g.userClubId;
  const next = !r && mine && userNextFixture(g)?.id === f.id;
  const d = dateOfDay(g.season, f.day);
  const when = `<span class="d-long">${dateOf(g.season, f.day)}</span><span class="d-short">${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span><span class="ko">${f.tbc ? 'TBC' : f.time}</span>${tvChip(f)}`;
  return `<tr class="${mine && !perspective ? 'mine' : ''}${next ? ' mine' : ''}"><td class="date">${when}</td><td class="r">${clubLink(g, f.homeId)}</td><td class="c">${score}</td><td>${clubLink(g, f.awayId)}</td><td>${res}${compChip(g, f) ? ` ${compChip(g, f)}` : ''}${tags?.length ? tags.map((t) => ` <span class="chip tag-${t}">${TAG_LABEL[t]}</span>`).join('') : ''}</td></tr>`;
}

export function fixtures(ctx: Ctx): string {
  const g = ctx.game;
  const view = ctx.ui.fixturesView ?? 'mine';
  const tabs = segs([['mine', `${userClub(g).short} fixtures`], ['round', 'All results']], view, 'fx-view', 'v');
  let body: string;
  if (view === 'mine') {
    body = `<div class="scroll"><table class="grid fixtures"><tbody>${clubFixtures(g, g.userClubId).map((f) => fixtureRow(g, f, g.userClubId)).join('')}</tbody></table></div>`;
  } else {
    const cid = shownComp(ctx);
    const last = roundCount(g.fixtures, cid) - 1;
    // Default to the latest matchday played in that league.
    let latest = 0;
    for (const f of g.fixtures) if (f.comp === cid && f.result && f.round > latest) latest = f.round;
    const round = Math.min(last, Math.max(0, ctx.ui.round ?? latest));
    const list = fixturesForRound(g, cid, round).sort(byKickoff);
    const tags = roundTags(g, cid, round);
    body = `<div class="pad-top">${compTabs(ctx, cid)}</div>
      <div class="round-nav"><button class="btn small" data-act="round" data-r="${round - 1}" ${round <= 0 ? 'disabled' : ''}>◄ Prev</button><b>Matchday ${round + 1} · weekend of ${list[0] ? dateOf(g.season, list[0].weekend) : ''}</b><button class="btn small" data-act="round" data-r="${round + 1}" ${round >= last ? 'disabled' : ''}>Next ►</button></div>
      <div class="scroll"><table class="grid fixtures"><tbody>${list.map((f) => fixtureRow(g, f, undefined, tags.get(f.id))).join('')}</tbody></table></div>
      <p class="pad small-note">Kick-off times are confirmed about five weeks ahead, when the TV picks are made. <span class="chip tv">TV</span> marks games moved for live coverage.</p>`;
  }
  return panel(userClub(g), 'Fixtures &amp; Results', `<div class="pad-top">${tabs}</div>${body}`);
}

/* ───────────────────────── League table ───────────────────────── */

/** Champions League places (direct or via qualifying) by league, 2026/27 allocation. */
const CL_PLACES: Record<string, number> = { ENG: 4, ESP: 4, GER: 4, ITA: 4, FRA: 3, POR: 2 };

/** One league's table with its zones and key (promotion, Europe, relegation). */
function tableBody(g: GameState, cid: string): string {
  const t = leagueTable(g, cid);
  // Promotion, European places and relegation, marked down the left edge as in the real tables.
  const lv = level(cid);
  const cl = CL_PLACES[cid] ?? 4;
  const lower = !!lv && lv.tier > 1;
  const zone = (i: number) => {
    if (lower) {
      if (i < lv!.up) return ' zone-up';
      if (lv!.playoff && i >= lv!.playoff[0] - 1 && i < lv!.playoff[1]) return ' zone-po';
      return i >= t.length - lv!.down ? ' zone-rel' : '';
    }
    return i < cl ? ' zone-cl' : i < cl + 2 ? ' zone-eu' : i >= t.length - (lv?.down ?? 3) ? ' zone-rel' : '';
  };
  const rows = t.map((r, i) => `<tr class="${r.clubId === g.userClubId ? 'mine' : ''}${zone(i)}">
    <td class="n">${i + 1}</td><td>${clubLink(g, r.clubId)}</td><td class="n">${r.p}</td><td class="n hide-xs">${r.w}</td><td class="n hide-xs">${r.d}</td><td class="n hide-xs">${r.l}</td>
    <td class="n hide-sm">${r.gf}</td><td class="n hide-sm">${r.ga}</td><td class="n">${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="n pts">${r.pts}</td>
    <td class="form hide-sm">${r.form.map((x) => `<span class="res res-${x}">${x}</span>`).join('')}</td></tr>`).join('');
  const py = pyramidOf(leagueCountry(cid));
  const last = !!py && py.levels[py.levels.length - 1].id === cid;
  const down = lv?.down ?? 3;
  const key = lower
    ? `<p class="pad small-note table-key"><span class="key up"></span>Automatic promotion ${lv!.playoff ? `<span class="key po"></span>Play-offs (${ordinal(lv!.playoff[0])} to ${ordinal(lv!.playoff[1])}) ` : ''}<span class="key rel"></span>Relegation${last && py ? ` to the ${py.pool}` : ''}</p>`
    : `<p class="pad small-note table-key"><span class="key cl"></span>Champions League places <span class="key eu"></span>Europa League places <span class="key rel"></span>Relegation zone${py && py.levels.length > 1 ? ` <i>(${down} go down; the top ${py.levels[1].up}${py.levels[1].playoff ? ' and the play-off winner' : ''} of the ${py.levels[1].name} come up)</i>` : ''}</p>`;
  return `<div class="scroll"><table class="grid league"><thead><tr><th class="n">Pos</th><th>Team</th><th class="n">Pld</th><th class="n hide-xs">Won</th><th class="n hide-xs">Drn</th><th class="n hide-xs">Lst</th><th class="n hide-sm">For</th><th class="n hide-sm">Ag</th><th class="n">GD</th><th class="n">Pts</th><th class="hide-sm">Form</th></tr></thead><tbody>${rows}</tbody></table></div>${key}`;
}

/** The League Table screen: your own league, then every other league under "Around the world". */
export function table(ctx: Ctx): string {
  const g = ctx.game;
  const mine = userClub(g).leagueId;
  const own = leaguePanel(ctx, 'League Table', tableBody(g, mine), `<span class="strip-meta">${seasonLabel(g)}</span>`, mine);

  const others = g.comps.filter((c) => c.id !== mine && c.kind === 'league');
  if (!others.length) return own;
  const shown = others.find((c) => c.id === ctx.ui.worldComp) ?? others[0];
  const country = leagueCountry(shown.id);
  const countries = [...new Set(others.map((c) => leagueCountry(c.id)))];
  const countryTabs = countries.map((k) => `<button class="seg${k === country ? ' on' : ''}" data-act="world-country" data-k="${k}" role="tab" aria-selected="${k === country}">${esc(COUNTRY_NAMES[k] ?? k)}</button>`).join('');
  const leagueTabs = others.filter((c) => leagueCountry(c.id) === country).sort((a, b) => tierOf(a.id) - tierOf(b.id))
    .map((c) => `<button class="seg${c.id === shown.id ? ' on' : ''}" data-act="world-comp" data-c="${c.id}" role="tab" aria-selected="${c.id === shown.id}">${esc(c.name)}</button>`).join('');
  const world = `<section class="panel world-panel"><header class="strip"><h2>Around the world <small>– ${esc(shown.name)}</small></h2><span class="strip-meta">${seasonLabel(g)}</span></header>
    <div class="pad-top setup-tabs">
      <div class="tab-row"><span class="tab-label">Country</span><div class="segs comp-tabs" role="tablist" aria-label="Country">${countryTabs}</div></div>
      <div class="tab-row"><span class="tab-label">League</span><div class="segs comp-tabs" role="tablist" aria-label="League">${leagueTabs}</div></div>
    </div>${tableBody(g, shown.id)}</section>`;
  return `${own}<div class="world-gap"></div>${world}`;
}

/* ───────────────────────── Stats ───────────────────────── */

/** League-only statistics (cup games don't count towards the league's awards). */
const NO_STATS = { apps: 0, subApps: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0, yellow: 0, red: 0, cleanSheets: 0 };
const ls = (p: Player) => p.lstats ?? NO_STATS;
const lgRating = (p: Player) => { const n = ls(p).apps + ls(p).subApps; return n ? (ls(p).ratingSum / n).toFixed(2) : '-'; };

/** Statistics › Ballon d'Or: this year's nominees or ranking, the Kopa and Yashin trophies, and past winners. */
function ballonTab(ctx: Ctx): string {
  const g = ctx.game;
  const eds = g.ballon?.editions ?? [];
  const { shortlist, ceremony } = ballonDays(g.season);
  const cur = eds.find((e) => e.year === g.season);
  const last = [...eds].reverse().find((e) => e.done);
  const shown: BallonEdition | undefined = cur ?? last;
  const who = (a: { id: number; name: string; clubId: number | null; nation: string }) => {
    const p = g.players[a.id];
    return `${p ? playerLink(p, a.name) : esc(a.name)}`;
  };
  const clubOf = (id: number | null) => (id && g.clubs.find((c) => c.id === id) ? clubLink(g, id) : '');
  const ord = (i: number) => `${i + 1}`;
  let body = '';
  if (!cur) body += `<p class="pad small-note">The 30 nominees for the ${g.season} Ballon d'Or are named on ${esc(dayLabel(g.season, shortlist))}, and the winner, the Kopa Trophy (best player aged 21 or under) and the Yashin Trophy (best goalkeeper) on ${esc(dayLabel(g.season, ceremony))}. It covers the season just ended and the summer's internationals.</p>`;
  if (shown) {
    const done = shown.done;
    const list = done ? shown.nominees : [...shown.nominees].sort((a, b) => a.name.localeCompare(b.name));
    const rows = list.map((n, i) => `<tr class="${g.players[n.id]?.clubId === g.userClubId ? 'mine' : ''}"><td class="n">${done ? ord(i) : ''}</td><td>${who(n)}</td><td class="hide-xs">${clubOf(g.players[n.id]?.clubId ?? n.clubId)}</td><td>${esc(n.nation)}</td><td class="small-note">${esc(n.why || '')}</td></tr>`).join('');
    const trophies = done ? `<dl class="facts ballon-facts"><div><dt>Ballon d'Or</dt><dd>${who(shown.nominees[0])}</dd></div>${shown.kopa ? `<div><dt>Kopa Trophy</dt><dd>${who(shown.kopa)}</dd></div>` : ''}${shown.yashin ? `<div><dt>Yashin Trophy</dt><dd>${who(shown.yashin)}</dd></div>` : ''}</dl>` : '';
    body += `<div class="sub-head">Ballon d'Or ${shown.year}${done ? '' : ': the nominees'}</div>${done ? '' : `<p class="pad small-note">In alphabetical order. The ceremony is on ${esc(dayLabel(g.season, ceremony))}.</p>`}${trophies}
      <div class="scroll"><table class="grid"><thead><tr><th class="n">${done ? '#' : ''}</th><th>Player</th><th class="hide-xs">Club</th><th>Nat</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const past = eds.filter((e) => e.done).reverse();
  if (past.length) body += `<div class="sub-head">Winners</div><div class="scroll"><table class="grid compact"><thead><tr><th>Year</th><th>Ballon d'Or</th><th class="hide-xs">Kopa</th><th class="hide-xs">Yashin</th></tr></thead><tbody>${past.map((e) => `<tr><td>${e.year}</td><td>${who(e.nominees[0])}</td><td class="hide-xs">${e.kopa ? who(e.kopa) : '-'}</td><td class="hide-xs">${e.yashin ? who(e.yashin) : '-'}</td></tr>`).join('')}</tbody></table></div>`;
  return body;
}

export function stats(ctx: Ctx): string {
  const g = ctx.game;
  const tab = ctx.ui.statsTab ?? 'goals';
  const cid = shownComp(ctx);
  if (tab === 'ballon') {
    const tabs = segs([['goals', 'Top scorers'], ['assists', 'Assists'], ['rating', 'Average rating'], ['clean', 'Clean sheets'], ['ballon', "Ballon d'Or"]], tab, 'stats-tab', 't');
    return leaguePanel(ctx, 'Statistics', `<div class="pad-top">${tabs}</div>${ballonTab(ctx)}`, '', cid);
  }
  const inLeague = new Set(comp(g, cid).clubIds);
  const all = Object.values(g.players).filter((p) => p.clubId && inLeague.has(p.clubId));
  const apps = (p: Player) => ls(p).apps + ls(p).subApps;
  let played = 0;
  for (const f of g.fixtures) if (f.comp === cid && f.result && f.round + 1 > played) played = f.round + 1;
  const minApps = Math.max(1, Math.floor(played / 3));
  let list: Player[];
  let val: (p: Player) => string;
  let label: string;
  if (tab === 'assists') { list = all.filter((p) => ls(p).assists).sort((a, b) => ls(b).assists - ls(a).assists || ls(b).goals - ls(a).goals); val = (p) => String(ls(p).assists); label = 'Assists'; }
  else if (tab === 'rating') { list = all.filter((p) => apps(p) >= minApps).sort((a, b) => ls(b).ratingSum / apps(b) - ls(a).ratingSum / apps(a)); val = lgRating; label = 'Av Rat'; }
  else if (tab === 'clean') { list = all.filter((p) => ls(p).cleanSheets).sort((a, b) => ls(b).cleanSheets - ls(a).cleanSheets); val = (p) => String(ls(p).cleanSheets); label = 'Clean sheets'; }
  else { list = all.filter((p) => ls(p).goals).sort((a, b) => ls(b).goals - ls(a).goals || ls(b).assists - ls(a).assists); val = (p) => String(ls(p).goals); label = 'Goals'; }
  const rows = list.slice(0, 25).map((p, i) => `<tr class="${p.clubId === g.userClubId ? 'mine' : ''}"><td class="n">${i + 1}</td><td>${playerLink(p)}</td><td class="hide-xs">${clubLink(g, p.clubId!)}</td><td class="n">${apps(p)}</td><td class="n pts">${val(p)}</td></tr>`).join('');
  const tabs = segs([['goals', 'Top scorers'], ['assists', 'Assists'], ['rating', 'Average rating'], ['clean', 'Clean sheets'], ['ballon', "Ballon d'Or"]], tab, 'stats-tab', 't');
  return leaguePanel(ctx, 'Statistics', `<div class="pad-top">${compTabs(ctx, cid)}</div><div class="pad-top">${tabs}</div>${rows ? `<div class="scroll"><table class="grid"><thead><tr><th class="n">#</th><th>Player</th><th class="hide-xs">Club</th><th class="n">Apps</th><th class="n">${label}</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="pad">No matches played yet.</p>'}<p class="pad small-note">League games only.${tab === 'rating' ? ` Minimum ${minApps} appearance${minApps > 1 ? 's' : ''}.` : ''}</p>`, '', cid);
}

/* ───────────────────────── Club ───────────────────────── */

/** Squad list for any club (read-only). Click a heading to sort. */
function clubSquadTable(ctx: Ctx, c: Club): string {
  const g = ctx.game;
  const players = c.playerIds.map((id) => g.players[id]);
  const xi = new Set(resolveLineup(c, g.players));
  const cols: SCol[] = [
    { key: 'no', label: 'No', num: true, val: (p) => p.squadNo },
    { key: 'name', label: 'Name', val: (p) => p.lastName, html: (p) => `${playerLink(p)} ${statusChips(p)}${xi.has(p.id) ? ' <span class="chip on" title="In their expected XI">XI</span>' : ''}` },
    { key: 'pos', label: 'Position', val: (p) => posOrder(p), html: (p) => esc(pos(p)) },
    { key: 'age', label: 'Age', num: true, val: (p) => p.age },
    { key: 'nat', label: 'Nat', cls: 'hide-sm', val: (p) => p.nation, html: (p) => nationLink(p.nation) },
    { key: 'ca', label: 'Ability', val: (p) => estimatedCA(g, p), html: (p) => abilityStars(g, p) },
    { key: 'apps', label: 'Apps', num: true, cls: 'hide-xs', val: (p) => p.stats.apps + p.stats.subApps / 100, html: (p) => `${p.stats.apps}${p.stats.subApps ? `(${p.stats.subApps})` : ''}` },
    { key: 'gls', label: 'Gls', num: true, cls: 'hide-xs', val: (p) => p.stats.goals },
    { key: 'avr', label: 'Av R', num: true, val: (p) => (p.stats.apps + p.stats.subApps ? Number(avgRating(p)) || 0 : 0), html: (p) => (p.stats.apps + p.stats.subApps ? avgRating(p) : '-') },
  ];
  const { head, rows } = sortableTable(ctx, 'club-squad', cols, players, { key: 'pos', dir: 1 }, (a, b) => posOrder(a) - posOrder(b) || b.ca - a.ca);
  return `<div class="scroll"><table class="grid squad"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

const CUP_NAMES: Record<string, string> = Object.fromEntries([...EURO_2026, ...DOMESTIC_2026].map((d) => [d.id, d.name]));

const STYLE_WORD = (t: Tactics): string => [
  t.passing === 'short' ? 'short passing' : t.passing === 'long' ? 'direct, long balls' : 'mixed passing',
  t.closingDown === 'all-over' ? 'press high' : t.closingDown === 'own-half' ? 'sit deep' : 'press in midfield',
  t.counterAttack ? 'counter-attack' : '',
  t.offsideTrap ? 'play an offside trap' : '',
].filter(Boolean).join(', ');

const MOVE_WORD: Record<TransferRecord['kind'], string> = { transfer: 'Transfer', loan: 'Loan', free: 'Free', 'loan-end': 'Loan ends', release: 'Released' };

/** A club's business, season by season: who came in and who went out, loans included. */
function clubTransfers(ctx: Ctx, c: Club): string {
  const g = ctx.game;
  const all = g.transfers.filter((t) => t.fromId === c.id || t.toId === c.id);
  const seasons = [...new Set([g.season, ...all.map((t) => t.season)])].sort((a, b) => b - a);
  const season = seasons.includes(ctx.ui.clubSeason ?? -1) ? ctx.ui.clubSeason! : seasons[0];
  const list = all.filter((t) => t.season === season).sort((a, b) => a.day - b.day);
  const other = (id: number | null) => {
    if (id === null) return '<i>Free agent</i>';
    const x = g.clubs.find((k) => k.id === id) ?? g.extClubs.find((k) => k.id === id);
    return x ? (x.external ? esc(x.name) : clubLink(g, id)) : '<i>Elsewhere</i>';
  };
  const who = (t: TransferRecord) => (g.players[t.playerId] ? playerLink(g.players[t.playerId], t.name) : esc(t.name));
  const fee = (t: TransferRecord) => (t.kind === 'transfer' || (t.kind === 'loan' && t.fee) ? fmtMoney(t.fee) : t.kind === 'loan' || t.kind === 'loan-end' ? '-' : 'Free');
  const date = (t: TransferRecord) => dateOf(t.season, t.day).replace(/ \d{4}$/, '');
  const rows = (inbound: boolean) => list.filter((t) => (inbound ? t.toId === c.id : t.fromId === c.id)).map((t) => `<tr><td class="date hide-xs">${esc(date(t))}</td><td>${who(t)}</td><td>${other(inbound ? t.fromId : t.toId)}</td><td><span class="chip mv-${t.kind}">${MOVE_WORD[t.kind]}</span></td><td class="n money">${fee(t)}</td></tr>`).join('');
  const spent = list.filter((t) => t.toId === c.id).reduce((n, t) => n + t.fee, 0);
  const got = list.filter((t) => t.fromId === c.id).reduce((n, t) => n + t.fee, 0);
  const table = (title: string, body: string, none: string) => `<div class="sub-head">${title}</div>${body ? `<div class="scroll"><table class="grid compact club-moves"><thead><tr><th class="hide-xs">Date</th><th>Player</th><th>${title === 'In' ? 'From' : 'To'}</th><th>Type</th><th class="n">Fee</th></tr></thead><tbody>${body}</tbody></table></div>` : `<p class="pad small-note">${none}</p>`}`;
  const tabs = segs(seasons.map((s) => [String(s), `${s}/${String((s + 1) % 100).padStart(2, '0')}`] as [string, string]), String(season), 'club-season', 's');
  return `<div class="pad-top">${tabs}</div>
    <p class="pad small-note">Spent ${fmtMoney(spent)} · received ${fmtMoney(got)} · net ${got - spent >= 0 ? '+' : '−'}${fmtMoney(Math.abs(got - spent))}. ${season === g.season ? 'This season so far, both windows.' : ''}</p>
    ${table('In', rows(true), 'Nobody has joined.')}${table('Out', rows(false), 'Nobody has left.')}`;
}

export function clubScreen(ctx: Ctx): string {
  const g = ctx.game;
  const c = ctx.ui.clubId ? club(g, ctx.ui.clubId) : userClub(g);
  const mine = c.id === g.userClubId;
  const tab = ctx.ui.clubTab ?? (mine ? 'info' : 'squad');
  const tabs = segs([['info', 'Information'], ['squad', 'Squad'], ['fixtures', 'Fixtures'], ...(c.external ? [] : [['transfers', 'Transfers']] as [string, string][]), ...(mine ? [['staff', 'Staff'], ['stadium', 'Stadium']] as [string, string][] : [])], tab, 'club-tab', 't');
  const players = c.playerIds.map((id) => g.players[id]);
  const best = [...players].sort((a, b) => b.ca - a.ca)[0];
  const back = mine ? '' : '<button class="btn small" data-act="back">◄ Back</button>';
  let body: string;
  if (tab === 'stadium' && mine) {
    body = stadiumTab(ctx);
  } else if (tab === 'staff' && mine) {
    body = staffTab(ctx);
  } else if (tab === 'transfers' && !c.external) {
    body = clubTransfers(ctx, c);
  } else if (tab === 'squad') {
    body = clubSquadTable(ctx, c);
  } else if (tab === 'fixtures') {
    body = `<div class="scroll"><table class="grid fixtures"><tbody>${clubFixtures(g, c.id).map((f) => fixtureRow(g, f, c.id)).join('')}</tbody></table></div>`;
  } else if (c.external) {
    body = `<div class="club-grid">
      <dl class="facts">
        <div><dt>Stadium</dt><dd>${esc(c.stadium)}</dd></div>
        <div><dt>Capacity</dt><dd>${c.capacity.toLocaleString('en-GB')}</dd></div>
        <div><dt>Division</dt><dd>${esc(c.external.division)} (${esc(c.external.country)})</dd></div>
        <div><dt>Formation</dt><dd>${esc(c.tactics.formation)}</dd></div>
        <div><dt>How they play</dt><dd>${esc(STYLE_WORD(c.tactics))}</dd></div>
      </dl>
      <p class="small-note">A club from outside the six leagues, here for the cups. ${players.length ? '' : 'Their squad will be known when they play.'}</p>
    </div>${clubCupsHtml(g, c.id)}`;
  } else if (!mine) {
    const avgAge = players.reduce((n, p) => n + p.age, 0) / players.length;
    const out = players.filter((p) => p.injury || p.suspended);
    body = `<div class="club-grid">
      <dl class="facts">
        <div><dt>Stadium</dt><dd>${esc(c.stadium)}</dd></div>
        <div><dt>Capacity</dt><dd>${c.capacity.toLocaleString('en-GB')}</dd></div>
        <div><dt>Reputation</dt><dd>${starBarRaw(c.reputation / 2, 'Reputation')}</dd></div>
        <div><dt>League</dt><dd>${compLink(g, c.leagueId)}</dd></div>
        <div><dt>League position</dt><dd>${hasPlayed(g, c.id) ? ordinal(tablePos(g, c.id)) : '-'}</dd></div>
        <div><dt>Board target</dt><dd>${esc(targetText(g, c.id))}</dd></div>
      </dl>
      <dl class="facts">
        <div><dt>Formation</dt><dd>${esc(c.tactics.formation)}</dd></div>
        <div><dt>How they play</dt><dd>${esc(STYLE_WORD(c.tactics))}</dd></div>
        <div><dt>Squad</dt><dd>${players.length} players · avg age ${avgAge.toFixed(1)}</dd></div>
        <div><dt>Best player</dt><dd>${playerLink(best)}</dd></div>
        <div><dt>Unavailable</dt><dd>${out.length ? out.map((p) => playerLink(p, p.lastName)).join(', ') : 'Nobody'}</dd></div>
      </dl>
    </div>${clubCupsHtml(g, c.id)}`;
  } else {
    const won = (h: (typeof g.history)[number]) => Object.entries(h.cups ?? {}).filter(([, n]) => n === c.name).map(([id]) => CUP_NAMES[id] ?? id);
    const hist = g.history.slice().reverse().map((h) => `<tr><td>${h.season}/${String((h.season + 1) % 100).padStart(2, '0')}</td><td>${clubLink(g, h.champions[h.userComp])}</td><td>${h.userClubId === c.id ? ordinal(h.userPosition) : '-'} (${h.userPoints} pts)${won(h).length ? ` · <b>${esc(won(h).join(', '))}</b>` : ''}</td><td class="hide-sm">${esc(h.topScorerName)} (${h.topScorerGoals})</td></tr>`).join('');
    const confirming = ctx.ui.confirm === 'newgame';
    const reset = confirming
      ? `<div class="confirm">Start a new game? Your current career will be lost. <button class="btn danger" data-act="newgame">Start again</button> <button class="btn" data-act="confirm-cancel">Keep playing</button></div>`
      : `<button class="btn ghost" data-act="confirm" data-key="newgame">New game…</button>`;
    body = `<div class="club-grid">
      <dl class="facts">
        <div><dt>Manager</dt><dd>${esc(g.managerName)}</dd></div>
        <div><dt>Stadium</dt><dd>${esc(c.stadium)}</dd></div>
        <div><dt>Capacity</dt><dd>${c.capacity.toLocaleString('en-GB')}</dd></div>
        <div><dt>Reputation</dt><dd>${starBarRaw(c.reputation / 2, 'Reputation')}</dd></div>
        <div><dt>League</dt><dd>${compLink(g, c.leagueId)}</dd></div>
        <div><dt>Board target</dt><dd>${esc(targetText(g, c.id))}</dd></div>
        <div><dt>League position</dt><dd>${hasPlayed(g, c.id) ? ordinal(tablePos(g, c.id)) : '-'}</dd></div>
        <div><dt>Squad size</dt><dd>${c.playerIds.length}</dd></div>
        <div><dt>Best player</dt><dd>${playerLink(best)}</dd></div>
      </dl>
      <div>${boardPanel(g)}${savePanel(true)}${fullScreenPanel()}${reset}</div>
    </div>
    ${clubCupsHtml(g, c.id)}
    <div class="sub-head">Season history</div>
    ${hist ? `<div class="scroll"><table class="grid"><thead><tr><th>Season</th><th>Champions</th><th>You</th><th class="hide-sm">Top scorer</th></tr></thead><tbody>${hist}</tbody></table></div>` : '<p class="pad small-note">Your first season is under way. Past seasons will be listed here.</p>'}`;
  }
  return panel(c, mine ? 'Club Information' : 'Club', `<div class="pad-top">${tabs}</div>${body}`, back);
}

/** The board's confidence in the manager: a meter, a word, and any warnings. */
export function boardPanel(g: GameState): string {
  const b = boardSummary(g);
  const cls = b.confidence < 25 ? 'bad' : b.confidence < 45 ? 'warn' : '';
  const warn = b.warnings === 0 ? '' : b.warnings === 1 ? '<p class="small-note">You have had a warning from the board.</p>' : '<p class="small-note"><b>You have had a final warning.</b> Another poor run and you will be sacked.</p>';
  return `<div class="board-box"><h4>BOARD CONFIDENCE</h4>
    <div class="board-meter" role="img" aria-label="Board confidence ${b.confidence} out of 100"><i class="${cls}" style="width:${b.confidence}%"></i></div>
    <p><b>${esc(b.word)}</b> <span class="small-note">(${b.confidence}/100)</span></p>
    <p class="small-note">They expect: ${esc(b.target)}. Results, league position and the club's finances all count.</p>${warn}</div>`;
}

/** After the sack: the clubs that will still have you. */
export function sackedScreen(ctx: Ctx): string {
  const g = ctx.game;
  const sk = ensureBoard(g).sacked!;
  const old = sk.clubName ? { ...club(g, sk.clubId), name: sk.clubName, colours: sk.colours ?? club(g, sk.clubId).colours } : club(g, sk.clubId);
  const rows = sk.offers.map((id) => {
    const c = club(g, id);
    return `<tr><td>${clubLink(g, id)}</td><td>${compLink(g, c.leagueId)}</td><td>${starBarRaw(c.reputation / 2, 'Reputation')}</td><td>${esc(targetText(g, id))}</td><td class="r"><button class="btn primary small" data-act="take-job" data-id="${id}">Accept</button></td></tr>`;
  }).join('');
  return `<section class="panel"><header class="strip" style="${clubStrip(old)}"><h2>${esc(old.name)} <small>– ${sk.clubName ? 'Your time here is over' : 'You have been sacked'}</small></h2></header>
    <p class="pad"><b>${esc(g.managerName)}, the ${esc(old.name)} board ${sk.clubName ? 'have released you' : 'have relieved you of your duties'}.</b> ${esc(sk.reason)}. Some clubs are still interested in you. Choose one to carry on your career.</p>
    <div class="scroll"><table class="grid"><thead><tr><th>Club</th><th>League</th><th>Reputation</th><th>Board expects</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="pad small-note">Your record stays with you; the new board starts with an open mind (moderate confidence) and a fresh squad to judge.</p>
  </section>`;
}

/* ───────────────────────── Match report ───────────────────────── */

export function statBar(label: string, [x, y]: [number, number], cols: [string, string], pct = false): string {
  const t = x + y || 1;
  return `<div class="statbar"><span class="n">${x}${pct ? '%' : ''}</span><div class="bar"><i style="width:${(x / t) * 100}%;background:${cols[0]}"></i><i style="width:${(y / t) * 100}%;background:${cols[1]}"></i></div><span class="n">${y}${pct ? '%' : ''}</span><span class="lbl">${label}</span></div>`;
}

/** Bar colours for two clubs; if both use the same main colour, the away side uses its second colour. */
export function barColours(h: Club, a: Club): [string, string] {
  return [h.colours[0], h.colours[0].toLowerCase() === a.colours[0].toLowerCase() ? a.colours[1] : a.colours[0]];
}

/** The rest of the matchday in the same league, with upsets and big games picked out. */
function aroundTheLeague(g: GameState, f: Fixture): string {
  if (f.comp === 'FRI') return '';
  const cup = cupById(g, f.comp);
  if (cup) return aroundTheCup(g, f);
  const list = fixturesForRound(g, f.comp, f.round).filter((x) => x.id !== f.id).sort(byKickoff);
  if (!list.length) return '';
  const tags = roundTags(g, f.comp, f.round);
  const played = list.filter((x) => x.result);
  const flagged = played.filter((x) => tags.get(x.id)?.length);
  const headline = flagged.length
    ? `<p class="round-headline">${flagged.map((x) => `<span class="chip tag-${tags.get(x.id)![0]}">${TAG_LABEL[tags.get(x.id)![0]]}</span> ${clubLink(g, x.homeId)} ${x.result!.hg}-${x.result!.ag} ${clubLink(g, x.awayId)}`).join('<br>')}</p>`
    : played.length ? '<p class="round-headline small-note">No shocks elsewhere so far this matchday.</p>' : '';
  const pending = list.length - played.length;
  return `<div class="sub-head">Around the ${compLink(g, f.comp)} · Matchday ${f.round + 1}${pending ? ` <span class="small-note">(${pending} still to play)</span>` : ''}</div>
    ${headline}
    <div class="scroll"><table class="grid fixtures compact"><tbody>${list.map((x) => fixtureRow(g, x, undefined, tags.get(x.id))).join('')}</tbody></table></div>`;
}

/** The rest of the cup round (same leg), with giant-killings picked out. */
function aroundTheCup(g: GameState, f: Fixture): string {
  const cup = cupById(g, f.comp)!;
  const list = g.fixtures.filter((x) => x.comp === f.comp && x.round === f.round && x.id !== f.id && x.tieId !== undefined === (f.tieId !== undefined) && (x.leg ?? 0) === (f.leg ?? 0)).sort(byKickoff);
  if (!list.length) return '';
  const tags = new Map(list.map((x) => [x.id, resultTags(g, x)] as [number, ResultTag[]]));
  const played = list.filter((x) => x.result);
  const flagged = played.filter((x) => tags.get(x.id)?.includes('upset'));
  const headline = flagged.length
    ? `<p class="round-headline">${flagged.slice(0, 6).map((x) => `<span class="chip tag-upset">${TAG_LABEL.upset}</span> ${clubLink(g, x.homeId)} ${x.result!.hg}-${x.result!.ag} ${clubLink(g, x.awayId)}${x.result!.pens ? ` (${x.result!.pens[0]}-${x.result!.pens[1]} pens)` : ''}`).join('<br>')}</p>`
    : '';
  const pending = list.length - played.length;
  const title = f.tieId === undefined ? `${cup.name} · matchday ${f.round + 1}` : `${cup.name} · ${cup.rounds[f.round].name.toLowerCase()}${f.leg ? `, ${f.leg === 1 ? 'first' : 'second'} legs` : ''}`;
  return `<div class="sub-head">Elsewhere in the ${esc(title)}${pending ? ` <span class="small-note">(${pending} still to play)</span>` : ''}</div>
    ${headline}
    <div class="scroll"><table class="grid fixtures compact"><tbody>${list.map((x) => fixtureRow(g, x, undefined, tags.get(x.id)?.filter((t) => t !== 'big'))).join('')}</tbody></table></div>`;
}

/** Penalty shoot-out, kick by kick. */
function shootoutHtml(g: GameState, r: NonNullable<Fixture['result']>, h: Club, a: Club): string {
  if (!r.kicks?.length || !r.pens) return '';
  const col = (side: 0 | 1) => r.kicks!.filter((k) => k.side === side).map((k) => `<li class="${k.scored ? 'scored' : 'missed'}">${k.scored ? '●' : '○'} ${esc(g.players[k.playerId]?.lastName ?? '?')}</li>`).join('');
  return `<div class="sub-head">Penalty shoot-out · ${esc(h.short)} ${r.pens[0]}-${r.pens[1]} ${esc(a.short)}</div><div class="scorers shootout"><ul>${col(0)}</ul><ul>${col(1)}</ul></div>`;
}

export function report(ctx: Ctx): string {
  const g = ctx.game;
  const f = g.fixtures.find((x) => x.id === ctx.ui.fixtureId);
  const back = `<button class="btn small" data-act="back">◄ Back</button>`;
  if (!f?.result) return panel(userClub(g), 'Match Report', '<p class="pad">No report for that match.</p>', back);
  const r = f.result;
  const h = club(g, f.homeId);
  const a = club(g, f.awayId);
  const name = (id: number) => g.players[id]?.lastName ?? 'Unknown';
  const goals = (side: 0 | 1) => r.events.filter((e) => (e.kind === 'goal' || e.kind === 'pen' || e.kind === 'og') && e.side === side)
    .map((e) => `<li>${esc(name(e.playerId))} ${minuteLabel(e.minute, e.et)}${e.kind === 'pen' ? ' (pen)' : e.kind === 'og' ? ' (og)' : ''}</li>`).join('');
  const cols = barColours(h, a);
  const hasLineups = r.lineups[0].length > 0;
  const lineup = (side: 0 | 1) => {
    const ids = [...r.lineups[side], ...r.events.filter((e) => e.kind === 'sub' && e.side === side).map((e) => e.otherId!)];
    return ids.map((id) => {
      const p = g.players[id];
      const ev = r.events.filter((e) => e.playerId === id || (e.kind === 'sub' && e.otherId === id));
      const icons = ev.map((e) => e.kind === 'goal' || e.kind === 'pen' ? '<i class="ic goal" title="Goal"></i>' : e.kind === 'yellow' ? '<i class="ic yel" title="Booked"></i>' : e.kind === 'red' ? '<i class="ic red" title="Sent off"></i>' : e.kind === 'injury' ? '<i class="ic inj" title="Injured"></i>' : e.kind === 'sub' ? (e.otherId === id ? `<i class="ic on" title="On ${e.minute}'"></i>` : `<i class="ic off" title="Off ${e.minute}'"></i>`) : '').join('');
      const rating = r.ratings[id];
      return `<tr class="${r.lineups[side].includes(id) ? '' : 'subbed'}"><td>${p ? playerLink(p, shortName(p)) : 'Unknown'} ${icons}${r.motm === id ? ' <span class="chip on" title="Man of the match">MoM</span>' : ''}</td><td class="n rating">${rating?.toFixed(1) ?? '-'}</td></tr>`;
    }).join('');
  };
  const comm = r.commentary
    ? `<details class="commentary-log"><summary>Full commentary</summary><ol>${r.commentary.map((l) => `<li class="t-${l.tone}"><span class="min">${minuteLabel(l.minute, l.stage)}</span>${esc(l.text)}</li>`).join('')}</ol></details>`
    : '';
  const s = r.stats;
  const body = `
    <div class="scoreboard">
      <div class="sb-team" style="${clubStrip(h)}">${sbClub(g, h.id)}</div>
      <div class="sb-mid"><div class="sb-score">${r.hg} - ${r.ag}</div>${r.pens ? `<div class="sb-clock">${r.aet ? 'AET · ' : ''}${r.pens[0]}-${r.pens[1]} PENS</div>` : r.aet ? '<div class="sb-clock">AFTER EXTRA TIME</div>' : ''}${f.leg === 2 ? `<div class="sb-agg">${esc(firstLegNote(g, f))}</div>` : ''}</div>
      <div class="sb-team" style="${clubStrip(a)}">${sbClub(g, a.id)}</div>
    </div>
    <p class="sb-meta">${kickoffLabel(g, f)} · ${f.comp === 'FRI' ? 'Pre-season friendly' : cupById(g, f.comp) ? compLink(g, f.comp, stageLabel(g, f)) : `${compLink(g, f.comp)} matchday ${f.round + 1}`} · ${esc(f.neutral ?? h.stadium)} · Att: ${r.attendance.toLocaleString('en-GB')}</p>
    <div class="scorers"><ul>${goals(0)}</ul><ul>${goals(1)}</ul></div>
    ${shootoutHtml(g, r, h, a)}
    <div class="story"><h4>MATCH REPORT</h4>${matchStory(g, f).map((x) => `<p>${esc(x)}</p>`).join('')}</div>
    <div class="stats-block">
      ${statBar('Possession', s.possession, cols, true)}${statBar('Shots', s.shots, cols)}${statBar('On target', s.onTarget, cols)}${statBar('Corners', s.corners, cols)}${statBar('Fouls', s.fouls, cols)}${s.offsides && s.offsides[0] + s.offsides[1] > 0 ? statBar('Offsides', s.offsides, cols) : ''}
    </div>
    ${hasLineups ? `<div class="lineups"><table class="grid compact"><thead><tr><th>${esc(h.name)}</th><th class="n">Rat</th></tr></thead><tbody>${lineup(0)}</tbody></table>
    <table class="grid compact"><thead><tr><th>${esc(a.name)}</th><th class="n">Rat</th></tr></thead><tbody>${lineup(1)}</tbody></table></div>` : '<p class="pad small-note">Team sheets and player ratings are kept for your own matches only.</p>'}
    ${aroundTheLeague(g, f)}
    ${comm}`;
  return panel(userClub(g), 'Match Report', body, back);
}

/* ───────────────────────── Season review ───────────────────────── */

export function seasonEnd(ctx: Ctx): string {
  const g = ctx.game;
  const myComp = userClub(g).leagueId;
  const t = leagueTable(g, myComp);
  const champ = club(g, t[0].clubId);
  const me = t.findIndex((r) => r.clubId === g.userClubId) + 1;
  const inLeague = new Set(comp(g, myComp).clubIds);
  const all = Object.values(g.players).filter((p) => p.clubId && inLeague.has(p.clubId));
  const apps = (p: Player) => ls(p).apps + ls(p).subApps;
  const top = [...all].sort((a, b) => ls(b).goals - ls(a).goals)[0];
  const potsy = all.filter((p) => apps(p) >= 20).sort((a, b) => ls(b).ratingSum / apps(b) - ls(a).ratingSum / apps(a))[0];
  const young = all.filter((p) => p.age <= 21 && apps(p) >= 10).sort((a, b) => ls(b).ratingSum / apps(b) - ls(a).ratingSum / apps(a))[0];
  const award = (label: string, p?: Player, detail = '') => p ? `<div class="award"><span class="award-label">${label}</span>${playerLink(p)}<span class="award-club">${clubLink(g, p.clubId!)}${detail}</span></div>` : '';
  const board = g.news.find((n) => n.kind === 'board' && n.season === g.season && n.title.includes('review'));
  const body = `
    <div class="season-hero" style="${clubStrip(champ)}"><span>${esc(comp(g, myComp).name.toUpperCase())} CHAMPIONS ${seasonLabel(g)}</span><strong>${esc(champ.name)}</strong><span>${t[0].pts} points</span></div>
    <div class="season-grid">
      <div><h4>Your season</h4><p class="big">${ordinal(me)}</p><p>${t[me - 1].pts} points · ${t[me - 1].w}W ${t[me - 1].d}D ${t[me - 1].l}L</p>${board ? `<p class="board-note">${esc(board.body)}</p>` : ''}</div>
      <div><h4>Awards</h4>${award('Golden Boot', top, ` · ${(top ? ls(top).goals : 0)} goals`)}${award('Player of the Season', potsy, potsy ? ` · ${lgRating(potsy)}` : '')}${award('Young Player of the Season', young, young ? ` · ${lgRating(young)}` : '')}</div>
    </div>
    <div class="sub-head">Champions around Europe</div>
    <div class="scroll"><table class="grid compact"><tbody>${g.comps.map((c) => { const tt = leagueTable(g, c.id); return `<tr class="${c.id === myComp ? 'mine' : ''}"><td>${compLink(g, c.id)}</td><td>${clubLink(g, tt[0].clubId)}</td><td class="n">${tt[0].pts} pts</td></tr>`; }).join('')}</tbody></table></div>
    ${g.cups.some((c) => c.winnerId) ? `<div class="sub-head">Cup winners</div>
    <div class="scroll"><table class="grid compact"><tbody>${g.cups.filter((c) => c.winnerId).map((c) => `<tr class="${c.winnerId === g.userClubId ? 'mine' : ''}"><td><button class="link" data-act="cup-open" data-c="${c.id}">${esc(c.name)}</button></td><td>${clubLink(g, c.winnerId!)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <p class="pad">Over the summer, players will age and develop, some veterans will retire, and every club takes in a new crop of youth players.</p>
    <div class="pad"><button class="btn primary" data-act="next-season">Start the ${g.season + 1}/${String((g.season + 2) % 100).padStart(2, '0')} season</button></div>`;
  return leaguePanel(ctx, 'Season Review', body, '', myComp);
}

/* ───────────────────────── Actions ───────────────────────── */

export const screenActions: Record<string, Action> = {
  'tac-tab': (ctx, el) => {
    ctx.ui.tacTab = el.dataset.t as 'squad' | 'bench' | 'shape';
    ctx.render();
  },
  'pick-sort': (ctx) => {
    const same = (ctx.ui.pickCol ?? 'picked') === 'picked';
    ctx.ui.pickSort = !same ? 'asc' : ctx.ui.pickSort === 'asc' ? 'desc' : ctx.ui.pickSort === 'desc' ? null : 'asc';
    ctx.ui.pickCol = 'picked';
    ctx.render();
  },
  'pos-sort': (ctx) => {
    const same = ctx.ui.pickCol === 'pos';
    ctx.ui.pickSort = !same ? 'asc' : ctx.ui.pickSort === 'asc' ? 'desc' : ctx.ui.pickSort === 'desc' ? null : 'asc';
    ctx.ui.pickCol = 'pos';
    ctx.render();
  },
  ...sortActions,
  'ack-injury': (ctx, el) => { acknowledgeInjury(ctx.game, Number(el.dataset.id)); ctx.save(); ctx.render(); },
  'take-job': (ctx, el) => {
    if (takeNewJob(ctx.game, Number(el.dataset.id))) {
      ctx.toast(`Welcome to ${club(ctx.game, ctx.game.userClubId).name}`);
      ctx.save();
      ctx.go('inbox', { clubId: undefined });
    }
  },
  player: (ctx, el) => ctx.go('player', { playerId: Number(el.dataset.id), confirm: null, deal: null, dealMsg: null }),
  news: (ctx, el) => { ctx.ui.newsId = Number(el.dataset.id); ctx.render(); ctx.save(); },
  'news-filter': (ctx, el) => { ctx.ui.newsFilter = el.dataset.f as 'all'; ctx.ui.newsId = undefined; ctx.render(); },
  'news-read-all': (ctx) => { for (const n of ctx.game.news) n.read = true; ctx.save(); ctx.render(); },
  'squad-filter': (ctx, el) => { ctx.ui.squadFilter = el.dataset.f as 'all'; ctx.render(); },
  sort: (ctx, el) => {
    const k = el.dataset.key!;
    if ((ctx.ui.sortKey ?? 'sel') === k) ctx.ui.sortDir = (ctx.ui.sortDir ?? 1) === 1 ? -1 : 1;
    else ctx.ui.sortDir = ['name', 'pos', 'nat', 'sel', 'no'].includes(k) ? 1 : -1;
    ctx.ui.sortKey = k;
    ctx.render();
  },
  slot: (ctx, el) => {
    const i = Number(el.dataset.i);
    // A substitute is waiting: bring him on in this position.
    if (ctx.ui.benchSlot !== null && ctx.ui.benchSlot !== undefined) {
      const place = ctx.ui.benchSlot;
      benchToXi(ctx, place, i);
      if (phoneTactics()) ctx.ui.benchSlot = place;
      ctx.render();
      return;
    }
    ctx.ui.slot = ctx.ui.slot === i ? null : i;
    ctx.render();
    revealPitch(ctx);
  },
  'bench-slot': (ctx, el) => {
    const i = Number(el.dataset.i);
    // A shirt is waiting: swap that player with this substitute.
    if (ctx.ui.slot !== null && ctx.ui.slot !== undefined) {
      const was = ctx.ui.slot;
      benchToXi(ctx, i, was);
      if (phoneTactics()) ctx.ui.slot = was;
      ctx.render();
      return;
    }
    ctx.ui.benchSlot = ctx.ui.benchSlot === i ? null : i;
    ctx.render();
    revealPitch(ctx);
  },
  'bench-toggle': (ctx, el) => { toggleBench(ctx, Number(el.dataset.id)); ctx.render(); },
  'bench-auto': (ctx) => { userClub(ctx.game).bench = null; ctx.ui.benchSlot = null; ctx.save(); ctx.render(); },
  'slot-cancel': (ctx) => { ctx.ui.slot = null; ctx.ui.benchSlot = null; ctx.render(); },
  assign: (ctx, el) => {
    const id = Number(el.dataset.id);
    const wasBench = ctx.ui.benchSlot ?? null;
    const wasSlot = ctx.ui.slot ?? null;
    if (wasBench !== null) placeOnBench(ctx, wasBench, id);
    else if (wasSlot !== null) placePlayer(ctx, wasSlot, id);
    // On a phone the sheet stays open, so several changes can be made one after another.
    if (phoneTactics()) {
      if (wasBench !== null) ctx.ui.benchSlot = wasBench;
      else ctx.ui.slot = wasSlot;
    }
    ctx.render();
  },
  'keep-xi': (ctx) => {
    const c = userClub(ctx.game);
    c.lineup = resolveLineup(c, ctx.game.players);
    ctx.ui.confirm = null;
    ctx.save();
    ctx.toast('This XI is now your team selection');
    ctx.render();
  },
  'run-toggle': (ctx, el) => {
    const c = userClub(ctx.game);
    const id = Number(el.dataset.id);
    const k = el.dataset.k as 'ball' | 'off';
    const runs = (c.runs ??= {});
    const cur = { ...(runs[id] ?? {}) };
    cur[k] = !cur[k];
    if (cur.ball || cur.off) runs[id] = cur;
    else delete runs[id];
    ctx.save();
    ctx.render();
  },
  'run-clear': (ctx) => { userClub(ctx.game).runs = {}; ctx.save(); ctx.render(); },
  'unpick-all': (ctx) => {
    const c = userClub(ctx.game);
    c.lineup = Array(11).fill(-1);
    c.bench = [];
    ctx.ui.slot = null;
    ctx.ui.benchSlot = null;
    ctx.save();
    ctx.render();
  },
  autopick: (ctx) => { userClub(ctx.game).lineup = null; ctx.ui.slot = null; ctx.ui.benchSlot = null; ctx.save(); ctx.render(); },
  mentality: (ctx, el) => { userClub(ctx.game).tactics.mentality = el.dataset.m as Mentality; ctx.save(); ctx.render(); },
  'world-country': (ctx, el) => {
    const first = ctx.game.comps.filter((c) => c.kind === 'league' && c.id !== userClub(ctx.game).leagueId && leagueCountry(c.id) === el.dataset.k).sort((a, b) => tierOf(a.id) - tierOf(b.id))[0];
    if (first) ctx.ui.worldComp = first.id;
    ctx.render();
  },
  'world-comp': (ctx, el) => { ctx.ui.worldComp = el.dataset.c; ctx.render(); },
  comp: (ctx, el) => { ctx.ui.compId = el.dataset.c; ctx.ui.round = undefined; ctx.render(); },
  'fx-view': (ctx, el) => { ctx.ui.fixturesView = el.dataset.v as 'mine' | 'round'; ctx.render(); },
  round: (ctx, el) => { ctx.ui.round = Number(el.dataset.r); ctx.render(); },
  report: (ctx, el) => ctx.go('report', { fixtureId: Number(el.dataset.id) }),
  'keep-cover': (ctx, el) => {
    const g = ctx.game;
    const p = g.players[Number(el.dataset.id)];
    if (!p?.cover) return;
    if (squadCount(userClub(g), g.players) >= MAX_SQUAD) { ctx.toast(`Your squad is full (${MAX_SQUAD} players): sell or release someone first.`); return; }
    keepCover(g, p);
    ctx.toast(`${fullName(p).trim()} stays with the first team.`);
    ctx.render();
  },
  'club-view': (ctx, el) => {
    const id = Number(el.dataset.id);
    if (id === ctx.game.userClubId) ctx.go('squad');
    else ctx.go('club', { clubId: id, clubTab: 'squad' });
  },
  'club-tab': (ctx, el) => { ctx.ui.clubTab = el.dataset.t as 'info'; ctx.render(); },
  'club-season': (ctx, el) => { ctx.ui.clubSeason = Number(el.dataset.s); ctx.render(); },
  nation: (ctx, el) => ctx.go('nation', { nation: el.dataset.n, nationTab: 'squad' }),
  'nation-tab': (ctx, el) => { ctx.ui.nationTab = el.dataset.t as 'squad'; ctx.render(); },
  'stats-tab': (ctx, el) => { ctx.ui.statsTab = el.dataset.t as 'goals'; ctx.render(); },
  confirm: (ctx, el) => { ctx.ui.confirm = el.dataset.key!; ctx.render(); },
  'confirm-cancel': (ctx) => { ctx.ui.confirm = null; ctx.render(); },
  'next-season': (ctx) => {
    startNewSeason(ctx.game);
    ctx.save();
    ctx.go('inbox', { newsId: undefined });
  },
};

/** Handlers for <select data-change="…"> controls. */
export const changeActions: Record<string, (ctx: Ctx, el: HTMLSelectElement) => void> = {
  formation: (ctx, el) => {
    const c = userClub(ctx.game);
    c.tactics.formation = el.value;
    // Re-pick for the new shape, keeping it as the manager's own selection if he had one.
    if (c.lineup) c.lineup = autoPickXI(c, ctx.game.players);
    ctx.ui.slot = null;
    ctx.save();
    ctx.render();
  },
  instruction: (ctx, el) => {
    const t = userClub(ctx.game).tactics as unknown as Record<string, unknown>;
    const v = el.value;
    t[el.dataset.key!] = v === 'true' ? true : v === 'false' ? false : v;
    ctx.save();
    ctx.toast('Team instructions updated');
  },
};
