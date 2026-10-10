import { isExtPlayer } from '../engine/ext.js';
import {
  expectedRevenue, fmtMoney, fmtWage, ledgerProfit, ledgerRevenue, loanedOut, M, niceWage, shiftTransferToScouting, shiftTransferToWages,
  spendingRule, WAGE_WEEKS, wageBill, wageCap, yearsLeft,
} from '../engine/finance.js';
import { club, userClub } from '../engine/game.js';
import {
  acceptCounter, acceptLoanCounter, counterAccepted, approachFreeAgent, confirmSigning, reopenTerms, windowOpen, askingPrice, exerciseOption, makeBid, makeLoanBid, MAX_SQUAD, squadCount,
  offerRenewal, preferredYears, proposeTerms, releaseToFree, respondToBid, setListed, severanceCost, valueOf, wageDemand,
  windowInfo, withdrawOffer, summerWindow, januaryWindow, recallLoan, clauseChoices, clauseNorm, defaultClause, confirmLoan,
  approachPreContract, preContractAllowed, preContractStatus,
} from '../engine/transfers.js';
import type { Club, GameState, Ledger, Offer, Player, Pos } from '../engine/types.js';
import type { Action, Ctx, Screen } from './ctx.js';
import { esc, fullName, pos, statusChips } from './format.js';
import { type SCol, sortableTable } from './sortable.js';
import { confirmModal, type ConfirmSpec } from './modal.js';
import { clubLink, dateOf, panel, playerLink, posOrder, primaryPos, segs } from './screens.js';
import { abilityStars } from './scoutui.js';
import { compLink } from './cupui.js';
import { attrRange, estimatedCA } from '../engine/scouting.js';
import { ATTR_LABEL, GOALKEEPING, MENTAL, PHYSICAL, TECHNICAL } from '../engine/attributes.js';
import type { AttrKey } from '../engine/types.js';

/**
 * Transfers and money: the market screen, the finances screen, and the contract and
 * offer panel on the player screen.
 */

const DEFAULT_TF: NonNullable<Ctx['ui']['tf']> = { pos: 'all', league: 'all', maxValue: 0, maxAge: 0, sort: 'value', name: '' };

/** Every position, for the search filter (by its formation code). */
const POSITIONS: [Pos, string][] = [
  ['GK', 'Goalkeeper'], ['DR', 'Right back'], ['DC', 'Centre back'], ['DL', 'Left back'], ['DM', 'Defensive midfielder'],
  ['MR', 'Right midfielder'], ['MC', 'Central midfielder'], ['ML', 'Left midfielder'],
  ['AMR', 'Right winger'], ['AMC', 'Attacking midfielder'], ['AML', 'Left winger'], ['ST', 'Striker'],
];

const GROUP: Record<string, string[]> = {
  GK: ['GK'], DEF: ['DR', 'DC', 'DL'], DM: ['DM'], MID: ['MR', 'MC', 'ML'], AM: ['AMR', 'AMC', 'AML'], ST: ['ST'],
};

/** On phones the status column is hidden, so a listed player carries a small tag by his name. */
const listedXs = (p: Player) => (p.listed === 'transfer' ? ' <span class="chip warn lst xs-only">Sale</span>' : p.listed === 'loan' ? ' <span class="chip lst loan xs-only">Loan</span>' : '');

const statusTag = (g: GameState, p: Player) => [
  p.listed === 'transfer' ? '<span class="chip warn" title="Transfer listed">For sale</span>' : '',
  p.listed === 'loan' ? '<span class="chip" title="Available for loan">Loan</span>' : '',
  p.loan ? `<span class="chip" title="On loan from ${esc(club(g, p.loan.parentId).name)}">On loan</span>` : '',
  p.contractEnd <= g.season + 1 && p.clubId ? '<span class="chip" title="Contract ends this summer">Final year</span>' : '',
  p.preContract ? `<span class="chip bad" title="Agreed to join ${esc(club(g, p.preContract).name)}">Leaving</span>` : '',
].join(' ');

function windowLine(g: GameState): string {
  const w = windowInfo(g);
  const date = dateOf(g.season, w.untilDay);
  return w.open
    ? `<span class="window open">Transfer window open until ${esc(date)}${w.untilDay - g.day <= 1 ? ' · <b>deadline day</b>' : ` · ${w.untilDay - g.day} days left`}</span>`
    : `<span class="window">Window shut · opens ${esc(date)}. Deals agreed now go through then; free agents can be signed any time.</span>`;
}

/** Wage and contract lines used on several screens. */
function contractCell(g: GameState, p: Player): string {
  const ends = p.contractEnd <= g.season + 1;
  if (!ends) return `Jun ${p.contractEnd}`;
  if (p.preContract) return `Jun ${p.contractEnd} <span class="chip bad" title="Agreed to join ${esc(club(g, p.preContract).name)}">agreed</span>`;
  const talk = p.clubId !== g.userClubId && preContractStatus(g, p)?.open;
  return `Jun ${p.contractEnd} ${talk ? '<span class="chip ok" title="Free to agree a pre-contract with you">pre-contract</span>' : '<span class="chip">ends</span>'}`;
}

/* ───────────────────────── Transfers screen ───────────────────────── */

function playerRows(g: GameState, list: Player[], attrs: AttrKey[] = []): string {
  return list.map((p) => {
    const c = p.clubId ? club(g, p.clubId) : null;
    const ac = attrs.map((k) => { const [lo, hi] = attrRange(g, p, k); return `<td class="n attr-c${lo === hi ? '' : ' est'}" title="${ATTR_LABEL[k]}${lo === hi ? '' : ': your estimate'}">${lo === hi ? lo : `${lo}–${hi}`}</td>`; }).join('');
    return `<tr><td>${playerLink(p)} ${statusChips(p)}${listedXs(p)}</td><td class="n">${p.age}</td><td class="hide-xs">${esc(pos(p))}</td><td class="hide-sm">${c ? clubLink(g, c.id) : '<i>Free agent</i>'}</td>
      <td>${abilityStars(g, p)}</td>${ac}<td class="n money">${fmtMoney(valueOf(g, p))}</td><td class="n">${fmtWage(p.wage)}</td><td class="n">${c ? contractCell(g, p) : '-'}</td><td class="hide-xs">${statusTag(g, p)}</td></tr>`;
  }).join('');
}

/** Short headings for the attribute columns. */
const ATTR_SHORT: Partial<Record<AttrKey, string>> = {
  acceleration: 'Acc', aggression: 'Agg', agility: 'Agi', anticipation: 'Ant', composure: 'Cmp', creativity: 'Cre', crossing: 'Cro',
  decisions: 'Dec', determination: 'Det', dribbling: 'Dri', finishing: 'Fin', flair: 'Fla', heading: 'Hea', jumping: 'Jum',
  longShots: 'Lon', marking: 'Mar', naturalFitness: 'Nat', offTheBall: 'OtB', pace: 'Pac', passing: 'Pas', positioning: 'Pos',
  setPieces: 'Set', stamina: 'Sta', strength: 'Str', tackling: 'Tck', teamwork: 'Tea', technique: 'Tec', workRate: 'Wor',
  aerialAbility: 'Aer', handling: 'Han', oneOnOnes: '1v1', reflexes: 'Ref',
};

function tableHead(sort?: string, attrs: AttrKey[] = []): string {
  const h = (k: string, label: string, cls = '', title = '') => `<th class="${cls}${sort === k ? ' sorted' : ''}"${title ? ` title="${title}"` : ''}>${sort !== undefined ? `<button data-act="tf-sort" data-k="${k}">${label}${sort === k ? ' ▼' : ''}</button>` : label}</th>`;
  const ah = attrs.map((k) => h(`a:${k}`, ATTR_SHORT[k] ?? ATTR_LABEL[k], 'n ', ATTR_LABEL[k])).join('');
  return `<thead><tr><th>Name</th>${h('age', 'Age', 'n ')}<th class="hide-xs">Position</th><th class="hide-sm">Club</th>${h('ca', 'Ability')}${ah}${h('value', 'Value', 'n ')}${h('wage', 'Wage', 'n ')}${h('contract', 'Contract', 'n ', 'Contract ends (June)')}<th class="hide-xs"></th></tr></thead>`;
}

/** Columns for the transfer-list and free-agent tables: click a heading to sort. */
function marketCols(g: GameState, tagListed = true): SCol[] {
  return [
    { key: 'name', label: 'Name', val: (p) => p.lastName, html: (p) => `${playerLink(p)} ${statusChips(p)}${tagListed ? listedXs(p) : ''}` },
    { key: 'age', label: 'Age', num: true, val: (p) => p.age },
    { key: 'pos', label: 'Position', cls: 'hide-xs', val: (p) => posOrder(p), html: (p) => esc(pos(p)) },
    { key: 'club', label: 'Club', cls: 'hide-sm', val: (p) => (p.clubId ? club(g, p.clubId).name : ''), html: (p) => (p.clubId ? clubLink(g, p.clubId) : '<i>Free agent</i>') },
    { key: 'ca', label: 'Ability', val: (p) => estimatedCA(g, p), html: (p) => abilityStars(g, p) },
    { key: 'value', label: 'Value', num: true, cls: 'money', val: (p) => valueOf(g, p), html: (p) => fmtMoney(valueOf(g, p)) },
    { key: 'wage', label: 'Wage', num: true, val: (p) => p.wage, html: (p) => fmtWage(p.wage) },
    { key: 'contract', label: 'Contract', num: true, val: (p) => (p.clubId ? p.contractEnd : 0), html: (p) => (p.clubId ? contractCell(g, p) : '-') },
    { key: 'status', label: '', cls: 'hide-xs', val: (p) => statusTag(g, p).length, html: (p) => statusTag(g, p) },
  ];
}

