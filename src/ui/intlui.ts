import { dayLabel, seasonLabel, userClub } from '../engine/game.js';
import { AFCQ_GROUPS, ASIAN_CUP_DATES, ASIAN_CUP_GROUPS, CNL_GROUPS, CONFED, UNL_GROUPS } from '../engine/db/intl-2026.js';
import { seasonDay } from '../engine/calendar.js';

const calendarDay = (g: GameState, iso: string) => seasonDay(iso, g.season);
import { awayText, intlCompName, intlTable, koWinner, nationName, pickSquad, windows } from '../engine/intl.js';
import { club } from '../engine/game.js';
import type { GameState, IntlMatch } from '../engine/types.js';
import type { Action, Ctx } from './ctx.js';
import { esc, statusChips } from './format.js';
import { clubLink, panel, playerLink, posOrder, primaryPos, segs } from './screens.js';

/**
 * The Internationals screen: the manager's internationals (caps, goals, who's away),
 * fixtures and results by window, and the tables of the competitions they play in.
 */

/** International competitions that have tables to open (friendlies don't). */
const INTL_LINKABLE = (g: GameState, id: string) => id !== 'FR' && (['UNL', 'AC', 'AFCQ', 'CNL'].includes(id) || g.intl.comps.some((c) => c.id === id));

const flag = (code: string) => `<span class="nat-code">${esc(code)}</span>`;

function nationCell(g: GameState, code: string, bold = false): string {
  const mine = userClub(g).playerIds.some((id) => g.players[id]?.nation === code);
  return `<button class="link nat-link ${bold ? 'win ' : ''}${mine ? 'mine-nat' : ''}" data-act="nation" data-n="${esc(code)}" title="${esc(nationName(code))}">${flag(code)} <span class="nat-name">${esc(nationName(code))}</span></button>`;
}

/* ───────────────────────── Your players ───────────────────────── */

