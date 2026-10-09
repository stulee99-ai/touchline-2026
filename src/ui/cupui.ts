import { clubCupRuns, cupById, phaseTable, stageLabel } from '../engine/cups.js';
import { club, dayLabel, ordinal, seasonLabel, userClub } from '../engine/game.js';
import type { Cup, Fixture, GameState, MatchSummary, Tie } from '../engine/types.js';
import type { Action, Ctx } from './ctx.js';
import { esc } from './format.js';
import { clubLink, segs } from './screens.js';

/**
 * Cups and Europe: brackets, league-phase tables, and the small bits of cup information
 * other screens show (competition chips, legs and aggregates, penalty scores).
 */

const LEAGUE_SHORT: Record<string, string> = { ENG: 'Premier League', ESP: 'La Liga', GER: 'Bundesliga', ITA: 'Serie A', FRA: 'Ligue 1', POR: 'Liga Portugal' };

/** A competition's name as a link: a league to its table, a cup to its page, an international competition to its tables. */
export function compLink(g: GameState, id: string, label?: string, cls = ''): string {
  const name = label ?? (cupById(g, id)?.name ?? g.comps.find((c) => c.id === id)?.name ?? id);
  if (id === 'FRI') return esc(name);
  return `<button class="link comp-link${cls ? ` ${cls}` : ''}" data-act="comp-go" data-c="${esc(id)}" title="Open ${esc(name)}">${esc(name)}</button>`;
}

/** Short label on fixture lists for every game: league, cup, Europe or friendly. Clicking it opens the competition. */
export function compChip(g: GameState, f: Fixture): string {
  const cup = cupById(g, f.comp);
  if (!cup) {
    if (f.comp === 'FRI') return `<span class="chip comp comp-fri" title="Pre-season friendly">Friendly</span>`;
    const lg = g.comps.find((c) => c.id === f.comp);
    return lg ? `<button class="chip comp comp-lg" data-act="comp-go" data-c="${lg.id}" title="${esc(lg.name)} matchday ${f.round + 1}: open the table">${esc(LEAGUE_SHORT[lg.id] ?? lg.name)}</button>` : '';
  }
  const leg = f.leg ? ` ${f.leg === 1 ? '1st' : '2nd'} leg` : '';
  return `<button class="chip comp comp-${cup.kind === 'euro' ? cup.id.toLowerCase() : 'cup'}" data-act="comp-go" data-c="${cup.id}" title="${esc(stageLabel(g, f))}: open the competition">${esc(cup.short)}${leg}</button>`;
}

/** "1 - 1" with "aet" or the shoot-out score underneath. */
export function scoreHtml(r: MatchSummary): string {
  const extra = r.pens ? `<small class="pens">${r.pens[0]}-${r.pens[1]} pens</small>` : r.aet ? '<small class="pens">aet</small>' : '';
  return `${r.hg} - ${r.ag}${extra}`;
}

/** W/D/L from one club's point of view; a shoot-out decides the letter. */
export function resultLetter(r: MatchSummary, home: boolean): 'W' | 'D' | 'L' {
  const us = home ? r.hg : r.ag;
  const them = home ? r.ag : r.hg;
  if (us !== them) return us > them ? 'W' : 'L';
  if (r.pens) return (home ? r.pens[0] > r.pens[1] : r.pens[1] > r.pens[0]) ? 'W' : 'L';
  return 'D';
}

/** For a second leg: how the first leg finished, from the home side of this match. */
export function firstLegNote(g: GameState, f: Fixture): string {
  if (f.leg !== 2) return '';
  const cup = cupById(g, f.comp);
  const tie = cup?.ties.find((t) => t.id === f.tieId);
  const first = tie && g.fixtures.find((x) => x.id === tie.fixtureIds[0]);
  if (!first?.result) return '';
  return `First leg: ${club(g, first.homeId).name} ${first.result.hg}-${first.result.ag} ${club(g, first.awayId).name}`;
}

/** Where a club stands: league position, or its division for clubs outside the six leagues. */
export function standingText(g: GameState, clubId: number, pos: number | null, pts?: number): string {
  const c = club(g, clubId);
  if (c.external) return `${c.external.division}${c.external.country !== userClub(g).leagueId && c.external.division.indexOf(' ') < 0 ? ` (${c.external.country})` : ''}`;
  const lg = g.comps.find((x) => x.id === c.leagueId)?.name ?? '';
  const the = /^(Premier|Bundesliga|Primeira)/.test(lg) ? 'the ' : '';
  return pos ? `${ordinal(pos)} in ${the}${lg}${pts !== undefined ? ` · ${pts} pts` : ''}` : g.comps.find((x) => x.id === c.leagueId)?.name ?? '';
}