function searchTab(ctx: Ctx): string {
  const g = ctx.game;
  const tf = { ...DEFAULT_TF, ...ctx.ui.tf };
  const opt = (key: string, cur: string | number, items: [string | number, string][]) => `<select class="cm" data-change="tf" data-key="${key}" aria-label="${key}">${items.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const filters = `<div class="tf-filters">
    <label>Name <input class="cm" id="tf-name" value="${esc(tf.name)}" placeholder="Any" autocomplete="off" data-change="tf" data-key="name"></label>
    <label>Position <select class="cm" data-change="tf" data-key="pos" aria-label="Position">
      <option value="all"${tf.pos === 'all' ? ' selected' : ''}>Any</option>
      <optgroup label="Groups">${[['DEF', 'Any defender'], ['MID', 'Any wide or central midfielder'], ['AM', 'Any attacking midfielder']].map(([v, l]) => `<option value="${v}"${tf.pos === v ? ' selected' : ''}>${l}</option>`).join('')}</optgroup>
      <optgroup label="Positions">${POSITIONS.map(([v, l]) => `<option value="p:${v}"${tf.pos === `p:${v}` ? ' selected' : ''}>${l} (${v})</option>`).join('')}</optgroup>
    </select></label>
    ${tf.pos.startsWith('p:') ? `<label class="check"><input type="checkbox" data-change="tf" data-key="natural" ${tf.natural ? 'checked' : ''}> Natural position only</label>` : ''}
    <label>League ${opt('league', tf.league, [['all', 'Any'], ...g.comps.map((c) => [c.id, c.name] as [string, string]), ['free', 'Free agents']])}</label>
    <label>Max value ${opt('maxValue', tf.maxValue, [[0, 'Any'], [250e3, '£250k'], [500e3, '£500k'], [1e6, '£1m'], [2e6, '£2m'], [3e6, '£3m'], [5e6, '£5m'], [7.5e6, '£7.5m'], [10e6, '£10m'], [15e6, '£15m'], [20e6, '£20m'], [30e6, '£30m'], [40e6, '£40m'], [60e6, '£60m'], [80e6, '£80m'], [100e6, '£100m'], [150e6, '£150m']])}</label>
    <label>Max age <input class="cm age-in" type="number" inputmode="numeric" min="15" max="45" step="1" value="${tf.maxAge || ''}" placeholder="Any" autocomplete="off" data-change="tf" data-key="maxAge" aria-label="Maximum age"></label>
    <label>Contract ${opt('contract', tf.contract ?? 'any', [['any', 'Any'], ['ending', `Ends June ${g.season + 1}`], ['talk', 'Free to talk (pre-contract)']])}</label>
  </div>`;
  // Up to five attributes, each with a minimum. Judged on what you know: the middle of each scouting range.
  const attrs = (tf.attrs ?? []).filter(([k]) => k in ATTR_LABEL).slice(0, 5) as [AttrKey, number][];
  const attrGroups: [string, AttrKey[]][] = [['Technical', TECHNICAL], ['Mental', MENTAL], ['Physical', PHYSICAL], ['Goalkeeping', GOALKEEPING]];
  const attrSelect = (i: number, cur: string) => `<select class="cm" data-change="tf-attr" data-i="${i}" aria-label="Attribute ${i + 1}">${attrGroups.map(([gl, ks]) => `<optgroup label="${gl}">${ks.map((k) => `<option value="${k}"${k === cur ? ' selected' : ''}>${ATTR_LABEL[k]}</option>`).join('')}</optgroup>`).join('')}</select>`;
  const minSelect = (i: number, cur: number) => `<select class="cm" data-change="tf-attr-min" data-i="${i}" aria-label="Minimum for attribute ${i + 1}">${Array.from({ length: 20 }, (_, j) => j + 1).map((v) => `<option value="${v}"${v === cur ? ' selected' : ''}>${v}+</option>`).join('')}</select>`;
  const attrRows = attrs.map(([k, min], i) => `<span class="tf-attr">${attrSelect(i, k)}${minSelect(i, min)}<button class="btn small ghost" data-act="tf-attr-del" data-i="${i}" aria-label="Remove ${ATTR_LABEL[k]}">✕</button></span>`).join('');
  const attrBox = `<div class="tf-attrs"><span class="tf-attrs-label">Attributes</span>${attrRows}${attrs.length < 5 ? `<button class="btn small" data-act="tf-attr-add">+ Add attribute${attrs.length ? '' : ' (up to 5)'}</button>` : ''}${attrs.length ? '<button class="link small" data-act="tf-attr-clear">Clear</button>' : ''}
    ${attrs.length ? '<span class="small-note tf-attrs-note">Judged on what you know: the middle of each range your scouts give. Ranges (12–16) are estimates; scout a player to be sure.</span>' : ''}</div>`;
  const name = tf.name.trim().toLowerCase();
  const known = (p: Player, k: AttrKey) => { const [lo, hi] = attrRange(g, p, k); return (lo + hi) / 2; };
  // Pre-contracts: whether the rules let the manager talk to players from each league today (worked out once per league).
  const myLeague = userClub(g).leagueId;
  const talkFrom = new Map<string, boolean>();
  const canTalk = (p: Player): boolean => {
    const ownerId = p.loan ? p.loan.parentId : p.clubId;
    if (!ownerId || p.preContract || p.contractEnd > g.season + 1) return false;
    const lg = club(g, ownerId).leagueId;
    if (!talkFrom.has(lg)) talkFrom.set(lg, preContractAllowed(g, lg, myLeague));
    return talkFrom.get(lg)!;
  };
  let list = Object.values(g.players).filter((p) => {
    if (p.clubId === g.userClubId || isExtPlayer(p)) return false;
    if (tf.pos.startsWith('p:')) {
      // A specific position: anyone natural there, or accomplished unless "natural only" is ticked.
      const fam = p.pos[tf.pos.slice(2) as Pos] ?? 0;
      if (fam < (tf.natural ? 20 : 15)) return false;
    } else if (tf.pos !== 'all' && !GROUP[tf.pos]?.includes(primaryPos(p))) return false;
    if (tf.league === 'free' ? p.clubId !== null : tf.league !== 'all' && (!p.clubId || club(g, p.clubId).leagueId !== tf.league)) return false;
    if (tf.maxAge && p.age > tf.maxAge) return false;
    if (tf.contract === 'ending' && (!p.clubId || p.contractEnd > g.season + 1)) return false;
    if (tf.contract === 'talk' && !canTalk(p)) return false;
    if (name && !fullName(p).toLowerCase().includes(name)) return false;
    for (const [k, min] of attrs) if (known(p, k) < min) return false;
    return true;
  });
  const val = new Map(list.map((p) => [p.id, valueOf(g, p)]));
  if (tf.maxValue) list = list.filter((p) => val.get(p.id)! <= tf.maxValue);
  const key = tf.sort as string;
  const sortAttr = key.startsWith('a:') ? (key.slice(2) as AttrKey) : null;
  list.sort((a, b) => sortAttr ? known(b, sortAttr) - known(a, sortAttr) || estimatedCA(g, b) - estimatedCA(g, a)
    : key === 'age' ? a.age - b.age || estimatedCA(g, b) - estimatedCA(g, a)
    : key === 'ca' ? estimatedCA(g, b) - estimatedCA(g, a)
    : key === 'wage' ? b.wage - a.wage
    : key === 'contract' ? (a.clubId ? a.contractEnd : 0) - (b.clubId ? b.contractEnd : 0) || val.get(b.id)! - val.get(a.id)!
    : val.get(b.id)! - val.get(a.id)!);
  // Pages of 60, all the way through.
  const per = 60;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const page = Math.min(Math.max(0, ctx.ui.tfPage ?? 0), pages - 1);
  const shown = list.slice(page * per, page * per + per);
  const from = list.length ? page * per + 1 : 0;
  const to = Math.min(list.length, (page + 1) * per);
  const pager = pages > 1
    ? `<div class="tf-pager" role="navigation" aria-label="Pages"><button class="btn small" data-act="tf-page" data-p="0" ${page === 0 ? 'disabled' : ''} aria-label="First page">«</button><button class="btn small" data-act="tf-page" data-p="${page - 1}" ${page === 0 ? 'disabled' : ''}>◄ Previous</button>
        <span class="tf-pageno">Page <b>${page + 1}</b> of ${pages.toLocaleString('en-GB')}</span>
        <button class="btn small" data-act="tf-page" data-p="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''}>Next ►</button><button class="btn small" data-act="tf-page" data-p="${pages - 1}" ${page >= pages - 1 ? 'disabled' : ''} aria-label="Last page">»</button></div>`
    : '';
  return `${filters}${attrBox}<p class="pad small-note">${list.length.toLocaleString('en-GB')} players match${list.length > per ? `; showing ${from.toLocaleString('en-GB')}–${to.toLocaleString('en-GB')}` : ''}. Click a name to see him and make an offer.</p>
    ${pager}<div class="scroll"><table class="grid market">${tableHead(key, attrs.map(([k]) => k))}<tbody>${playerRows(g, shown, attrs.map(([k]) => k)) || `<tr><td colspan="${9 + attrs.length}" class="pad">Nobody matches.</td></tr>`}</tbody></table></div>${pager}`;
}

function listedTab(ctx: Ctx): string {
  const g = ctx.game;
  const kind = ctx.ui.listedKind ?? 'all';
  const all = Object.values(g.players).filter((p) => p.listed && p.clubId && p.clubId !== g.userClubId);
  const list = kind === 'all' ? all : all.filter((p) => p.listed === kind);
  const n = (k: 'transfer' | 'loan') => all.filter((p) => p.listed === k).length;
  // What each club will do with him: sell, or loan out. Always shown, phones included.
  const listedCol: SCol = {
    key: 'listed', label: 'For', val: (p) => (p.listed === 'transfer' ? 0 : 1),
    html: (p) => (p.listed === 'transfer' ? '<span class="chip warn lst" title="Transfer listed: his club will sell">Sale</span>' : '<span class="chip lst loan" title="Loan listed: his club will loan him out">Loan</span>'),
  };
  const cols = marketCols(g, false).filter((c) => c.key !== 'status');
  cols.splice(1, 0, listedCol);
  const { head, rows } = sortableTable(ctx, 'tf-listed', cols, list, { key: 'value', dir: -1 }, (x, y) => valueOf(g, y) - valueOf(g, x), 100);
  const filter = segs([['all', `All (${all.length})`], ['transfer', `For sale (${n('transfer')})`], ['loan', `For loan (${n('loan')})`]], kind, 'tf-listed-kind', 'k');
  const note = kind === 'loan'
    ? 'Players their clubs will loan out. Make a loan offer from his page: you pay part of his wages, and can ask for an option to buy.'
    : kind === 'transfer'
      ? 'Players their clubs are ready to sell. Clubs ask less for transfer-listed players.'
      : '<span class="chip warn lst">Sale</span> his club will sell him, and asks less than usual. <span class="chip lst loan">Loan</span> his club will loan him out.';
  return `<div class="pad-top">${filter}</div><p class="pad small-note">${note} Click a heading to sort.</p>
    <div class="scroll"><table class="grid market listed"><thead><tr>${head}</tr></thead><tbody>${rows || '<tr><td colspan="9" class="pad">Nobody listed.</td></tr>'}</tbody></table></div>`;
}