function playersTab(ctx: Ctx): string {
  const g = ctx.game;
  const c = userClub(g);
  const list = c.playerIds.map((id) => g.players[id]).filter((p) => (p.intl?.caps ?? 0) > 0 || p.stats.intlApps || p.away)
    .sort((a, b) => (b.stats.intlApps ?? 0) - (a.stats.intlApps ?? 0) || (b.intl?.caps ?? 0) - (a.intl?.caps ?? 0));
  const rows = list.map((p) => `<tr class="${p.away ? 'away' : ''}"><td>${playerLink(p)}</td><td>${nationCell(g, p.nation)}</td>
    <td class="n">${p.intl?.caps ?? 0}</td><td class="n hide-xs">${p.intl?.goals ?? 0}</td><td class="n">${p.stats.intlApps ?? 0}</td><td class="n">${p.stats.intlGoals ?? 0}</td>
    <td class="small-note">${p.away ? esc(awayText(g, p)) : p.injury ? 'Injured' : 'At the club'}</td></tr>`).join('');
  // What's coming: the next window and how many of the squad are likely to go.
  const ws = windows(g.season).slice(0, 3);
  const next = ws.find((w) => w.to >= g.day);
  const acDay = calendarDay(g, ASIAN_CUP_DATES.callup);
  const asian = g.season === 2026 && g.day < calendarDay(g, ASIAN_CUP_DATES.final) ? c.playerIds.map((id) => g.players[id]).filter((p) => Object.values(ASIAN_CUP_GROUPS).flat().includes(p.nation)) : [];
  const nextNote = next
    ? `<p class="pad small-note"><b>Next international window:</b> ${dayLabel(g.season, next.from)} to ${dayLabel(g.season, next.to)}. Squads are named six days before; your internationals leave for the whole window and come back tired (more so after long trips outside Europe), sometimes injured. There are no league games in the window.</p>`
    : '<p class="pad small-note">No more international windows this season (the June games are played after the club season).</p>';
  const acNote = asian.length
    ? `<p class="pad small-note warn-note"><b>Asian Cup, Saudi Arabia (${dayLabel(g.season, calendarDay(g, '2027-01-07'))} to ${dayLabel(g.season, calendarDay(g, ASIAN_CUP_DATES.final))}):</b> ${asian.map((p) => `${esc(p.lastName)} (${esc(nationName(p.nation))})`).join(', ')} may be called up on ${dayLabel(g.season, acDay)} and miss club games until their country is knocked out.</p>`
    : '';
  return `${nextNote}${acNote}${rows ? `<div class="scroll"><table class="grid"><thead><tr><th>Player</th><th>Nation</th><th class="n" title="Caps (estimated before 2026/27)">Caps</th><th class="n hide-xs">Goals</th><th class="n">${seasonLabel(g)}</th><th class="n">Gls</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="pad">None of your players has been capped.</p>'}
    <p class="pad small-note">Caps and goals before 2026/27 are estimates (there's no complete public record for every player); everything from here on is played in the game.</p>`;
}

/* ───────────────────────── National squads ───────────────────────── */

/** Nations with players in the game, the manager's own players' nations first. */
function squadNations(g: GameState): string[] {
  const count = new Map<string, number>();
  for (const p of Object.values(g.players)) if (p.clubId !== null) count.set(p.nation, (count.get(p.nation) ?? 0) + 1);
  const named = new Set(Object.keys(g.intl.squads));
  return [...count.keys()].filter((n) => named.has(n) || (count.get(n) ?? 0) >= 3).sort((a, b) => nationName(a).localeCompare(nationName(b)));
}

/** A nation's latest squad (or its likely picks before one is named), with a note on its status. */
function squadHtml(g: GameState, cur: string): string {
  const I = g.intl;
  const c = userClub(g);
  const ids = I.squads[cur];
  const named = !!ids?.length;
  const players = (named ? ids.map((id) => g.players[id]).filter(Boolean) : pickSquad(g, cur));
  players.sort((a, b) => posOrder(a) - posOrder(b) || b.ca - a.ca);
  const away = players.filter((p) => p.away?.nation === cur).length;
  const status = named
    ? away ? `${away} of the squad are with ${esc(nationName(cur))} now.` : 'The latest squad named. They are back with their clubs.'
    : 'No squad named yet this season: these are the players most likely to be picked if it were named today.';
  const next = windows(g.season).slice(0, 3).find((w) => w.to >= g.day);
  const nextLine = next ? ` The next squads are named on ${dayLabel(g.season, next.from - 6)}.` : '';
  const rows = players.map((p) => {
    const cl = p.clubId ? club(g, p.clubId) : null;
    const mine = p.clubId === c.id;
    const where = p.away?.nation === cur ? 'With the squad' : p.injury ? 'Injured' : 'At his club';
    return `<tr class="${mine ? 'mine' : ''}"><td class="slot">${primaryPos(p)}</td><td>${playerLink(p)} ${statusChips(p)}</td><td class="hide-xs">${cl ? clubLink(g, cl.id) : ''}</td><td class="n">${p.age}</td><td class="n">${p.intl?.caps ?? 0}</td><td class="n hide-xs">${p.intl?.goals ?? 0}</td><td class="small-note hide-sm">${where}</td></tr>`;
  }).join('');
  return `<p class="pad small-note"><b>${esc(nationName(cur))}${named ? ` · ${players.length} players` : ' · likely squad'}.</b> ${status}${nextLine} Only players at clubs in the game are shown${named && players.length < 23 ? '; the rest of the squad play elsewhere' : ''}. Your players are highlighted.</p>
    <div class="scroll"><table class="grid compact intl-squad"><thead><tr><th>Pos</th><th>Player</th><th class="hide-xs">Club</th><th class="n">Age</th><th class="n" title="Caps">Caps</th><th class="n hide-xs">Goals</th><th class="hide-sm">Now</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="pad">Nobody from the clubs in the game.</td></tr>'}</tbody></table></div>`;
}

function squadsTab(ctx: Ctx): string {
  const g = ctx.game;
  const I = g.intl;
  const c = userClub(g);
  const nations = squadNations(g);
  const mineNat = [...new Set(c.playerIds.map((id) => g.players[id]?.nation).filter(Boolean))] as string[];
  const quick = mineNat.filter((n) => nations.includes(n)).sort((a, b) => (I.squads[b]?.length ? 1 : 0) - (I.squads[a]?.length ? 1 : 0) || nationName(a).localeCompare(nationName(b)));
  const cur = ctx.ui.intlNation && nations.includes(ctx.ui.intlNation) ? ctx.ui.intlNation : quick[0] ?? (nations.includes('ENG') ? 'ENG' : nations[0]);
  if (!cur) return '<p class="pad">No national squads to show.</p>';
  const chips = quick.length ? `<div class="segs small nat-quick">${quick.map((n) => `<button class="seg${n === cur ? ' on' : ''}" data-act="intl-nation" data-n="${n}">${esc(nationName(n))}</button>`).join('')}</div>` : '';
  const select = `<label class="nat-pick">Nation <select class="cm" data-change="intl-nation">${nations.map((n) => `<option value="${n}"${n === cur ? ' selected' : ''}>${esc(nationName(n))}</option>`).join('')}</select></label>`;
  return `<div class="pad-top">${select}${chips}<button class="btn small" data-act="nation" data-n="${cur}">Team page ►</button></div>${squadHtml(g, cur)}`;
}

/* ───────────────────────── A national team's page ───────────────────────── */

const CONFED_NAME: Record<string, string> = { UEFA: 'UEFA (Europe)', CAF: 'CAF (Africa)', AFC: 'AFC (Asia)', CONCACAF: 'CONCACAF (North and Central America)', CONMEBOL: 'CONMEBOL (South America)', OFC: 'OFC (Oceania)' };

/** The groups a nation plays in this season, as tables. */
function nationGroups(g: GameState, code: string): string {
  const I = g.intl;
  const out: string[] = [];
  for (const [gname, teams] of Object.entries(UNL_GROUPS)) if (teams.includes(code)) out.push(groupTable(g, 'UNL', gname, teams, `Nations League ${gname}`, gname.startsWith('A') ? 2 : 1));
  for (const comp of I.comps) for (const gr of comp.groups) if (gr.teams.includes(code)) out.push(groupTable(g, comp.id, gr.name || undefined, gr.teams, `${comp.name}${gr.name ? `, group ${gr.name}` : ''}`, 1));
  if (I.matches.some((m) => m.comp === 'AC')) for (const [gname, teams] of Object.entries(ASIAN_CUP_GROUPS)) if (teams.includes(code)) out.push(groupTable(g, 'AC', gname, teams, `Asian Cup, group ${gname}`));
  if (I.matches.some((m) => m.comp === 'AFCQ')) for (const [gname, teams] of Object.entries(AFCQ_GROUPS)) if (teams.includes(code)) out.push(groupTable(g, 'AFCQ', gname, teams, `AFCON qualifying, group ${gname}`));
  if (I.matches.some((m) => m.comp === 'CNL')) for (const [gname, teams] of Object.entries(CNL_GROUPS)) if (teams.includes(code)) out.push(groupTable(g, 'CNL', gname, teams, `CONCACAF Nations League ${gname}`, gname.startsWith('A') ? 2 : 1));
  return out.length ? `<div class="intl-groups">${out.join('')}</div>` : '';
}

export function nationScreen(ctx: Ctx): string {
  const g = ctx.game;
  const I = g.intl;
  const code = ctx.ui.nation ?? 'ENG';
  const tab = ctx.ui.nationTab ?? 'squad';
  const games = I.matches.filter((m) => m.home === code || m.away === code).sort((a, b) => a.day - b.day);
  const played = games.filter((m) => m.result);
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const m of played) {
    const r = m.result!;
    const [us, them] = m.home === code ? [r.hg, r.ag] : [r.ag, r.hg];
    gf += us; ga += them;
    const won = m.ko && m.leg !== 1 ? koWinner(I, m) === code : null;
    if (won === true || (won === null && us > them)) w++;
    else if (won === false || us < them) l++;
    else d++;
  }
  const ranked = Object.entries(I.elo).sort((a, b) => b[1] - a[1]);
  const rank = ranked.findIndex(([n]) => n === code) + 1;
  const inGame = Object.values(g.players).filter((p) => p.nation === code && p.clubId !== null).length;
  const next = games.find((m) => !m.result);
  const mine = new Set(userClub(g).playerIds);
  const facts = `<div class="club-grid"><dl class="facts">
      <div><dt>Confederation</dt><dd>${esc(CONFED_NAME[CONFED[code] ?? ''] ?? CONFED[code] ?? '-')}</dd></div>
      <div><dt>Rating</dt><dd>${Math.round(I.elo[code] ?? 0)}${rank ? ` (${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} in the world)` : ''}</dd></div>
      <div><dt>${seasonLabel(g)}</dt><dd>${played.length ? `P${played.length} W${w} D${d} L${l} · ${gf}-${ga}` : 'No games yet'}</dd></div>
      <div><dt>Next game</dt><dd>${next ? `${esc(dayLabel(g.season, next.day))} v ${esc(nationName(next.home === code ? next.away : next.home))}` : 'None arranged'}</dd></div>
      <div><dt>Players in the game</dt><dd>${inGame}</dd></div>
    </dl></div>`;
  const tabs = segs([['squad', 'Squad'], ['fixtures', 'Fixtures & results']], tab, 'nation-tab', 't');
  const body = tab === 'fixtures'
    ? `${games.length ? `<div class="scroll"><table class="grid fixtures intl"><tbody>${games.map((m) => matchRow(g, m, mine)).join('')}</tbody></table></div>` : '<p class="pad small-note">No games arranged yet this season. Friendlies and knockout ties are arranged nearer the time.</p>'}${nationGroups(g, code)}`
    : squadHtml(g, code);
  return `<section class="panel"><header class="strip nation-strip"><h2>${flag(code)} ${esc(nationName(code))} <small>– National team</small></h2><button class="btn small" data-act="back">◄ Back</button></header>
    ${facts}<div class="pad-top">${tabs}</div>${body}</section>`;
}