/* ───────────────────────── The Cups screen ───────────────────────── */

import { leagueCountry } from '../engine/pyramid.js';
const COUNTRY: Record<string, string> = { ENG: 'England', ESP: 'Spain', GER: 'Germany', ITA: 'Italy', FRA: 'France', POR: 'Portugal' };

/** Competitions in the order the manager cares about: his own first. */
function cupOrder(g: GameState): Cup[] {
  const me = userClub(g);
  const mine = new Set(clubCupRuns(g, me.id).map((x) => x.cup.id));
  const score = (c: Cup) => (mine.has(c.id) ? 0 : 10) + (c.kind === 'euro' ? 0 : c.country === leagueCountry(me.leagueId) ? 1 : 5);
  return [...g.cups].sort((a, b) => score(a) - score(b) || g.cups.indexOf(a) - g.cups.indexOf(b));
}

function tieScore(g: GameState, tie: Tie): { cells: string; note: string } {
  const fx = tie.fixtureIds.map((id) => g.fixtures.find((f) => f.id === id)!).filter(Boolean);
  if (!fx.length) return { cells: '<span class="vs">v</span>', note: '' };
  const btn = (f: Fixture, label: string) => (f.result ? `<button class="score-btn" data-act="report" data-id="${f.id}">${label}</button>` : '');
  if (fx.length === 1) {
    const f = fx[0];
    return { cells: f.result ? btn(f, scoreHtml(f.result)) : '<span class="vs">v</span>', note: f.result ? '' : `${dayLabel(g.season, f.day)} · ${f.time}` };
  }
  // Two legs: scores from the first-named club's point of view.
  const legs = fx.map((f) => {
    if (!f.result) return '';
    const home = f.homeId === tie.homeId;
    const a = home ? f.result.hg : f.result.ag;
    const b = home ? f.result.ag : f.result.hg;
    return btn(f, `${a}-${b}${f.result.pens ? '<small class="pens">p</small>' : f.result.aet ? '<small class="pens">aet</small>' : ''}`);
  });
  const played = fx.filter((f) => f.result);
  let note = '';
  if (played.length) {
    let x = 0;
    let y = 0;
    for (const f of played) {
      const home = f.homeId === tie.homeId;
      x += home ? f.result!.hg : f.result!.ag;
      y += home ? f.result!.ag : f.result!.hg;
    }
    note = `Agg ${x}-${y}`;
    const last = played[played.length - 1].result!;
    if (played.length === 2 && last.pens) note += `, ${Math.max(...last.pens)}-${Math.min(...last.pens)} pens`;
  }
  const next = fx.find((f) => !f.result);
  if (next) note += `${note ? ' · ' : ''}${next.leg === 1 ? '1st' : '2nd'} leg ${dayLabel(g.season, next.day)}`;
  return { cells: legs.filter(Boolean).join(' · ') || '<span class="vs">v</span>', note };
}

function slotName(g: GameState, cup: Cup, id: number | null, from?: number): string {
  if (id !== null) return '';
  const src = from !== undefined ? cup.ties.find((t) => t.id === from) : undefined;
  if (src && src.homeId !== null && src.awayId !== null) return `<span class="small-note">${esc(club(g, src.homeId).short)}/${esc(club(g, src.awayId).short)}</span>`;
  return '<span class="small-note">To be decided</span>';
}

function tieRows(g: GameState, cup: Cup, ties: Tie[]): string {
  return ties.map((t) => {
    const mine = t.homeId === g.userClubId || t.awayId === g.userClubId;
    const side = (id: number | null, from?: number) => {
      if (id === null) return slotName(g, cup, id, from);
      const link = clubLink(g, id, t.winnerId === id);
      const c = club(g, id);
      const lvl = c.external ? ` <span class="small-note div-note">${esc(c.external.division)}</span>` : '';
      return `${link}${lvl}`;
    };
    if (t.awayId === null && t.winnerId !== null) {
      return `<tr><td class="r">${side(t.homeId)}</td><td class="c"><span class="small-note">bye</span></td><td></td><td></td></tr>`;
    }
    const s = tieScore(g, t);
    return `<tr class="${mine ? 'mine' : ''}${t.winnerId !== null ? ' decided' : ''}"><td class="r">${side(t.homeId, t.fromHome)}</td><td class="c">${s.cells}</td><td>${side(t.awayId, t.fromAway)}</td><td class="note">${esc(s.note)}</td></tr>`;
  }).join('');
}