function freeTab(ctx: Ctx): string {
  const g = ctx.game;
  const list = Object.values(g.players).filter((p) => p.clubId === null);
  const { head, rows } = sortableTable(ctx, 'tf-free', marketCols(g), list, { key: 'ca', dir: -1 }, (x, y) => y.ca - x.ca);
  return `<p class="pad small-note">Out-of-contract players can be signed at any time, even with the window shut. There's no fee, just wages. Click a heading to sort.</p>
    ${list.length ? `<div class="scroll"><table class="grid market"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="pad">No free agents at the moment. Players whose contracts run out join this list in the summer.</p>'}`;
}

function offerLine(g: GameState, o: Offer): string {
  const p = g.players[o.playerId];
  const name = p ? playerLink(p) : 'A player';
  const what = o.kind === 'loan' ? `loan${o.wageShare !== undefined ? ` (${Math.round(o.wageShare * 100)}% of wages)` : ''}` : o.kind === 'precontract' ? 'pre-contract (free, joins 1 July)' : o.fee ? fmtMoney(o.fee) : 'free transfer';
  return `${name} · ${what}`;
}

const STATUS_WORD: Record<Offer['status'], string> = {
  pending: 'Waiting for you', accepted: 'Fee agreed: personal terms', countered: 'Counter-offer', rejected: 'Rejected',
  terms: 'Agreed: waiting for the window', done: 'Completed', withdrawn: 'Withdrawn', expired: 'Expired', collapsed: 'Collapsed',
};

