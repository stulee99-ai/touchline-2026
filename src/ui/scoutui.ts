import { fmtMoney, fmtWage } from '../engine/finance.js';
import { club, userClub } from '../engine/game.js';
import {
  assign, assignmentLabel, assignmentPlan, cancelAssignment, currentAssignment, estimatedCA, estimatedPA, fireScout, hireScout,
  knowledge, LEAGUE_NAMES, maxScouts, toggleShortlist, VERDICT_WORD,
} from '../engine/scouting.js';
import { valueOf } from '../engine/transfers.js';
import type { AttrKey, GameState, Player, Scout, ScoutReport } from '../engine/types.js';
import type { Action, Ctx } from './ctx.js';
import { abilityWord, attrClass, esc, fullName, pos, potentialWord, starBar } from './format.js';
import { clubLink, dateOf, panel, playerLink, segs } from './screens.js';
import { attrRange } from '../engine/scouting.js';
import { budgetPanel } from './market.js';

/**
 * Scouting in the interface: estimated ability for other clubs' players, attribute ranges,
 * scout reports on the player page, and the Scouting screen (staff, assignments, reports,
 * shortlist, hiring).
 */

/** Ability stars: exact for your own players, an estimate (dimmed) for everyone else. */
export function abilityStars(g: GameState, p: Player): string {
  const k = knowledge(g, p);
  if (k >= 100) return starBar(p.ca);
  const est = estimatedCA(g, p);
  const r = g.scouting?.reports[p.id];
  return `<span class="est${r ? ' scouted' : ''}" title="${r ? `Scout's estimate (${esc(r.scoutName)})` : `Estimate: you know ${k}% about him. Send a scout for a better picture.`}">${starBar(est, 'Estimated ability')}</span>`;
}

/** An attribute value, or a range when the player isn't well known. */
export function attrCell(g: GameState, p: Player, k: AttrKey): string {
  const [lo, hi] = attrRange(g, p, k);
  if (lo === hi) return `<dd class="${attrClass(lo)}">${lo}</dd>`;
  return `<dd class="${attrClass(Math.round((lo + hi) / 2))} range" title="Somewhere between ${lo} and ${hi}">${lo}-${hi}</dd>`;
}

export function scoutWords(g: GameState, p: Player): { ability: string; potential: string } {
  if (knowledge(g, p) >= 100) return { ability: abilityWord(p.ca), potential: potentialWord(p) };
  const ca = estimatedCA(g, p);
  const pa = estimatedPA(g, p);
  return {
    ability: `${abilityWord(ca)}${g.scouting?.reports[p.id] ? '' : '?'}`,
    potential: pa === null ? 'Unknown' : potentialWord({ ca, pa, age: p.age }),
  };
}

function reportBlock(g: GameState, r: ScoutReport): string {
  const age = g.season - r.season === 0 ? dateOf(r.season, r.day) : `last season (${dateOf(r.season, r.day)})`;
  return `<div class="report-card verdict-${r.verdict}"><div class="report-head"><b>Scout report</b> <span class="small-note">${esc(r.scoutName)} · ${esc(age)}</span></div>
    <p class="verdict">${esc(VERDICT_WORD[r.verdict])}</p>
    <dl class="facts"><div><dt>Ability</dt><dd>${starBar(r.estCA, 'Scout: ability')}</dd></div><div><dt>Potential</dt><dd>${starBar(r.estPA, 'Scout: potential')}</dd></div></dl>
    ${r.notes.length ? `<ul class="report-notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>`;
}

function scoutOptions(g: GameState, kind: 'player' | 'club' | 'league', target: number | string): string {
  return g.scouting.scouts.map((s) => {
    const busy = currentAssignment(g, s.id);
    const plan = assignmentPlan(g, s, kind, target);
    return `<option value="${s.id}"${busy ? ' disabled' : ''}>${esc(s.name)} (${s.judgeAbility}/${s.judgePotential}${s.speciality ? `, ${s.speciality}` : ''})${busy ? ' - busy' : ` - ${plan.days} days, ${fmtMoney(plan.cost)}`}</option>`;
  }).join('');
}