function roundBlock(g: GameState, cup: Cup, r: number): string {
  const round = cup.rounds[r];
  const ties = cup.ties.filter((t) => t.round === r);
  const when = round.days.map((d) => dayLabel(g.season, d)).join(' and ');
  const where = round.host === 'neutral' && round.venue ? ` · ${esc(round.venue)}` : '';
  const rule = round.days.length > 1 ? 'Two legs' : round.extraTime ? 'Extra time and penalties' : 'Straight to penalties if level';
  const head = `<div class="sub-head">${esc(round.name)} <span class="small-note">${esc(when)}${where} · ${rule}</span></div>`;
  if (!ties.length) {
    const joining = round.entrants.length ? ` ${round.entrants.length} club${round.entrants.length > 1 ? 's' : ''} join at this stage.` : '';
    return `${head}<p class="pad small-note">The draw is made when the previous round is complete.${joining}</p>`;
  }
  return `${head}<div class="scroll"><table class="grid fixtures ties"><tbody>${tieRows(g, cup, ties)}</tbody></table></div>`;
}

function euroPhase(ctx: Ctx, cup: Cup): string {
  const g = ctx.game;
  const t = phaseTable(g, cup);
  const zone = (i: number) => (i < 8 ? ' zone-cl' : i < 24 ? ' zone-eu' : '');
  const country = (id: number) => {
    const c = club(g, id);
    return c.external ? c.external.country : c.leagueId;
  };
  const rows = t.map((r, i) => `<tr class="${r.clubId === g.userClubId ? 'mine' : ''}${zone(i)}"><td class="n">${i + 1}</td><td>${clubLink(g, r.clubId)} <span class="small-note">${country(r.clubId)}</span></td>
    <td class="n">${r.p}</td><td class="n hide-xs">${r.w}</td><td class="n hide-xs">${r.d}</td><td class="n hide-xs">${r.l}</td><td class="n hide-sm">${r.gf}</td><td class="n hide-sm">${r.ga}</td><td class="n">${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="n pts">${r.pts}</td></tr>`).join('');
  const days = cup.phaseDays?.length ?? 8;
  let latest = 0;
  for (const f of g.fixtures) if (f.comp === cup.id && f.tieId === undefined && f.result && f.round > latest) latest = f.round;
  const md = Math.min(days - 1, Math.max(0, ctx.ui.cupMd ?? latest));
  const games = g.fixtures.filter((f) => f.comp === cup.id && f.tieId === undefined && f.round === md).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  const list = games.map((f) => {
    const mine = f.homeId === g.userClubId || f.awayId === g.userClubId;
    const score = f.result ? `<button class="score-btn" data-act="report" data-id="${f.id}">${f.result.hg} - ${f.result.ag}</button>` : '<span class="vs">v</span>';
    return `<tr class="${mine ? 'mine' : ''}"><td class="date">${esc(dayLabel(g.season, f.day))} <span class="ko">${f.time}</span></td><td class="r">${clubLink(g, f.homeId)}</td><td class="c">${score}</td><td>${clubLink(g, f.awayId)}</td></tr>`;
  }).join('');
  const nav = `<div class="round-nav"><button class="btn small" data-act="cup-md" data-r="${md - 1}" ${md <= 0 ? 'disabled' : ''}>◄ Prev</button><b>Matchday ${md + 1} of ${days}</b><button class="btn small" data-act="cup-md" data-r="${md + 1}" ${md >= days - 1 ? 'disabled' : ''}>Next ►</button></div>`;
  return `<div class="scroll"><table class="grid league"><thead><tr><th class="n">Pos</th><th>Team</th><th class="n">Pld</th><th class="n hide-xs">W</th><th class="n hide-xs">D</th><th class="n hide-xs">L</th><th class="n hide-sm">For</th><th class="n hide-sm">Ag</th><th class="n">GD</th><th class="n">Pts</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="pad small-note table-key"><span class="key cl"></span>Round of 16 <span class="key eu"></span>Knockout play-offs <i>(25th to 36th are out)</i></p>
    ${nav}<div class="scroll"><table class="grid fixtures"><tbody>${list}</tbody></table></div>`;
}