function offersTab(ctx: Ctx): string {
  const g = ctx.game;
  const me = g.userClubId;
  const incoming = g.offers.filter((o) => o.sellerId === me && o.status === 'pending');
  const inRows = incoming.map((o) => {
    const p = g.players[o.playerId];
    const buyer = club(g, o.buyerId);
    const clause = p.releaseClause && o.fee >= p.releaseClause;
    const counter = o.kind === 'loan' || clause ? '' : `<label class="inline">Ask for £<input class="cm money-in" id="counter-${o.id}" type="number" min="0" step="0.5" value="${((o.fee * 1.2) / M).toFixed(1)}">m</label><button class="btn small" data-act="bid-counter" data-id="${o.id}">Counter</button>`;
    const canRecall = o.kind === 'loan' && summerWindow(g) && !o.recallRefused;
    return `<div class="offer-card"><div><b>${esc(buyer.name)}</b> want ${offerLine(g, o)} <span class="small-note">(value ${fmtMoney(valueOf(g, p))})</span>${clause ? ' <span class="chip bad">Release clause met</span>' : ''}</div>
      ${o.recallRefused ? `<p class="small-note">${esc(o.note ?? '')}</p>` : ''}
      <div class="row-btns"><button class="btn primary small" data-act="bid-accept" data-id="${o.id}">Accept</button>${canRecall ? `<button class="btn small" data-act="bid-accept-recall" data-id="${o.id}" title="Ask for the right to call him back in the January window">Accept with January recall</button>` : ''}${clause ? '' : `<button class="btn small" data-act="bid-reject" data-id="${o.id}">Reject</button>`}${counter}</div></div>`;
  }).join('');
  const mine = g.offers.filter((o) => o.buyerId === me && ['accepted', 'countered', 'terms'].includes(o.status));
  const outRows = mine.map((o) => `<tr><td>${offerLine(g, o)}</td><td class="hide-xs">${o.sellerId ? clubLink(g, o.sellerId) : '<i>Free agent</i>'}</td><td>${o.status === 'accepted' ? (o.kind === 'loan' ? 'Loan agreed: confirm it' : o.agreed ? 'Terms agreed: confirm it' : o.kind === 'precontract' ? 'Pre-contract talks' : o.sellerId ? STATUS_WORD.accepted : 'Talks: personal terms') : STATUS_WORD[o.status]}</td><td class="r">${g.players[o.playerId] ? `<button class="btn small" data-act="player" data-id="${o.playerId}">Open</button>` : ''} <button class="btn small ghost" data-act="offer-withdraw" data-id="${o.id}">Withdraw</button></td></tr>`).join('');
  const recent = g.offers.filter((o) => (o.buyerId === me || o.sellerId === me) && !['pending', 'accepted', 'countered', 'terms'].includes(o.status)).slice(-12).reverse();
  const joining = Object.values(g.players).filter((p) => p.preContract === me);
  const recentRows = recent.map((o) => `<tr><td>${dateOf(o.season === g.season ? g.season : o.season, o.day)}</td><td>${offerLine(g, o)}</td><td class="hide-xs">${o.buyerId === me ? 'Your bid' : `From ${clubLink(g, o.buyerId)}`}</td><td>${STATUS_WORD[o.status]}</td><td class="hide-sm small-note">${esc(o.note ?? '')}</td></tr>`).join('');
  return `<div class="sub-head">Offers for your players</div>
    ${inRows || '<p class="pad small-note">No offers waiting. List players for transfer or loan to attract bids.</p>'}
    <div class="sub-head">Your deals in progress</div>
    ${outRows ? `<div class="scroll"><table class="grid compact"><tbody>${outRows}</tbody></table></div>` : '<p class="pad small-note">None. Find a player and make an offer from his profile.</p>'}
    ${joining.length ? `<div class="sub-head">Joining you in the summer</div><div class="scroll"><table class="grid compact"><tbody>${joining.map((p) => `<tr><td>${playerLink(p)}</td><td class="hide-xs">${p.clubId ? clubLink(g, p.loan ? p.loan.parentId : p.clubId) : ''}</td><td>Pre-contract${p.preTerms ? `: ${fmtWage(p.preTerms.wage)}, ${p.preTerms.years} year${p.preTerms.years === 1 ? '' : 's'}` : ''}</td><td class="r small-note">Joins 1 July</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${recentRows ? `<div class="sub-head">Recent</div><div class="scroll"><table class="grid compact"><tbody>${recentRows}</tbody></table></div>` : ''}`;
}

function newsTab(ctx: Ctx): string {
  const g = ctx.game;
  const league = ctx.ui.compId ?? 'all';
  const tabs = `<div class="segs comp-tabs" role="tablist">${[['all', 'All leagues'], ...g.comps.map((c) => [c.id, c.name])].map(([id, n]) => `<button class="seg${id === league ? ' on' : ''}" data-act="tf-league" data-c="${id}">${esc(n)}</button>`).join('')}</div>`;
  const inLeague = (id: number | null) => id !== null && (league === 'all' || club(g, id).leagueId === league);
  const list = g.transfers.filter((t) => t.kind !== 'loan-end' && t.kind !== 'release' && (inLeague(t.fromId) || inLeague(t.toId))).slice().reverse().slice(0, 100);
  const rows = list.map((t) => {
    const p = g.players[t.playerId];
    const fee = t.kind === 'loan' ? '<span class="chip">Loan</span>' : t.kind === 'free' ? '<span class="chip">Free</span>' : `<b>${fmtMoney(t.fee)}</b>`;
    return `<tr class="${t.fromId === g.userClubId || t.toId === g.userClubId ? 'mine' : ''}"><td class="date">${dateOf(t.season, t.day)}</td><td>${p ? playerLink(p, t.name) : esc(t.name)}</td><td class="hide-xs">${t.fromId ? clubLink(g, t.fromId) : '<i>Free agent</i>'}</td><td>→ ${t.toId ? clubLink(g, t.toId) : '-'}</td><td class="n">${fee}</td></tr>`;
  }).join('');
  const spend = new Map<number, number>();
  for (const t of g.transfers) if (t.season === g.season && t.kind === 'transfer' && t.toId) spend.set(t.toId, (spend.get(t.toId) ?? 0) + t.fee);
  const top = [...spend].filter(([id]) => inLeague(id)).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return `<div class="pad-top">${tabs}</div>
    ${top.length ? `<p class="pad small-note">Biggest spenders this season: ${top.map(([id, v]) => `${clubLink(g, id)} ${fmtMoney(v)}`).join(' · ')}</p>` : ''}
    ${rows ? `<div class="scroll"><table class="grid compact"><tbody>${rows}</tbody></table></div>` : '<p class="pad">No transfers yet.</p>'}`;
}

export function transfersScreen(ctx: Ctx): string {
  const g = ctx.game;
  const c = userClub(g);
  const tab = ctx.ui.transferTab ?? 'search';
  const incoming = g.offers.filter((o) => o.sellerId === g.userClubId && o.status === 'pending').length;
  const tabs = segs([['search', 'Find players'], ['listed', 'Transfer list'], ['free', 'Free agents'], ['offers', `Offers${incoming ? ` (${incoming})` : ''}`], ['news', 'Latest transfers']], tab, 'tf-tab', 't');
  const f = c.finance;
  const summary = `<div class="money-strip"><span>Transfer budget <b>${fmtMoney(f.transferBudget)}</b></span><span>Wages <b>${fmtWage(wageBill(g, c.id))}</b> of ${fmtWage(f.wageBudget)}</span><span>Squad <b>${squadCount(c, g.players)}</b>/${MAX_SQUAD}</span>${windowLine(g)}</div>`;
  const body = tab === 'listed' ? listedTab(ctx) : tab === 'free' ? freeTab(ctx) : tab === 'offers' ? offersTab(ctx) : tab === 'news' ? newsTab(ctx) : searchTab(ctx);
  return panel(c, 'Transfers', `${summary}<div class="pad-top">${tabs}</div>${body}`);
}

/* ───────────────────────── Player screen: contract and deals ───────────────────────── */

function yearsSelect(id: string, cur: number): string {
  return `<select class="cm" id="${id}">${[1, 2, 3, 4, 5].map((y) => `<option value="${y}"${y === cur ? ' selected' : ''}>${y} year${y > 1 ? 's' : ''}</option>`).join('')}</select>`;
}

function latestOffer(g: GameState, p: Player): Offer | undefined {
  return [...g.offers].reverse().find((o) => o.playerId === p.id && o.buyerId === g.userClubId && o.season === g.season);
}

/** Contract facts plus whatever deal can be done with this player. */
export function dealPanel(ctx: Ctx, p: Player): string {
  const g = ctx.game;
  const me = userClub(g);
  const mine = p.clubId === me.id;
  const value = valueOf(g, p);
  const loanFrom = p.loan ? club(g, p.loan.parentId) : null;
  const facts = `<dl class="facts contract">
      <div><dt>Value</dt><dd>${fmtMoney(value)}</dd></div>
      <div><dt>Wage</dt><dd>${fmtWage(p.wage)}</dd></div>
      <div><dt>Contract</dt><dd>${p.clubId ? `to June ${p.contractEnd} (${yearsLeft(p, g.season, g.day).toFixed(1)} yrs)` : 'Free agent'}</dd></div>
      ${p.releaseClause ? `<div><dt>Release clause</dt><dd>${fmtMoney(p.releaseClause)}</dd></div>` : ''}
      ${loanFrom ? `<div><dt>On loan from</dt><dd>${clubLink(g, loanFrom.id)} · you pay ${Math.round(p.loan!.wageShare * 100)}% of wages${p.loan!.optionFee ? ` · option ${fmtMoney(p.loan!.optionFee)}` : ''}${p.loan!.recall ? ' · they can recall him in January' : ''}</dd></div>` : ''}
      ${p.preContract ? `<div><dt>Next club</dt><dd>${clubLink(g, p.preContract)} (pre-contract${p.preContract === me.id && p.preTerms ? `: ${fmtWage(p.preTerms.wage)} for ${p.preTerms.years} year${p.preTerms.years === 1 ? '' : 's'} from 1 July` : ''})</dd></div>` : ''}
      ${p.listed ? `<div><dt>Status</dt><dd>${p.listed === 'transfer' ? 'Listed for transfer' : 'Available for loan'}</dd></div>` : ''}
    </dl>`;
  const msg = ctx.ui.dealMsg ? `<p class="deal-msg" role="status">${esc(ctx.ui.dealMsg)}</p>` : '';
  let actions = '';
  if (mine) actions = ownActions(ctx, p);
  else actions = buyActions(ctx, p);
  return `<div class="deal">${facts}${msg}${actions}</div>`;
}

/** How clauses work at this club, for the contract forms. */
function clauseNote(c: Club): string {
  const n = clauseNorm(c.leagueId);
  return n === 'spain'
    ? 'A release clause lets any club that bids it talk to him. In Spain every contract must have one: a high one costs a little more in wages, a low one a little less.'
    : n === 'portugal'
      ? 'A release clause lets any club that bids it talk to him. Most contracts in Portugal have one: no clause costs about 12% more in wages, a low one a little less.'
      : 'A release clause lets any club that bids it talk to him. They are unusual here, so most contracts have none; a player given a way out takes a little less in wages. Removing one he already has costs more.';
}

/** The release clause choices for a contract (signing or renewal). */
function clauseSelect(g: GameState, p: Player, c: Club, renewal: boolean, fee = 0, sel = renewal ? 'keep' : defaultClause(c)): string {
  const choices = clauseChoices(g, p, c, fee);
  const pct = (w: number) => (w === 1 ? '' : ` · ${w > 1 ? '+' : '−'}${Math.round(Math.abs(w - 1) * 100)}% wages`);
  const keep = renewal ? `<option value="keep"${sel === 'keep' ? ' selected' : ''}>Keep: ${p.releaseClause ? fmtMoney(p.releaseClause) : 'no clause'}</option>` : '';
  return `<label>Release clause <select class="cm" id="deal-clause">${keep}${choices.map((ch) => `<option value="${ch.key}"${ch.key === sel ? ' selected' : ''}>${esc(ch.fee ? ch.label : 'None')}${pct(ch.wage)}</option>`).join('')}</select></label>`;
}

function ownActions(ctx: Ctx, p: Player): string {
  const g = ctx.game;
  const me = userClub(g);
  if (p.loan) {
    const opt = p.loan.optionFee ? `<button class="btn" data-act="exercise-option" data-id="${p.id}">Sign permanently for ${fmtMoney(p.loan.optionFee)}</button>` : '';
    const talks = preContractTalks(ctx, p);
    if (talks) return talks;
    return `${preContractBox(ctx, p)}<div class="row-btns">${opt}<button class="btn ghost" data-act="confirm" data-key="release-${p.id}">End loan early…</button></div>${ctx.ui.confirm === `release-${p.id}` ? `<div class="confirm">Send ${esc(fullName(p))} back to ${esc(club(g, p.loan.parentId).name)}? <button class="btn danger" data-act="release" data-id="${p.id}">Send back</button> <button class="btn" data-act="confirm-cancel">Keep him</button></div>` : ''}`;
  }
  const draft = ctx.ui.renewDraft?.id === p.id ? ctx.ui.renewDraft : null;
  const clauseHtml = clauseSelect(g, p, me, true, 0, draft?.clause ?? 'keep');
  const renew = ctx.ui.deal === 'renew'
    ? `<div class="deal-form"><b>New contract</b>
        <label>Wage £<input class="cm money-in" id="deal-wage" type="number" min="0" step="1" value="${draft ? draft.wage : Math.round(niceWage(p.wage * 1.1) / 1000)}">k a week</label>
        ${yearsSelect('deal-years', draft ? draft.years : Math.max(preferredYears(p), Math.min(5, p.contractEnd - ctx.game.season + 1)))}
        ${clauseHtml}
        <button class="btn primary" data-act="renew-offer" data-id="${p.id}">Offer contract</button><button class="btn ghost" data-act="deal-close">Cancel</button>
        <p class="small-note">${yearsLeft(p, g.season, g.day) >= 1 ? `He's on ${fmtWage(p.wage)} to June ${p.contractEnd}. He doesn't need a new deal, so expect him to want a rise, and he won't sign for less time than he has left. ` : ''}${clauseNote(me)}</p></div>`
    : '';
  const clauseWarn = p.releaseClause ? `<p class="deal-msg">Release clause: <b>${fmtMoney(p.releaseClause)}</b>. Any club that bids it can talk to him, and you can't refuse. Change or remove it with a new contract.</p>` : '';
  const cost = severanceCost(g, p);
  const confirming = ctx.ui.confirm === `release-${p.id}`;
  const release = confirming
    ? `<div class="confirm">Release ${esc(fullName(p))}? Paying off his contract costs ${fmtMoney(cost)}. <button class="btn danger" data-act="release" data-id="${p.id}">Release</button> <button class="btn" data-act="confirm-cancel">Keep him</button></div>`
    : '';
  void me;
  return `<div class="row-btns">
      <button class="btn" data-act="deal-open" data-d="renew">New contract…</button>
      <button class="btn${p.listed === 'transfer' ? ' on' : ''}" data-act="list" data-id="${p.id}" data-l="transfer">${p.listed === 'transfer' ? 'Remove from transfer list' : 'Transfer list'}</button>
      <button class="btn${p.listed === 'loan' ? ' on' : ''}" data-act="list" data-id="${p.id}" data-l="loan">${p.listed === 'loan' ? 'Remove from loan list' : 'Loan list'}</button>
      <button class="btn ghost" data-act="confirm" data-key="release-${p.id}">Release…</button>
    </div>${clauseWarn}${renew}${release}`;
}

/** The pre-contract offer, or when it opens, for a player whose contract ends this season. */
function preContractBox(ctx: Ctx, p: Player): string {
  const st = preContractStatus(ctx.game, p);
  // Already signed with the manager: the facts above say so.
  if (!st || p.preContract === userClub(ctx.game).id) return '';
  if (!st.open) return `<p class="small-note pc-note">${esc(st.why)}</p>`;
  return `<div class="pc-box"><b>Free to talk</b><p class="small-note">${esc(st.why)} His club has to be told, but gets no fee and no say.</p>
    <div class="row-btns"><button class="btn primary" data-act="precontract" data-id="${p.id}">Offer a pre-contract…</button></div></div>`;
}

/** Pre-contract talks in progress: personal terms, then the signature. */
function preContractTalks(ctx: Ctx, p: Player): string {
  const g = ctx.game;
  const me = userClub(g);
  const o = latestOffer(g, p);
  if (!o || o.kind !== 'precontract' || o.status !== 'accepted') return '';
  const owner = club(g, o.sellerId);
  if (o.agreed && o.wage !== undefined) {
    return `<div class="deal-form agreed"><b>Pre-contract agreed</b><p class="small-note">${esc(o.note ?? '')}</p>
      <dl class="facts" style="margin:6px 0;width:100%"><div><dt>Wage</dt><dd>${fmtWage(o.wage)}</dd></div><div><dt>Contract</dt><dd>${o.years} year${o.years === 1 ? '' : 's'} from 1 July</dd></div><div><dt>Release clause</dt><dd>${o.clauseFee ? fmtMoney(o.clauseFee) : 'none'}</dd></div><div><dt>Fee</dt><dd>None: his contract with ${esc(owner.name)} runs out</dd></div></dl>
      <div class="row-btns"><button class="btn primary" data-act="deal-sign" data-id="${o.id}">Sign the pre-contract</button><button class="btn" data-act="terms-reopen" data-id="${o.id}">Change the terms</button><button class="btn ghost" data-act="offer-withdraw" data-id="${o.id}">Walk away</button></div>
      <p class="small-note">Once signed it's binding: he joins you on 1 July and can't be sold or renewed by ${esc(owner.name)} in the meantime. Until you confirm, he could still agree a new deal or another move.</p></div>`;
  }
  const demand = o.demand?.wage ?? niceWage(wageDemand(g, p, me) * 1.1);
  const start = o.demand ? demand : niceWage(Math.max(p.wage, demand * 0.85));
  return `<div class="deal-form"><b>Pre-contract: personal terms</b>${o.note ? `<p class="small-note">${esc(o.note)}</p>` : ''}
    <label>Wage £<input class="cm money-in" id="deal-wage" type="number" min="0" step="1" value="${Math.round(start / 1000)}">k a week</label>
    ${yearsSelect('deal-years', o.demand?.years ?? preferredYears(p))}
    ${clauseSelect(g, p, me, false, 0, o.clause ?? defaultClause(me))}
    <button class="btn primary" data-act="terms-offer" data-id="${o.id}">Offer contract</button><button class="btn ghost" data-act="offer-withdraw" data-id="${o.id}">Walk away</button>
    <p class="small-note">He earns ${fmtWage(p.wage)} now. There's no fee, so he'll want a little more in wages. His wages count against next season's budget (${fmtWage(me.finance.wageBudget)}), alongside the players staying and anyone else joining. ${clauseNote(me)}</p></div>`;
}

function buyActions(ctx: Ctx, p: Player): string {
  const g = ctx.game;
  const me = userClub(g);
  const o = latestOffer(g, p);
  const free = p.clubId === null;
  const talks = preContractTalks(ctx, p);
  if (talks) return talks;
  // Talks in progress take over the panel.
  if (o && o.kind === 'loan' && o.status === 'accepted' && o.agreed) {
    const share = o.wageShare ?? 1;
    const seller = club(g, o.sellerId);
    return `<div class="deal-form agreed"><b>Loan agreed</b><p class="small-note">${esc(o.note ?? '')}</p>
      <dl class="facts" style="margin:6px 0;width:100%"><div><dt>From</dt><dd>${esc(seller.name)}</dd></div><div><dt>Length</dt><dd>To the end of the season</dd></div><div><dt>You pay</dt><dd>${Math.round(share * 100)}% of his wage (${fmtWage(niceWage(p.wage * share))})</dd></div><div><dt>Option to buy</dt><dd>${o.optionFee ? fmtMoney(o.optionFee) : 'None'}</dd></div><div><dt>January recall</dt><dd>${o.recall ? `${esc(seller.name)} can recall him` : 'No'}</dd></div></dl>
      <div class="row-btns"><button class="btn primary" data-act="loan-confirm" data-id="${o.id}">Confirm loan</button><button class="btn ghost" data-act="offer-withdraw" data-id="${o.id}">Walk away</button></div>
      <p class="small-note">Nothing is done until you confirm. Until then another club could still take him.${windowOpen(g) ? '' : ' The window is shut: once you confirm, he joins the day it opens.'}</p></div>`;
  }
  if (o && o.status === 'accepted' && o.agreed && o.wage !== undefined) {
    const clause = o.clauseFee ? fmtMoney(o.clauseFee) : 'none';
    return `<div class="deal-form agreed"><b>Terms agreed</b><p class="small-note">${esc(o.note ?? '')}</p>
      <dl class="facts" style="margin:6px 0;width:100%"><div><dt>Wage</dt><dd>${fmtWage(o.wage)}</dd></div><div><dt>Contract</dt><dd>${o.years} year${o.years === 1 ? '' : 's'}</dd></div><div><dt>Release clause</dt><dd>${clause}</dd></div><div><dt>Fee</dt><dd>${o.fee ? `${fmtMoney(o.fee)} to ${esc(club(g, o.sellerId).name)}` : 'None (free agent)'}</dd></div></dl>
      <div class="row-btns"><button class="btn primary" data-act="deal-sign" data-id="${o.id}">Sign him</button><button class="btn" data-act="terms-reopen" data-id="${o.id}">Change the terms</button><button class="btn ghost" data-act="offer-withdraw" data-id="${o.id}">Walk away</button></div>
      <p class="small-note">Nothing is signed${o.fee ? ' or paid' : ''} until you confirm. Until then another club could still sign him.${o.fee && !windowOpen(g) ? ' The window is shut: once you confirm, the deal goes through the day it opens.' : ''}</p></div>`;
  }
  if (o && o.status === 'accepted') {
    const demand = o.demand?.wage ?? wageDemand(g, p, me);
    const start = o.demand ? demand : niceWage(Math.max(p.wage, demand * 0.85));
    return `<div class="deal-form"><b>Personal terms</b>${o.note ? `<p class="small-note">${esc(o.note)}</p>` : ''}
      <label>Wage £<input class="cm money-in" id="deal-wage" type="number" min="0" step="1" value="${Math.round(start / 1000)}">k a week</label>
      ${yearsSelect('deal-years', o.demand?.years ?? preferredYears(p))}
      ${clauseSelect(g, p, me, false, o.fee, o.clause ?? defaultClause(me))}
      <button class="btn primary" data-act="terms-offer" data-id="${o.id}">Offer contract</button><button class="btn ghost" data-act="offer-withdraw" data-id="${o.id}">Walk away</button>
      <p class="small-note">He earns ${fmtWage(p.wage)} now. Your wage bill is ${fmtWage(wageBill(g, me.id))} of a ${fmtWage(me.finance.wageBudget)} budget. ${clauseNote(me)}</p></div>`;
  }
  if (o && o.status === 'countered' && o.kind === 'transfer') {
    return `<div class="deal-form"><b>${esc(club(g, o.sellerId).name)} want ${fmtMoney(o.counterFee!)}</b>
      <button class="btn primary" data-act="counter-accept" data-id="${o.id}">Pay ${fmtMoney(o.counterFee!)}</button><button class="btn" data-act="deal-open" data-d="bid">Make another offer</button><button class="btn ghost" data-act="offer-withdraw" data-id="${o.id}">Withdraw</button></div>`;
  }
  if (o && o.status === 'countered' && o.kind === 'loan') {
    return `<div class="deal-form"><b>${esc(o.note ?? '')}</b>
      ${o.counterFee ? `<button class="btn primary" data-act="loan-counter" data-id="${o.id}" data-opt="1">Loan with option at ${fmtMoney(o.counterFee)}</button>` : ''}<button class="btn${o.counterFee ? '' : ' primary'}" data-act="loan-counter" data-id="${o.id}" data-opt="0">Loan without option</button><button class="btn ghost" data-act="offer-withdraw" data-id="${o.id}">Withdraw</button></div>`;
  }
  if (o && o.status === 'terms') return `<p class="deal-msg">${esc(o.note ?? 'Agreed.')}</p><div class="row-btns"><button class="btn ghost" data-act="offer-withdraw" data-id="${o.id}">Call it off</button></div>`;
  if (free) return `<div class="row-btns"><button class="btn primary" data-act="approach" data-id="${p.id}">Offer a contract</button></div>`;
  if (p.loan) {
    const ours = p.loan.parentId === me.id;
    const recall = p.loan.recall
      ? ours
        ? januaryWindow(g)
          ? `<div class="row-btns"><button class="btn primary" data-act="loan-recall" data-id="${p.id}">Recall him now</button></div>`
          : '<p class="small-note">You have a recall clause: you can bring him back in the January window.</p>'
        : `<p class="small-note">${esc(club(g, p.loan.parentId).name)} can recall him in the January window.</p>`
      : '';
    return `<p class="small-note">He's on loan at ${clubLink(g, p.clubId!)} from ${clubLink(g, p.loan.parentId)} until the end of the season.</p>${recall}${preContractBox(ctx, p)}`;
  }
  const ask = askingPrice(g, p, me);
  const value = valueOf(g, p);
  const bidForm = ctx.ui.deal === 'bid'
    ? `<div class="deal-form"><b>Transfer offer</b>
        <label>Fee £<input class="cm money-in" id="deal-fee" type="number" min="0" step="0.5" value="${(Math.min(me.finance.transferBudget, value) / M).toFixed(1)}">m</label>
        <button class="btn primary" data-act="bid-submit" data-id="${p.id}">Make offer</button><button class="btn ghost" data-act="deal-close">Cancel</button>
        <p class="small-note">Your budget: ${fmtMoney(me.finance.transferBudget)}. ${p.listed === 'transfer' ? 'He is transfer listed, so they should accept less than usual.' : 'Clubs usually want more than a player\'s value for anyone who plays regularly.'}${p.releaseClause ? ` A bid of ${fmtMoney(p.releaseClause)} meets his release clause.` : ''}</p></div>`
    : '';
  const loanForm = ctx.ui.deal === 'loan'
    ? `<div class="deal-form"><b>Loan offer</b> to the end of the season
        <label>You pay <select class="cm" id="deal-share">${[0.25, 0.5, 0.75, 1].map((s) => `<option value="${s}"${s === 0.75 ? ' selected' : ''}>${s * 100}%</option>`).join('')}</select> of his ${fmtWage(p.wage)} wage</label>
        <label>Option to buy £<input class="cm money-in" id="deal-option" type="number" min="0" step="0.5" placeholder="none">m</label>
        <button class="btn primary" data-act="loan-submit" data-id="${p.id}">Make offer</button><button class="btn ghost" data-act="deal-close">Cancel</button></div>`
    : '';
  void ask;
  const pc = preContractBox(ctx, p);
  const pcOpen = preContractStatus(g, p)?.open;
  return `${pc}<div class="row-btns"><button class="btn${pcOpen ? '' : ' primary'}" data-act="deal-open" data-d="bid">Make an offer…</button><button class="btn" data-act="deal-open" data-d="loan">Ask about a loan…</button></div>${bidForm}${loanForm}`;
}

/* ───────────────────────── Squad contracts view ───────────────────────── */

export function squadContracts(ctx: Ctx): string {
  const g = ctx.game;
  const c = userClub(g);
  const squad = c.playerIds.map((id) => g.players[id]);
  const cols: SCol[] = [
    { key: 'no', label: 'No', num: true, val: (p) => p.squadNo },
    { key: 'name', label: 'Name', val: (p) => p.lastName, html: (p) => `${playerLink(p)} ${statusChips(p)}` },
    { key: 'pos', label: 'Position', cls: 'hide-xs', val: (p) => posOrder(p), html: (p) => esc(pos(p)) },
    { key: 'age', label: 'Age', num: true, val: (p) => p.age },
    { key: 'value', label: 'Value', num: true, cls: 'money', val: (p) => valueOf(g, p), html: (p) => fmtMoney(valueOf(g, p)) },
    { key: 'wage', label: 'Wage', num: true, val: (p) => p.wage, html: (p) => fmtWage(p.wage) },
    { key: 'contract', label: 'Contract', num: true, val: (p) => p.contractEnd, html: (p) => (p.loan ? '<i>loan</i>' : contractCell(g, p)) },
    { key: 'clause', label: 'Clause', num: true, cls: 'hide-sm', val: (p) => p.releaseClause ?? 0, html: (p) => (p.releaseClause ? fmtMoney(p.releaseClause) : '-') },
    { key: 'status', label: 'Status', cls: 'hide-xs', val: (p) => statusTag(g, p).length, html: (p) => statusTag(g, p) },
  ];
  const { head, rows } = sortableTable(ctx, 'contracts', cols, squad, { key: 'contract', dir: 1 }, (a, b) => a.contractEnd - b.contractEnd || b.wage - a.wage);
  const out = loanedOut(g, c.id);
  const outRows = out.map((p) => `<tr><td class="n">-</td><td>${playerLink(p)}</td><td class="hide-xs">${esc(pos(p))}</td><td class="n">${p.age}</td><td class="n money">${fmtMoney(valueOf(g, p))}</td><td class="n">${fmtWage(p.wage)}</td><td class="n">${p.contractEnd}</td><td class="n hide-sm">-</td><td class="hide-xs">at ${clubLink(g, p.clubId!)}</td></tr>`).join('');
  return `<div class="scroll"><table class="grid squad"><thead><tr>${head}</tr></thead><tbody>${rows}${outRows ? `<tr class="sub-row"><td colspan="9">Out on loan</td></tr>${outRows}` : ''}</tbody></table></div>
    <p class="pad small-note">Click a heading to sort; the default is contract end. Players whose deals end this summer leave on free transfers unless you renew them, and from February others may agree pre-contracts.</p>`;
}



/* ───────────────────────── Finances screen ───────────────────────── */

function ledgerRows(cur: Ledger, prev?: Ledger): string {
  const row = (label: string, k: keyof Ledger, neg = false, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="n">${fmtMoney(neg ? -(cur[k] ?? 0) : cur[k] ?? 0)}</td><td class="n hide-xs">${prev ? fmtMoney(neg ? -(prev[k] ?? 0) : prev[k] ?? 0) : '-'}</td></tr>`;
  const sum = (l: Ledger | undefined, f: (l: Ledger) => number) => (l ? fmtMoney(f(l)) : '-');
  const cash = (l: Ledger) => ledgerRevenue(l) + l.sales - l.wages - l.purchases - l.operating - l.loanFeesOut - l.severance - (l.scouting ?? 0) - (l.stadium ?? 0);
  return `<tbody>
    <tr class="sub-row"><td colspan="3">Income</td></tr>
    ${row('Gate receipts', 'gate')}${row('TV money', 'tv')}${row('Prize and merit money', 'prize')}${row('Sponsorship', 'sponsorship')}${row('Merchandise', 'merchandise')}${row('Loan fees received', 'loanFeesIn')}${row('Player sales', 'sales')}
    <tr class="sub-row"><td colspan="3">Spending</td></tr>
    ${row('Wages', 'wages', true)}${row('Player purchases', 'purchases', true)}${row('Running costs', 'operating', true)}${row('Loan fees paid', 'loanFeesOut', true)}${row('Contract pay-offs', 'severance', true)}${row('Scouting', 'scouting', true)}${cur.stadium || prev?.stadium ? row('Stadium works and loan (outside the rules)', 'stadium', true) : ''}
    <tr class="total"><td>Cash flow</td><td class="n">${fmtMoney(cash(cur))}</td><td class="n hide-xs">${sum(prev, cash)}</td></tr>
    <tr class="sub-row"><td colspan="3">Profit and loss (what the spending rules measure)</td></tr>
    <tr><td>Revenue</td><td class="n">${fmtMoney(ledgerRevenue(cur))}</td><td class="n hide-xs">${sum(prev, ledgerRevenue)}</td></tr>
    ${row('Wages', 'wages', true)}${row('Running costs', 'operating', true)}${row('Scouting', 'scouting', true)}${row('Transfer fees written off (amortisation)', 'amortisation', true)}${row('Profit on player sales', 'saleProfit')}
    <tr class="total"><td>Profit / loss</td><td class="n">${fmtMoney(ledgerProfit(cur))}</td><td class="n hide-xs">${sum(prev, ledgerProfit)}</td></tr>
  </tbody>`;
}

/**
 * The three budgets the manager controls, all drawn from the bank balance: move money from
 * the transfer budget to wages (a year's worth per pound a week) or to scouting, and back.
 * `only: 'scout'` shows just the scouting line (for the Scouting screen).
 */
export function budgetPanel(ctx: Ctx, only?: 'scout'): string {
  const g = ctx.game;
  const c = userClub(g);
  const f = c.finance;
  const bill = wageBill(g, c.id);
  const opts = (id: string, steps: number[], fmt: (v: number) => string) => `<select class="cm" id="${id}">${steps.map((v, i) => `<option value="${v}"${i === Math.min(2, steps.length - 1) ? ' selected' : ''}>${fmt(v)}</option>`).join('')}</select>`;
  const scale = Math.max(f.wageBudget, 50_000);
  const wageSteps = [1e3, 2e3, 5e3, 10e3, 25e3, 50e3, 100e3, 250e3, 500e3].filter((v) => v <= scale * 0.25 || v <= 5e3);
  const scoutSteps = [25e3, 50e3, 100e3, 250e3, 500e3, 1e6, 2.5e6].filter((v) => v <= Math.max(f.transferBudget, f.scoutBudget ?? 0, 100e3));
  const scoutRow = `<div class="bud-row"><div class="bud-what"><b>Scouting</b> ${fmtMoney(f.scoutBudget ?? 0)} left for trips</div>
      <div class="bud-move">${opts('bud-scout-amt', scoutSteps, fmtMoney)}<button class="btn small" data-act="bud-scout" data-dir="1" ${f.transferBudget <= 0 ? 'disabled' : ''}>Transfers → Scouting</button><button class="btn small ghost" data-act="bud-scout" data-dir="-1" ${(f.scoutBudget ?? 0) <= 0 ? 'disabled' : ''}>Scouting → Transfers</button></div></div>`;
  if (only === 'scout') return `<div class="budgets compact">${scoutRow}</div>`;
  const cap = wageCap(g, c);
  return `<div class="sub-head">Budgets</div><div class="budgets">
    <p class="small-note">All three come out of the ${fmtMoney(f.balance)} in the bank. The board raise the wage budget as the balance grows (sales, prize money), ${cap > f.wageBudget ? `up to what the ${c.leagueId === 'ENG' ? 'PSR rules' : 'squad cost rules'} allow: about ${fmtWage(niceWage(cap))} for you.` : `but you're already at the limit the ${c.leagueId === 'ENG' ? 'PSR rules' : 'squad cost rules'} allow, so it can't go higher for now.`} Moving money to wages costs a year of the weekly amount (${fmtWage(10e3)} = ${fmtMoney(10e3 * WAGE_WEEKS)} of transfer budget).</p>
    <div class="bud-row"><div class="bud-what"><b>Transfers</b> ${fmtMoney(f.transferBudget)}</div></div>
    <div class="bud-row"><div class="bud-what"><b>Wages</b> ${fmtWage(f.wageBudget)} · paying ${fmtWage(bill)}${f.wageShift ? ` <span class="small-note">(${f.wageShift > 0 ? '+' : '−'}${fmtWage(Math.abs(f.wageShift))} moved by you)</span>` : ''}</div>
      <div class="bud-move">${opts('bud-wage-amt', wageSteps, (v) => `${fmtWage(v)} (${fmtMoney(v * WAGE_WEEKS)})`)}<button class="btn small" data-act="bud-wage" data-dir="1" ${f.transferBudget <= 0 ? 'disabled' : ''}>Transfers → Wages</button><button class="btn small ghost" data-act="bud-wage" data-dir="-1" ${f.wageBudget <= bill ? 'disabled' : ''}>Wages → Transfers</button></div></div>
    ${scoutRow}
  </div>`;
}

export function financesScreen(ctx: Ctx): string {
  const g = ctx.game;
  const c = userClub(g);
  const f = c.finance;
  const bill = wageBill(g, c.id);
  const rule = spendingRule(g, c);
  const bar = (used: number, warn: boolean) => `<span class="meter"><i style="width:${Math.min(100, used * 100)}%" class="${warn ? 'bad' : used > 0.85 ? 'warn' : ''}"></i></span>`;
  const cards = `<div class="fin-cards">
    <div class="fin-card"><span>Bank balance</span><b class="${f.balance < 0 ? 'neg' : ''}">${fmtMoney(f.balance)}</b></div>
    <div class="fin-card"><span>Transfer budget</span><b>${fmtMoney(f.transferBudget)}</b><small>80% of sale fees are added back</small></div>
    <div class="fin-card"><span>Wage bill</span><b>${fmtWage(bill)}</b>${bar(bill / f.wageBudget, bill > f.wageBudget)}<small>Budget ${fmtWage(f.wageBudget)} · ${fmtMoney(bill * 52)} a year</small></div>
    <div class="fin-card"><span>${esc(rule.name)}</span><b class="${rule.ok ? '' : 'neg'}">${rule.ok ? 'Within the rules' : 'Over the limit'}</b>${bar(rule.used, !rule.ok)}<small>${esc(rule.text)}</small></div>
  </div>`;
  const top = c.playerIds.map((id) => g.players[id]).sort((a, b) => b.wage - a.wage).slice(0, 10);
  const earners = top.map((p) => `<tr><td>${playerLink(p)}</td><td class="n">${fmtWage(p.wage)}</td><td class="n">${p.loan ? 'loan' : p.contractEnd}</td></tr>`).join('');
  const hist = f.history.slice().reverse().map((h) => `<tr><td>${h.season}/${String((h.season + 1) % 100).padStart(2, '0')}</td><td class="n">${fmtMoney(h.revenue)}</td><td class="n ${h.profit < 0 ? 'neg' : ''}">${fmtMoney(h.profit)}</td></tr>`).join('');
  const est = expectedRevenue(g, c);
  const body = `${cards}
    ${budgetPanel(ctx)}
    <div class="fin-grid">
      <div><div class="sub-head">This season <span class="small-note">(so far)</span></div>
        <div class="scroll"><table class="grid compact ledger"><thead><tr><th></th><th class="n">${g.season}/${String((g.season + 1) % 100).padStart(2, '0')}</th><th class="n hide-xs">Last season</th></tr></thead>${ledgerRows(f.ledger, f.lastLedger)}</table></div>
        <p class="pad small-note">Expected revenue this season: about ${fmtMoney(est)} (TV ${fmtMoney(f.tvShare)} plus merit money, gates at ${fmtMoney(f.ticketPrice)} a ticket, commercial ${fmtMoney(f.commercial)}). TV and commercial money arrive monthly; merit money at the end of the season. Figures are Touchline's estimates, in pounds.</p>
      </div>
      <div>
        <div class="sub-head">Top earners</div><div class="scroll"><table class="grid compact"><thead><tr><th>Player</th><th class="n">Wage</th><th class="n">Until</th></tr></thead><tbody>${earners}</tbody></table></div>
        <div class="sub-head">Recent seasons</div><div class="scroll"><table class="grid compact"><thead><tr><th>Season</th><th class="n">Revenue</th><th class="n">Profit</th></tr></thead><tbody>${hist}</tbody></table></div>
        ${f.deduction ? `<p class="pad neg"><b>${f.deduction}-point deduction</b> this season for breaking PSR.</p>` : ''}
      </div>
    </div>`;
  return panel(c, 'Finances', body, `<span class="strip-meta">${compLink(g, c.leagueId)}</span>`);
}

/* ───────────────────────── Actions ───────────────────────── */

const num = (id: string) => Number((document.getElementById(id) as HTMLInputElement | null)?.value ?? NaN);

function reply(ctx: Ctx, r: Offer | string): void {
  // Talks still open show their latest message inside the form instead.
  ctx.ui.dealMsg = typeof r === 'string' ? r : r.status === 'accepted' || r.status === 'countered' || r.status === 'terms' ? null : r.note ?? null;
  ctx.ui.deal = null;
  ctx.save();
  ctx.render();
}

/** Run a deal-closing action only after the manager confirms it in a dialog. */
function confirmed(describe: (ctx: Ctx, el: HTMLElement) => ConfirmSpec | null, run: Action): Action {
  return (ctx, el) => {
    const spec = describe(ctx, el);
    if (!spec) return run(ctx, el); // nothing valid to confirm: let the action report why
    confirmModal(spec, () => run(ctx, el));
  };
}

const nameOf = (g: GameState, id: number): string => (g.players[id] ? fullName(g.players[id]) : 'the player');

export const marketActions: Record<string, Action> = {
  'bud-wage': (ctx, el) => {
    const amt = num('bud-wage-amt') * Number(el.dataset.dir);
    const err = shiftTransferToWages(ctx.game, userClub(ctx.game), amt);
    ctx.toast(err ?? (amt > 0 ? `Wage budget up ${fmtWage(amt)} a week` : `Transfer budget up ${fmtMoney(-amt * WAGE_WEEKS)}`));
    if (!err) ctx.save();
    ctx.render();
  },
  'bud-scout': (ctx, el) => {
    const amt = num('bud-scout-amt') * Number(el.dataset.dir);
    const err = shiftTransferToScouting(userClub(ctx.game), amt);
    ctx.toast(err ?? (amt > 0 ? `Scouting budget up ${fmtMoney(amt)}` : `Transfer budget up ${fmtMoney(-amt)}`));
    if (!err) ctx.save();
    ctx.render();
  },
  'tf-tab': (ctx, el) => { ctx.ui.transferTab = el.dataset.t as 'search'; ctx.render(); },
  'tf-listed-kind': (ctx, el) => { ctx.ui.listedKind = el.dataset.k as 'all'; ctx.render(); },
  'tf-sort': (ctx, el) => { ctx.ui.tf = { ...DEFAULT_TF, ...ctx.ui.tf, sort: el.dataset.k as 'value' }; ctx.ui.tfPage = 0; ctx.render(); },
  'tf-page': (ctx, el) => {
    ctx.ui.tfPage = Math.max(0, Number(el.dataset.p) || 0);
    ctx.render();
    document.querySelector('.tf-pager')?.scrollIntoView({ block: 'nearest' });
  },
  'tf-attr-add': (ctx) => {
    const tf = { ...DEFAULT_TF, ...ctx.ui.tf };
    const used = new Set((tf.attrs ?? []).map(([k]) => k));
    const next = (['pace', 'passing', 'finishing', 'tackling', 'decisions', 'technique', 'strength', 'stamina'] as string[]).find((k) => !used.has(k)) ?? 'pace';
    ctx.ui.tf = { ...tf, attrs: [...(tf.attrs ?? []), [next, 12] as [string, number]].slice(0, 5) };
    ctx.ui.tfPage = 0;
    ctx.render();
  },
  'tf-attr-del': (ctx, el) => {
    const tf = { ...DEFAULT_TF, ...ctx.ui.tf };
    const i = Number(el.dataset.i);
    ctx.ui.tf = { ...tf, attrs: (tf.attrs ?? []).filter((_, j) => j !== i), sort: tf.sort.startsWith('a:') ? 'value' : tf.sort };
    ctx.ui.tfPage = 0;
    ctx.render();
  },
  'tf-attr-clear': (ctx) => {
    const tf = { ...DEFAULT_TF, ...ctx.ui.tf };
    ctx.ui.tf = { ...tf, attrs: [], sort: tf.sort.startsWith('a:') ? 'value' : tf.sort };
    ctx.ui.tfPage = 0;
    ctx.render();
  },
  'tf-league': (ctx, el) => { ctx.ui.compId = el.dataset.c === 'all' ? undefined : el.dataset.c; ctx.render(); },
  'deal-open': (ctx, el) => { ctx.ui.deal = el.dataset.d as 'bid'; ctx.ui.dealMsg = null; ctx.render(); },
  'deal-close': (ctx) => { ctx.ui.deal = null; ctx.render(); },
  'bid-submit': (ctx, el) => {
    const fee = Math.round(num('deal-fee') * M);
    if (!(fee >= 0)) return ctx.toast('Enter a fee in millions.');
    reply(ctx, makeBid(ctx.game, Number(el.dataset.id), fee));
  },
  'loan-submit': (ctx, el) => {
    const share = num('deal-share');
    const opt = num('deal-option');
    reply(ctx, makeLoanBid(ctx.game, Number(el.dataset.id), share, opt > 0 ? Math.round(opt * M) : null));
  },
  'counter-accept': confirmed((ctx, el) => {
    const o = ctx.game.offers.find((x) => x.id === Number(el.dataset.id));
    if (!o?.counterFee) return null;
    return { title: 'Confirm signing', lines: [`Pay ${fmtMoney(o.counterFee)} to ${club(ctx.game, o.sellerId!).name} for ${nameOf(ctx.game, o.playerId)}?`, 'Personal terms come next.'], ok: 'Yes, agree the fee' };
  }, (ctx, el) => reply(ctx, acceptCounter(ctx.game, Number(el.dataset.id)))),
  'loan-counter': confirmed((ctx, el) => {
    const o = ctx.game.offers.find((x) => x.id === Number(el.dataset.id));
    if (!o) return null;
    return { title: 'Confirm loan', lines: [`Take ${nameOf(ctx.game, o.playerId)} on loan${el.dataset.opt === '1' && o.counterFee ? ` with an option to buy for ${fmtMoney(o.counterFee)}` : ''}?`], ok: 'Yes, go ahead' };
  }, (ctx, el) => reply(ctx, acceptLoanCounter(ctx.game, Number(el.dataset.id), el.dataset.opt === '1'))),
  // Offering terms commits nothing: his yes comes back for a final confirmation ('deal-sign').
  'terms-offer': (ctx, el) => {
    const wage = Math.round(num('deal-wage') * 1000);
    const years = num('deal-years');
    if (!(wage > 0)) return ctx.toast('Enter a weekly wage in thousands.');
    const clause = (document.getElementById('deal-clause') as HTMLSelectElement | null)?.value ?? defaultClause(userClub(ctx.game));
    reply(ctx, proposeTerms(ctx.game, Number(el.dataset.id), wage, years, clause));
  },
  approach: (ctx, el) => reply(ctx, approachFreeAgent(ctx.game, Number(el.dataset.id))),
  precontract: (ctx, el) => reply(ctx, approachPreContract(ctx.game, Number(el.dataset.id))),
  'deal-sign': confirmed((ctx, el) => {
    const g = ctx.game;
    const o = g.offers.find((x) => x.id === Number(el.dataset.id));
    if (!o?.agreed || o.wage === undefined) return null;
    const me = userClub(g);
    const bill = wageBill(g, me.id);
    if (o.kind === 'precontract') {
      return {
        title: 'Sign the pre-contract?',
        lines: [
          `${nameOf(g, o.playerId)} joins you on a free transfer on 1 July, when his contract with ${club(g, o.sellerId).name} ends.`,
          `${fmtWage(o.wage)} for ${o.years} year${o.years === 1 ? '' : 's'}, release clause: ${o.clauseFee ? fmtMoney(o.clauseFee) : 'none'}.`,
          'A pre-contract is binding: neither side can back out.',
        ],
        ok: 'Yes, sign it',
      };
    }
    return {
      title: 'Confirm signing',
      lines: [
        o.fee ? `Sign ${nameOf(g, o.playerId)} from ${club(g, o.sellerId).name} for ${fmtMoney(o.fee)}?` : `Sign ${nameOf(g, o.playerId)} on a free transfer?`,
        `${fmtWage(o.wage)} for ${o.years} year${o.years === 1 ? '' : 's'}, release clause: ${o.clauseFee ? fmtMoney(o.clauseFee) : 'none'}.`,
        ...(o.fee ? [`Your transfer budget goes from ${fmtMoney(me.finance.transferBudget)} to ${fmtMoney(me.finance.transferBudget - o.fee)}.`] : []),
        `Your wage bill goes from ${fmtWage(bill)} to ${fmtWage(bill + o.wage)} (budget ${fmtWage(me.finance.wageBudget)}).`,
        ...(o.fee && !windowOpen(g) ? ['The window is shut, so he joins the day it opens.'] : []),
      ],
      ok: 'Yes, sign him',
    };
  }, (ctx, el) => reply(ctx, confirmSigning(ctx.game, Number(el.dataset.id)))),
  'loan-confirm': confirmed((ctx, el) => {
    const g = ctx.game;
    const o = g.offers.find((x) => x.id === Number(el.dataset.id));
    const p = o ? g.players[o.playerId] : null;
    if (!o?.agreed || o.kind !== 'loan' || !p) return null;
    const me = userClub(g);
    const bill = wageBill(g, me.id);
    const cost = niceWage(p.wage * (o.wageShare ?? 1));
    return {
      title: 'Confirm loan',
      lines: [
        `Take ${nameOf(g, o.playerId)} on loan from ${club(g, o.sellerId).name} until the end of the season?`,
        `You pay ${Math.round((o.wageShare ?? 1) * 100)}% of his wage: ${fmtWage(cost)}. Your wage bill goes from ${fmtWage(bill)} to ${fmtWage(bill + cost)} (budget ${fmtWage(me.finance.wageBudget)}).`,
        ...(o.optionFee ? [`You can make it permanent for ${fmtMoney(o.optionFee)}.`] : []),
        ...(o.recall ? [`${club(g, o.sellerId).name} can recall him in the January window.`] : []),
        ...(!windowOpen(g) ? ['The window is shut, so he joins the day it opens.'] : []),
      ],
      ok: 'Yes, take him',
    };
  }, (ctx, el) => reply(ctx, confirmLoan(ctx.game, Number(el.dataset.id)))),
  'terms-reopen': (ctx, el) => { reopenTerms(ctx.game, Number(el.dataset.id)); ctx.save(); ctx.render(); },
  'offer-withdraw': (ctx, el) => { withdrawOffer(ctx.game, Number(el.dataset.id)); ctx.ui.dealMsg = 'Talks called off.'; ctx.save(); ctx.render(); },
  'renew-offer': (ctx, el) => {
    const id = Number(el.dataset.id);
    const clause = (document.getElementById('deal-clause') as HTMLSelectElement | null)?.value ?? 'keep';
    const r = offerRenewal(ctx.game, id, Math.round(num('deal-wage') * 1000), num('deal-years'), clause);
    ctx.ui.dealMsg = r.message;
    // Keep his terms on the form for the next try: the wage he asked for, the years and clause chosen.
    const asked = r.message.match(/wants £([\d.,]+)(k|m)?/);
    const wantK = asked ? Number(asked[1].replace(/,/g, '')) * (asked[2] === 'm' ? 1000 : asked[2] === 'k' ? 1 : 0.001) : num('deal-wage');
    ctx.ui.renewDraft = r.ok ? null : { id, wage: Math.ceil(wantK * 10) / 10, years: num('deal-years'), clause };
    if (r.ok) ctx.ui.deal = null;
    ctx.save();
    ctx.render();
  },
  list: (ctx, el) => {
    const p = ctx.game.players[Number(el.dataset.id)];
    const l = el.dataset.l as 'transfer' | 'loan';
    setListed(ctx.game, p.id, p.listed === l ? null : l);
    ctx.ui.dealMsg = p.listed ? `${p.lastName} is now ${p.listed === 'transfer' ? 'on the transfer list' : 'available for loan'}. Offers will come in while the window is open.` : `${p.lastName} is off the list.`;
    ctx.save();
    ctx.render();
  },
  'exercise-option': confirmed((ctx, el) => {
    const p = ctx.game.players[Number(el.dataset.id)];
    if (!p?.loan || p.loan.optionFee === null) return null;
    return { title: 'Confirm permanent signing', lines: [`Buy ${fullName(p)} for ${fmtMoney(p.loan.optionFee)}?`], ok: 'Yes, sign him' };
  }, (ctx, el) => {
    const err = exerciseOption(ctx.game, Number(el.dataset.id));
    ctx.ui.dealMsg = err ?? 'Signed permanently.';
    ctx.save();
    ctx.render();
  }),
  release: (ctx, el) => {
    const p = ctx.game.players[Number(el.dataset.id)];
    const n = p ? fullName(p) : 'Player';
    const err = releaseToFree(ctx.game, Number(el.dataset.id));
    ctx.ui.confirm = null;
    if (err) {
      ctx.toast(err);
      ctx.render();
      return;
    }
    ctx.toast(`${n} ${p?.clubId === null ? 'released' : 'sent back'}`);
    ctx.save();
    ctx.go('squad', { confirm: null });
  },
  'bid-accept': confirmed((ctx, el) => {
    const o = ctx.game.offers.find((x) => x.id === Number(el.dataset.id));
    if (!o) return null;
    const who = club(ctx.game, o.buyerId).name;
    const what = o.kind === 'loan' ? `loan him to ${who}${o.wageShare !== undefined ? ` (they pay ${Math.round(o.wageShare * 100)}% of his wages)` : ''}` : `sell him to ${who} for ${o.fee ? fmtMoney(o.fee) : 'nothing'}`;
    return { title: o.kind === 'loan' ? 'Confirm loan out' : 'Confirm sale', lines: [`${nameOf(ctx.game, o.playerId)}: ${what}?`, 'This can\'t be undone once the deal goes through.'], ok: 'Yes, accept the offer' };
  }, (ctx, el) => { ctx.toast(respondToBid(ctx.game, Number(el.dataset.id), 'accept')); ctx.save(); ctx.render(); }),
  'bid-accept-recall': (ctx, el) => { ctx.toast(respondToBid(ctx.game, Number(el.dataset.id), 'accept-recall')); ctx.save(); ctx.render(); },
  'loan-recall': confirmed((ctx, el) => {
    const p = ctx.game.players[Number(el.dataset.id)];
    if (!p?.loan) return null;
    return { title: 'Recall him from loan?', lines: [`${fullName(p)} comes back from ${club(ctx.game, p.clubId!).name} straight away.`], ok: 'Recall him' };
  }, (ctx, el) => { const err = recallLoan(ctx.game, Number(el.dataset.id)); ctx.toast(err ?? 'He is back with you.'); ctx.save(); ctx.render(); }),
  'bid-reject': (ctx, el) => { ctx.toast(respondToBid(ctx.game, Number(el.dataset.id), 'reject')); ctx.save(); ctx.render(); },
  'bid-counter': confirmed((ctx, el) => {
    const id = Number(el.dataset.id);
    const o = ctx.game.offers.find((x) => x.id === id);
    const fee = Math.round(num(`counter-${id}`) * M);
    // Only ask when the buyer would actually meet the price: that is when the sale would go through.
    if (!o || o.status !== 'pending' || !(fee >= 0) || !counterAccepted(ctx.game, id, fee)) return null;
    const who = club(ctx.game, o.buyerId).name;
    return { title: 'Confirm sale', lines: [`${who} will meet your price. Sell ${nameOf(ctx.game, o.playerId)} to them for ${fmtMoney(fee)}?`, 'This can\'t be undone once the deal goes through.'], ok: 'Yes, complete the sale' };
  }, (ctx, el) => {
    const id = Number(el.dataset.id);
    ctx.toast(respondToBid(ctx.game, id, 'counter', Math.round(num(`counter-${id}`) * M)));
    ctx.save();
    ctx.render();
  }),
  'news-link': (ctx, el) => {
    const screen = el.dataset.s as Screen;
    const extra: Record<string, unknown> = {};
    if (el.dataset.p) extra.playerId = Number(el.dataset.p);
    if (screen === 'transfers' && el.dataset.t) extra.transferTab = el.dataset.t;
    if (screen === 'squad' && el.dataset.t) extra.squadView = el.dataset.t;
    if (screen === 'scouting' && el.dataset.t) extra.scoutTab = el.dataset.t;
    if (screen === 'club' && el.dataset.t) extra.clubTab = el.dataset.t;
    if (screen === 'stats' && el.dataset.t) extra.statsTab = el.dataset.t;
    if (screen === 'intl' && el.dataset.t) extra.intlTab = el.dataset.t;
    ctx.go(screen, extra);
  },
  'squad-view': (ctx, el) => { ctx.ui.squadView = el.dataset.v as 'overview'; ctx.render(); },
};

export const marketChangeActions: Record<string, (ctx: Ctx, el: HTMLSelectElement) => void> = {
  tf: (ctx, el) => {
    const key = el.dataset.key as keyof NonNullable<Ctx['ui']['tf']>;
    const cur = { ...DEFAULT_TF, ...ctx.ui.tf } as Record<string, unknown>;
    cur[key] = key === 'maxValue' ? Number(el.value) : key === 'maxAge' ? Math.max(0, Math.min(45, Math.floor(Number(el.value)) || 0)) : key === 'natural' ? (el as unknown as HTMLInputElement).checked : el.value;
    ctx.ui.tf = cur as NonNullable<Ctx['ui']['tf']>;
    ctx.ui.tfPage = 0;
    ctx.render();
  },
  'tf-attr': (ctx, el) => {
    const tf = { ...DEFAULT_TF, ...ctx.ui.tf };
    const i = Number(el.dataset.i);
    ctx.ui.tf = { ...tf, attrs: (tf.attrs ?? []).map((x, j) => (j === i ? [el.value, x[1]] as [string, number] : x)) };
    ctx.ui.tfPage = 0;
    ctx.render();
  },
  'tf-attr-min': (ctx, el) => {
    const tf = { ...DEFAULT_TF, ...ctx.ui.tf };
    const i = Number(el.dataset.i);
    ctx.ui.tf = { ...tf, attrs: (tf.attrs ?? []).map((x, j) => (j === i ? [x[0], Number(el.value)] as [string, number] : x)) };
    ctx.ui.tfPage = 0;
    ctx.render();
  },
};