/* ───────────────────────── Fixtures ───────────────────────── */

function matchRow(g: GameState, m: IntlMatch, mine: Set<number>): string {
  const r = m.result;
  const winner = r && m.ko && m.leg !== 1 ? koWinner(g.intl, m) : r ? (r.hg > r.ag ? m.home : r.hg < r.ag ? m.away : null) : null;
  const score = r ? `${r.hg} - ${r.ag}${r.pens ? `<small class="pens">${r.pens[0]}-${r.pens[1]} pens</small>` : r.aet ? '<small class="pens">aet</small>' : ''}` : '<span class="vs">v</span>';
  const ours = r ? r.scorers.filter(([id]) => mine.has(id)).map(([id]) => g.players[id]?.lastName).filter(Boolean) : [];
  const comp = `${intlCompName(g, m.comp)}${m.group ? ` ${m.comp === 'UNL' ? m.group : `Group ${m.group}`}` : ''}${m.stage ? `, ${m.stage.toLowerCase()}${m.leg ? ` (leg ${m.leg})` : ''}` : ''}`;
  const involved = [m.home, m.away].some((n) => userClub(g).playerIds.some((id) => g.players[id]?.nation === n));
  const date = new Date(Date.UTC(g.season, 7, 1 + m.day)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `<tr class="${involved ? 'mine' : ''}"><td class="date">${esc(date)}</td><td class="r">${nationCell(g, m.home, winner === m.home)}</td><td class="c"><span class="score-btn static">${score}</span></td><td>${nationCell(g, m.away, winner === m.away)}</td>
    <td class="note"><span class="comp-name">${INTL_LINKABLE(g, m.comp) ? `<button class="link comp-link" data-act="comp-go" data-c="${esc(m.comp)}">${esc(comp)}</button>` : esc(comp)}</span>${ours.length ? `<b class="scorers-note">⚽ ${esc(ours.join(', '))}</b>` : ''}</td></tr>`;
}

function fixturesTab(ctx: Ctx): string {
  const g = ctx.game;
  const I = g.intl;
  const ws = windows(g.season);
  const periods: [string, string, number, number][] = [
    ['w0', 'Sep–Oct', ws[0].from, ws[0].to], ['w1', 'November', ws[1].from, ws[1].to],
    ...(g.season === 2026 ? [['ac', 'Asian Cup', calendarDay(g, '2027-01-07'), calendarDay(g, ASIAN_CUP_DATES.final)] as [string, string, number, number]] : []),
    ['w2', 'March', ws[2].from, ws[2].to], ['w3', 'June', ws[3].from, ws[3].to],
  ];
  const cur = periods.find((p) => p[0] === ctx.ui.intlWin) ?? periods.find((p) => p[3] >= g.day) ?? periods[0];
  const all = !!ctx.ui.intlAll;
  const ourNations = new Set(userClub(g).playerIds.map((id) => g.players[id].nation));
  const mine = new Set(userClub(g).playerIds);
  const list = I.matches.filter((m) => m.day >= cur[2] && m.day <= cur[3] && (cur[0] !== 'ac' || m.comp === 'AC'))
    .filter((m) => all || ourNations.has(m.home) || ourNations.has(m.away))
    .sort((a, b) => a.day - b.day || a.comp.localeCompare(b.comp));
  const tabs = segs(periods.map((p) => [p[0], p[1]] as [string, string]), cur[0], 'intl-win', 'w');
  const toggle = `<label class="check"><input type="checkbox" data-act="intl-all" ${all ? 'checked' : ''}> Show every game, not just nations with your players</label>`;
  const empty = cur[0] === 'w3' && !list.length ? 'The June games are played after the club season ends.' : 'No games yet for this window. Friendlies and knockout ties are arranged nearer the time.';
  return `<div class="pad-top">${tabs}</div><div class="pad-top">${toggle}</div>
    ${list.length ? `<div class="scroll"><table class="grid fixtures intl"><tbody>${list.map((m) => matchRow(g, m, mine)).join('')}</tbody></table></div>` : `<p class="pad small-note">${empty}</p>`}`;
}

/* ───────────────────────── Tables ───────────────────────── */

function groupTable(g: GameState, comp: string, group: string | undefined, teams: string[], title: string, marks = 2): string {
  const t = intlTable(g, comp, group, teams);
  const rows = t.map((r, i) => `<tr class="${i < marks ? 'zone-cl' : ''}"><td class="n">${i + 1}</td><td>${nationCell(g, r.nation)}</td><td class="n">${r.p}</td><td class="n hide-xs">${r.w}</td><td class="n hide-xs">${r.d}</td><td class="n hide-xs">${r.l}</td><td class="n">${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td class="n pts">${r.pts}</td></tr>`).join('');
  return `<div class="intl-group"><div class="sub-head">${esc(title)}</div><table class="grid compact league"><thead><tr><th class="n">#</th><th>Team</th><th class="n">P</th><th class="n hide-xs">W</th><th class="n hide-xs">D</th><th class="n hide-xs">L</th><th class="n">GD</th><th class="n">Pts</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function knockouts(g: GameState, comp: string): string {
  const ko = g.intl.matches.filter((m) => m.comp === comp && m.ko).sort((a, b) => a.day - b.day);
  if (!ko.length) return '';
  const mine = new Set(userClub(g).playerIds);
  const stages = [...new Set(ko.map((m) => m.stage ?? ''))];
  return stages.map((s) => `<div class="sub-head">${esc(s)}</div><div class="scroll"><table class="grid fixtures intl"><tbody>${ko.filter((m) => m.stage === s).map((m) => matchRow(g, m, mine)).join('')}</tbody></table></div>`).join('');
}

function tablesTab(ctx: Ctx): string {
  const g = ctx.game;
  const I = g.intl;
  const comps: [string, string][] = [];
  const has = (id: string) => I.matches.some((m) => m.comp === id);
  if (has('UNL')) comps.push(['UNL', 'Nations League']);
  for (const c of I.comps) comps.push([c.id, c.name.replace(' qualifying', ' qual.')]);
  if (has('AC')) comps.push(['AC', 'Asian Cup']);
  if (has('AFCQ')) comps.push(['AFCQ', 'AFCON qual.']);
  if (has('CNL')) comps.push(['CNL', 'CONCACAF NL']);
  const cur = comps.find((c) => c[0] === ctx.ui.intlComp)?.[0] ?? comps[0]?.[0];
  if (!cur) return '<p class="pad">No international competitions this season.</p>';
  const tabs = `<div class="segs comp-tabs">${comps.map(([id, label]) => `<button class="seg${id === cur ? ' on' : ''}" data-act="intl-comp" data-c="${id}">${esc(label)}</button>`).join('')}</div>`;
  let body = '';
  if (cur === 'UNL') {
    body = Object.entries(UNL_GROUPS).map(([gname, teams]) => groupTable(g, 'UNL', gname, teams, `League ${gname[0]}, Group ${gname}`, gname.startsWith('A') ? 2 : 1)).join('');
    body = `<div class="intl-groups">${body}</div>${knockouts(g, 'UNL')}`;
  } else if (cur === 'AC') {
    body = `<div class="intl-groups">${Object.entries(ASIAN_CUP_GROUPS).map(([gname, teams]) => groupTable(g, 'AC', gname, teams, `Group ${gname}`)).join('')}</div>${knockouts(g, 'AC')}`;
  } else if (cur === 'AFCQ') {
    body = `<div class="intl-groups">${Object.entries(AFCQ_GROUPS).map(([gname, teams]) => groupTable(g, 'AFCQ', gname, teams, `Group ${gname}`)).join('')}</div>`;
  } else if (cur === 'CNL') {
    body = `<div class="intl-groups">${Object.entries(CNL_GROUPS).map(([gname, teams]) => groupTable(g, 'CNL', gname, teams, gname.startsWith('A') ? `League A, Group ${gname[1]}` : `League B, Group ${gname[1]}`, gname.startsWith('A') ? 2 : 1)).join('')}</div>${knockouts(g, 'CNL')}`;
  } else {
    const comp = I.comps.find((c) => c.id === cur)!;
    body = `<div class="intl-groups">${comp.groups.map((gr) => groupTable(g, comp.id, gr.name || undefined, gr.teams, gr.name ? `Group ${gr.name}` : comp.name, 1)).join('')}</div>`;
  }
  const won = I.winners.slice().reverse().map((w) => `<li>${esc(intlCompName(g, w.comp))} ${w.season}/${String((w.season + 1) % 100).padStart(2, '0')}: <b>${esc(nationName(w.nation))}</b></li>`).join('');
  return `<div class="pad-top">${tabs}</div>${won ? `<ul class="honours intl-winners">${won}</ul>` : ''}${body}`;
}

export function intlScreen(ctx: Ctx): string {
  const tab = ctx.ui.intlTab ?? 'players';
  const tabs = segs([['players', 'Your internationals'], ['squads', 'Squads'], ['fixtures', 'Fixtures & results'], ['tables', 'Competitions']], tab, 'intl-tab', 't');
  const body = tab === 'fixtures' ? fixturesTab(ctx) : tab === 'tables' ? tablesTab(ctx) : tab === 'squads' ? squadsTab(ctx) : playersTab(ctx);
  return panel(userClub(ctx.game), 'Internationals', `<div class="pad-top">${tabs}</div>${body}`);
}

export const intlActions: Record<string, Action> = {
  'intl-tab': (ctx, el) => { ctx.ui.intlTab = el.dataset.t as 'players'; ctx.render(); },
  'intl-win': (ctx, el) => { ctx.ui.intlWin = el.dataset.w; ctx.render(); },
  'intl-comp': (ctx, el) => { ctx.ui.intlComp = el.dataset.c; ctx.render(); },
  'intl-all': (ctx) => { ctx.ui.intlAll = !ctx.ui.intlAll; ctx.render(); },
  'intl-nation': (ctx, el) => { ctx.ui.intlNation = el.dataset.n; ctx.render(); },
};

export const intlChangeActions: Record<string, (ctx: Ctx, el: HTMLSelectElement) => void> = {
  'intl-nation': (ctx, el) => { ctx.ui.intlNation = el.value; ctx.render(); },
};