export function cupsScreen(ctx: Ctx): string {
  const g = ctx.game;
  const order = cupOrder(g);
  if (!order.length) {
    return `<section class="panel"><header class="strip"><h2>Cups &amp; Europe</h2></header><p class="pad">The cups start next season.</p></section>`;
  }
  const cup = order.find((c) => c.id === ctx.ui.cupId) ?? order[0];
  const tabs = `<div class="segs comp-tabs" role="tablist" aria-label="Competition">${order.map((c) => `<button class="seg${c.id === cup.id ? ' on' : ''}" data-act="cup" data-c="${c.id}" role="tab" aria-selected="${c.id === cup.id}">${esc(c.short)}</button>`).join('')}</div>`;
  const run = clubCupRuns(g, g.userClubId).find((x) => x.cup.id === cup.id);
  const status = run ? `<p class="pad cup-status${run.alive ? ' alive' : ''}"><b>${esc(userClub(g).name)}:</b> ${esc(run.status)}</p>` : '';
  const winner = cup.winnerId ? `<div class="season-hero cup-hero"><span>${esc(cup.name.toUpperCase())} WINNERS ${seasonLabel(g)}</span><strong><button class="link head-link" data-act="club-view" data-id="${cup.winnerId}">${esc(club(g, cup.winnerId).name)}</button></strong></div>` : '';
  let body = '';
  if (cup.kind === 'euro') {
    const view = ctx.ui.cupView ?? (cup.phaseDone ? 'ko' : 'phase');
    body = `<div class="pad-top">${segs([['phase', 'League phase'], ['ko', 'Knockouts']], view, 'cup-view', 'v')}</div>`;
    if (view === 'phase') body += euroPhase(ctx, cup);
    else body += cup.phaseDone ? cup.rounds.map((_, r) => roundBlock(g, cup, r)).join('') : `<p class="pad small-note">The knockouts begin in February. The top eight go straight into the round of 16; 9th to 24th meet in the play-offs, the seeded side at home in the second leg.</p>`;
  } else {
    // Rounds still to be drawn go in one line; drawn rounds are listed newest first.
    const drawn = cup.rounds.map((_, r) => r).filter((r) => cup.ties.some((t) => t.round === r));
    const later = cup.rounds.map((r, i) => ({ r, i })).filter((x) => !drawn.includes(x.i));
    const next = later.length ? `<p class="pad small-note still-to-come"><b>Still to come:</b> ${later.map((x) => `${esc(x.r.name)} (${esc(dayLabel(g.season, x.r.days[0]).replace(/ \d{4}$/, ''))}${x.r.venue ? `, ${esc(x.r.venue.split(',')[0])}` : ''})`).join(' · ')}</p>` : '';
    body = next + drawn.reverse().map((r) => roundBlock(g, cup, r)).join('');
  }
  return `<section class="panel"><header class="strip"><h2>${esc(cup.name)} <small>– ${seasonLabel(g)}</small></h2><span class="strip-meta">${cup.kind === 'euro' ? 'UEFA' : esc(COUNTRY[cup.country] ?? cup.country)}</span></header>
    <div class="pad-top">${tabs}</div>${status}${winner}${body}</section>`;
}

/** The club screen's cup section: this season's runs and the trophies won. */
export function clubCupsHtml(g: GameState, clubId: number): string {
  const c = club(g, clubId);
  const runs = clubCupRuns(g, clubId);
  const rows = runs.map((x) => `<tr><td><button class="link" data-act="cup-open" data-c="${x.cup.id}">${esc(x.cup.name)}</button></td><td class="${x.alive ? 'alive' : ''}">${esc(x.status)}</td></tr>`).join('');
  const honours = (c.honours ?? []).slice().reverse().map((h) => `<li>${esc(h.cup)} ${h.season}/${String((h.season + 1) % 100).padStart(2, '0')}</li>`).join('');
  return `<div class="sub-head">Cups this season</div>${rows ? `<div class="scroll"><table class="grid compact"><tbody>${rows}</tbody></table></div>` : '<p class="pad small-note">Not in any cup this season.</p>'}
    ${honours ? `<div class="sub-head">Trophies won</div><ul class="honours">${honours}</ul>` : ''}`;
}

export const cupActions: Record<string, Action> = {
  cup: (ctx, el) => { ctx.ui.cupId = el.dataset.c; ctx.ui.cupView = undefined; ctx.ui.cupMd = undefined; ctx.render(); },
  'cup-open': (ctx, el) => ctx.go('cups', { cupId: el.dataset.c, cupView: undefined, cupMd: undefined }),
  /** Any competition link: a league opens its table, a cup its page, an international competition its tables. */
  'comp-go': (ctx, el) => {
    const id = el.dataset.c!;
    if (cupById(ctx.game, id)) ctx.go('cups', { cupId: id, cupView: undefined, cupMd: undefined });
    else if (ctx.game.comps.some((c) => c.id === id)) ctx.go('table', { compId: id });
    else ctx.go('intl', { intlTab: 'tables', intlComp: id });
  },
  'cup-view': (ctx, el) => { ctx.ui.cupView = el.dataset.v as 'phase' | 'ko'; ctx.render(); },
  'cup-md': (ctx, el) => { ctx.ui.cupMd = Number(el.dataset.r); ctx.render(); },
};