/** The scouting box on another club's player: what you know, the latest report, and actions. */
export function playerScoutPanel(ctx: Ctx, p: Player): string {
  const g = ctx.game;
  if (!g.scouting || knowledge(g, p) >= 100) return '';
  const k = knowledge(g, p);
  const r = g.scouting.reports[p.id];
  const watching = g.scouting.assignments.find((a) => a.kind === 'player' && Number(a.target) === p.id);
  const listed = g.scouting.shortlist.includes(p.id);
  const action = watching
    ? `<p class="small-note">${esc(g.scouting.scouts.find((s) => s.id === watching.scoutId)?.name ?? 'A scout')} is watching him; report due ${esc(dateOf(g.season, watching.endDay))}.</p>`
    : `<div class="deal-form"><label>Scout <select class="cm" id="scout-pick">${scoutOptions(g, 'player', p.id)}</select></label><button class="btn" data-act="scout-player" data-id="${p.id}">Send scout</button></div>`;
  return `<div class="scout-box"><div class="know"><span>What you know about him</span><span class="meter"><i style="width:${k}%" class="${k < 40 ? 'warn' : ''}"></i></span><b>${k}%</b></div>
    ${r ? reportBlock(g, r) : '<p class="small-note">No scout report yet. Attributes are shown as ranges; send a scout to sharpen them and judge his potential.</p>'}
    ${action}
    <div class="row-btns"><button class="btn${listed ? ' on' : ''}" data-act="shortlist" data-id="${p.id}">${listed ? 'On your shortlist ✓' : 'Add to shortlist'}</button></div></div>`;
}

/* ───────────────────────── Scouting screen ───────────────────────── */

function scoutRow(g: GameState, s: Scout, mine: boolean): string {
  const a = mine ? currentAssignment(g, s.id) : undefined;
  const status = a
    ? `${esc(assignmentLabel(g, a))} · back ${esc(dateOf(g.season, a.endDay))} <button class="btn tiny" data-act="scout-cancel" data-id="${a.id}" title="Call him back (travel isn't refunded)">×</button>`
    : mine ? '<span class="chip on">Available</span>' : '';
  const act = mine
    ? `<button class="btn small ghost" data-act="confirm" data-key="fire-${s.id}">Let go…</button>`
    : `<button class="btn small primary" data-act="scout-hire" data-id="${s.id}">Hire</button>`;
  return `<tr><td><b>${esc(s.name)}</b> <span class="small-note">${s.nation}, ${s.age}</span></td><td class="n">${s.judgeAbility}</td><td class="n">${s.judgePotential}</td><td>${esc(LEAGUE_NAMES[s.speciality] ?? s.speciality)}</td><td class="n">${fmtWage(s.wage)}</td>${mine ? `<td>${status}</td>` : ''}<td class="r">${act}</td></tr>`;
}

function staffTab(ctx: Ctx): string {
  const g = ctx.game;
  const me = userClub(g);
  const sc = g.scouting;
  const confirm = sc.scouts.find((s) => ctx.ui.confirm === `fire-${s.id}`);
  const rows = sc.scouts.map((s) => scoutRow(g, s, true)).join('');
  const free = sc.scouts.filter((s) => !currentAssignment(g, s.id));
  const scoutSel = `<select class="cm" id="as-scout">${free.map((s) => `<option value="${s.id}">${esc(s.name)} (knows ${esc(LEAGUE_NAMES[s.speciality] ?? s.speciality)})</option>`).join('')}</select>`;
  const leagueSel = `<select class="cm" id="as-league">${g.comps.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`;
  const clubSel = `<select class="cm" id="as-club">${g.comps.map((c) => `<optgroup label="${esc(c.name)}">${c.clubIds.filter((id) => id !== me.id).map((id) => `<option value="${id}">${esc(club(g, id).name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  const focusSel = `<select class="cm" id="as-focus"><option value="best">Best players</option><option value="young">Young talent (21 and under)</option><option value="value">Players you could afford</option></select>`;
  const forms = free.length
    ? `<div class="assign-forms">
        <div class="deal-form"><b>Tour a league</b> <span class="small-note">About five weeks; reports on the players he rates most.</span>${scoutSel.replace('id="as-scout"', 'id="as-scout-l"')}${leagueSel}${focusSel}<button class="btn primary" data-act="scout-league">Send</button></div>
        <div class="deal-form"><b>Watch a club</b> <span class="small-note">About two weeks; sharper knowledge of their whole squad and reports on their best players.</span>${scoutSel.replace('id="as-scout"', 'id="as-scout-c"')}${clubSel}<button class="btn primary" data-act="scout-club">Send</button></div>
        <p class="small-note">To watch one player, open his profile and send a scout from there, or scout your shortlist.</p></div>`
    : '<p class="pad small-note">All your scouts are out on assignments.</p>';
  return `<div class="money-strip"><span>Scouting budget left <b>${fmtMoney(me.finance.scoutBudget ?? 0)}</b></span><span>Transfer budget <b>${fmtMoney(me.finance.transferBudget)}</b></span><span>Scouts <b>${sc.scouts.length}</b>/${maxScouts(me)}</span><span>Staff wages <b>${fmtWage(sc.scouts.reduce((s, x) => s + x.wage, 0))}</b></span></div>
    ${budgetPanel(ctx, 'scout')}
    <div class="scroll"><table class="grid compact"><thead><tr><th>Scout</th><th class="n" title="Judging ability">Ability</th><th class="n" title="Judging potential">Potential</th><th>Knows best</th><th class="n">Wage</th><th>Now</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    ${confirm ? `<div class="confirm" style="margin:8px 10px">Let ${esc(confirm.name)} go? It costs a month's wages (${fmtMoney(confirm.wage * 4)}). <button class="btn danger" data-act="scout-fire" data-id="${confirm.id}">Let him go</button> <button class="btn" data-act="confirm-cancel">Keep him</button></div>` : ''}
    ${forms}
    <p class="pad small-note">Judgement runs 1-20: a good judge of ability gets current ability right, a good judge of potential sees what youngsters will become. Scouts are quicker and sharper in the league they know best, and trips abroad take longer and cost more. Travel comes out of the scouting budget: the board set it each summer, and you can top it up from the transfer budget (or move what's left back). Wages come out of club funds.</p>`;
}

function reportsTab(ctx: Ctx): string {
  const g = ctx.game;
  const verdictOrder = { sign: 0, consider: 1, future: 2, squad: 3, no: 4 } as const;
  const reports = Object.values(g.scouting.reports).filter((r) => g.players[r.playerId]).sort((a, b) => verdictOrder[a.verdict] - verdictOrder[b.verdict] || b.estCA - a.estCA);
  const rows = reports.map((r) => {
    const p = g.players[r.playerId];
    return `<tr><td>${playerLink(p)}</td><td class="n">${p.age}</td><td class="hide-xs">${esc(pos(p))}</td><td class="hide-sm">${p.clubId ? clubLink(g, p.clubId) : '<i>Free agent</i>'}</td><td>${starBar(r.estCA, 'Scout: ability')}</td><td>${starBar(r.estPA, 'Scout: potential')}</td><td class="n money">${fmtMoney(valueOf(g, p))}</td><td><span class="chip verdict-${r.verdict}">${r.verdict === 'sign' ? 'Sign' : r.verdict === 'consider' ? 'Consider' : r.verdict === 'future' ? 'Future' : r.verdict === 'squad' ? 'Squad' : 'No'}</span></td><td class="hide-sm small-note">${esc(r.scoutName)}</td></tr>`;
  }).join('');
  return rows
    ? `<p class="pad small-note">Your scouts' latest reports, best recommendations first. Their star ratings are their judgement, not the truth.</p><div class="scroll"><table class="grid market"><thead><tr><th>Name</th><th class="n">Age</th><th class="hide-xs">Position</th><th class="hide-sm">Club</th><th>Ability</th><th>Potential</th><th class="n">Value</th><th>Verdict</th><th class="hide-sm">Scout</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="pad">No reports yet. Send a scout to watch a player, a club or a league.</p>';
}

function shortlistTab(ctx: Ctx): string {
  const g = ctx.game;
  const list = g.scouting.shortlist.map((id) => g.players[id]).filter(Boolean);
  const free = g.scouting.scouts.filter((s) => !currentAssignment(g, s.id));
  const rows = list.map((p) => {
    const r = g.scouting.reports[p.id];
    const watching = g.scouting.assignments.some((a) => a.kind === 'player' && Number(a.target) === p.id);
    return `<tr><td>${playerLink(p)}</td><td class="n">${p.age}</td><td class="hide-xs">${esc(pos(p))}</td><td class="hide-sm">${p.clubId ? clubLink(g, p.clubId) : '<i>Free agent</i>'}</td><td>${abilityStars(g, p)}</td><td class="n">${knowledge(g, p)}%</td><td class="n money">${fmtMoney(valueOf(g, p))}</td><td>${r ? `<span class="chip verdict-${r.verdict}">${r.verdict}</span>` : watching ? '<span class="chip">Being watched</span>' : free.length ? `<button class="btn tiny" data-act="scout-quick" data-id="${p.id}">Scout</button>` : ''}</td><td class="r"><button class="btn tiny" data-act="shortlist" data-id="${p.id}" title="Remove">×</button></td></tr>`;
  }).join('');
  return rows
    ? `<p class="pad small-note">Players you're keeping an eye on. "Scout" sends your first free scout.</p><div class="scroll"><table class="grid market"><thead><tr><th>Name</th><th class="n">Age</th><th class="hide-xs">Position</th><th class="hide-sm">Club</th><th>Ability</th><th class="n">Known</th><th class="n">Value</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="pad">Your shortlist is empty. Add players from their profiles.</p>';
}

function hireTab(ctx: Ctx): string {
  const g = ctx.game;
  const rows = g.scouting.pool.map((s) => scoutRow(g, s, false)).join('');
  return `<p class="pad small-note">Scouts looking for work. You can employ up to ${maxScouts(userClub(g))}. New candidates appear each summer.</p>
    <div class="scroll"><table class="grid compact"><thead><tr><th>Scout</th><th class="n">Ability</th><th class="n">Potential</th><th>Knows best</th><th class="n">Wage</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="pad">Nobody available.</td></tr>'}</tbody></table></div>`;
}

export function scoutingScreen(ctx: Ctx): string {
  const g = ctx.game;
  const tab = ctx.ui.scoutTab ?? 'staff';
  const n = Object.keys(g.scouting.reports).length;
  const tabs = segs([['staff', 'Scouts'], ['reports', `Reports${n ? ` (${n})` : ''}`], ['shortlist', `Shortlist (${g.scouting.shortlist.length})`], ['hire', 'Hire scouts']], tab, 'scout-tab', 't');
  const body = tab === 'reports' ? reportsTab(ctx) : tab === 'shortlist' ? shortlistTab(ctx) : tab === 'hire' ? hireTab(ctx) : staffTab(ctx);
  return panel(userClub(g), 'Scouting', `<div class="pad-top">${tabs}</div>${body}`);
}

/* ───────────────────────── Actions ───────────────────────── */

const val = (id: string) => (document.getElementById(id) as HTMLSelectElement | null)?.value ?? '';

function done(ctx: Ctx, err: string | null, ok: string): void {
  ctx.toast(err ?? ok);
  ctx.save();
  ctx.render();
}

export const scoutActions: Record<string, Action> = {
  'scout-tab': (ctx, el) => { ctx.ui.scoutTab = el.dataset.t as 'staff'; ctx.ui.confirm = null; ctx.render(); },
  'scout-player': (ctx, el) => {
    const id = Number(el.dataset.id);
    done(ctx, assign(ctx.game, Number(val('scout-pick')), 'player', id), 'Scout sent. His report will arrive in your inbox.');
  },
  'scout-quick': (ctx, el) => {
    const g = ctx.game;
    const free = g.scouting.scouts.filter((s) => !currentAssignment(g, s.id)).sort((a, b) => b.judgeAbility - a.judgeAbility)[0];
    if (!free) return ctx.toast('All your scouts are busy.');
    done(ctx, assign(g, free.id, 'player', Number(el.dataset.id)), `${free.name} is on his way.`);
  },
  'scout-league': (ctx) => done(ctx, assign(ctx.game, Number(val('as-scout-l')), 'league', val('as-league'), val('as-focus') as 'best'), 'Scout sent on a league tour.'),
  'scout-club': (ctx) => done(ctx, assign(ctx.game, Number(val('as-scout-c')), 'club', Number(val('as-club'))), 'Scout sent to watch the club.'),
  'scout-cancel': (ctx, el) => { cancelAssignment(ctx.game, Number(el.dataset.id)); ctx.save(); ctx.render(); },
  'scout-hire': (ctx, el) => done(ctx, hireScout(ctx.game, Number(el.dataset.id)), 'Scout hired.'),
  'scout-fire': (ctx, el) => { ctx.ui.confirm = null; done(ctx, fireScout(ctx.game, Number(el.dataset.id)), 'Scout let go.'); },
  shortlist: (ctx, el) => {
    const added = toggleShortlist(ctx.game, Number(el.dataset.id));
    const p = ctx.game.players[Number(el.dataset.id)];
    ctx.toast(`${p ? fullName(p) : 'Player'} ${added ? 'added to' : 'removed from'} your shortlist`);
    ctx.save();
    ctx.render();
  },
};
