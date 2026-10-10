import { newSigningSetback } from './training.js';
import { rememberFormer } from './scouting.js';
import { isExtPlayer } from './ext.js';
import {
  clubWage, contractYears, fmtMoney, fmtWage, M, niceMoney, niceWage, playerValue, spendingRule, squadCost, wageBill,
  yearsLeft, expectedRevenue, SQUAD_COST_LIMIT, refreshWageBudget,
} from './finance.js';
import { addNews, club, dateOf, seasonOver, userClub } from './game.js';
import { COUNTRY_NAMES, leagueCountry } from './levels.js';
import { assignSquadNumbers } from './generate.js';
import { clamp, type Rng } from './rng.js';
import { autoPickXI, available, getFormation, resolveLineup, slotRating } from './tactics.js';
import type { Club, GameState, Offer, Player, Pos, TransferRecord } from './types.js';

/**
 * The transfer market: windows, bids and counter-bids, personal terms, release clauses,
 * loans, contract renewals and expiries, free agents, and the AI clubs' own business.
 */

export const MAX_SQUAD = 32;
export const MIN_SQUAD = 16;
/** Share of a sale the board adds back to the transfer budget. */
const SALE_REINVEST = 0.8;

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();

/* ───────────────────────── Windows ───────────────────────── */

/** The summer window opens on 15 June and runs to 1 September; the winter window runs through January to 2 February. */
export function windowOpenOn(season: number, day: number): boolean {
  const d = dateOf(season, day);
  const m = d.getUTCMonth();
  const dd = d.getUTCDate();
  return (m === 5 && dd >= 15) || m === 6 || m === 7 || (m === 8 && dd <= 1) || m === 0 || (m === 1 && dd <= 2);
}

/** The summer window (when loans can carry a January recall clause). */
export function summerWindow(state: GameState): boolean {
  const m = dateOf(state.season, state.day).getUTCMonth();
  return windowOpen(state) && m >= 5 && m <= 8;
}

/** The January window (when recall clauses can be used). */
export function januaryWindow(state: GameState): boolean {
  const m = dateOf(state.season, state.day).getUTCMonth();
  return windowOpen(state) && m <= 1;
}

/** A fixed 0–1 roll for a decision about one player, so asking twice gets the same answer. */
function settled(...keys: number[]): number {
  let h = 2166136261;
  for (const k of keys) h = Math.imul(h ^ (k | 0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export function windowOpen(state: GameState): boolean {
  return windowOpenOn(state.season, state.day);
}

/** Days until the window shuts (if open) or opens (if shut). */
export function windowInfo(state: GameState): { open: boolean; name: string; untilDay: number } {
  const open = windowOpen(state);
  let d = state.day;
  while (d < 400 && windowOpenOn(state.season, d + 1) === open) d++;
  const name = dateOf(state.season, open ? state.day : d + 1).getUTCMonth() <= 1 ? 'January' : 'summer';
  return { open, name, untilDay: open ? d : d + 1 };
}

/* ───────────────────────── Valuation helpers ───────────────────────── */

export function valueOf(state: GameState, p: Player): number {
  const c = p.clubId ? club(state, p.clubId) : null;
  return playerValue(p, state.season, state.day, c?.leagueId ?? null);
}

/** Average ability of a club's best XI: the level of player it looks for. */
let levelCache: { key: string; map: Map<number, number> } = { key: '', map: new Map() };
export function clubLevel(state: GameState, c: Club): number {
  const key = `${state.seed}:${state.season}:${state.day}`;
  if (levelCache.key !== key) levelCache = { key, map: new Map() };
  const hit = levelCache.map.get(c.id);
  if (hit !== undefined) return hit;
  const xi = autoPickXI(c, state.players);
  const v = xi.reduce((s, id) => s + state.players[id].ca, 0) / Math.max(1, xi.length);
  levelCache.map.set(c.id, v);
  return v;
}

/** Where the player stands at his club: 0 key man, 1 regular, 2 squad player, 3 fringe. */
function standing(state: GameState, p: Player, c: Club): number {
  const squad = c.playerIds.map((id) => state.players[id]).sort((a, b) => b.ca - a.ca);
  const rank = squad.findIndex((x) => x.id === p.id);
  const xi = resolveLineup(c, state.players);
  if (xi.includes(p.id)) return rank <= 2 ? 0 : 1;
  return rank < 18 ? 2 : 3;
}

/** What a selling club wants for a player. */
export function askingPrice(state: GameState, p: Player, buyer: Club | null): number {
  const seller = club(state, p.clubId!);
  let ask = valueOf(state, p);
  const st = standing(state, p, seller);
  ask *= [1.6, 1.3, 1.05, 0.9][st];
  if (p.listed === 'transfer') ask *= 0.85;
  if (p.joined === state.season) ask *= 1.25;
  if (p.age <= 21 && p.pa >= 165) ask *= 1.25;
  if (buyer && buyer.leagueId === seller.leagueId && Math.abs(buyer.reputation - seller.reputation) <= 1.5) ask *= 1.1;
  if (seller.finance.balance < 0) ask *= 0.9;
  return niceMoney(ask);
}

/** Players won't drop far below their club's level unless they're older or going somewhere to play. */
function ambitionOk(state: GameState, p: Player, buyer: Club): boolean {
  // A player on loan is judged against the club that owns him.
  const ownerId = p.loan ? p.loan.parentId : p.clubId;
  if (!ownerId) return true;
  const owner = club(state, ownerId);
  const from = owner.reputation;
  if (buyer.reputation >= from - 1) return true;
  if (p.age >= 30 && buyer.reputation >= from - 3) return true;
  return standing(state, p, owner) >= 2 && buyer.reputation >= from - 3;
}

/** The wage a player asks to join (or stay at) a club. */
export function wageDemand(state: GameState, p: Player, c: Club): number {
  // Veterans take what they can get; younger players want a rise.
  const rise = p.age >= 33 ? 0.8 : p.age >= 31 ? 0.95 : p.clubId === c.id ? 1.1 : 1.15;
  const established = p.wage * rise;
  const target = clubWage(p, c);
  // A player moving up from a much lower wage (a lower-division breakout, say) hasn't the
  // standing to ask for the going rate yet: a big rise, up to four times what he earns, or
  // about a third of what the club pays someone of his ability, whichever is more. Free
  // agents and players renewing with their own club know their worth.
  const moving = p.clubId !== null && p.clubId !== c.id;
  const base = moving ? Math.max(established, Math.min(target, Math.max(established * 4, target * 0.3))) : Math.max(established, target);
  const from = p.clubId ? club(state, p.clubId).reputation : c.reputation;
  // Stepping down costs more.
  const step = c.reputation < from ? 1 + (from - c.reputation) * 0.08 : 1;
  return niceWage(base * step);
}

/**
 * Release clause choices when agreeing a contract. A player likes a way out: no clause costs
 * more in wages, a low one less. In Spain every contract must have one (by law).
 */
export interface ClauseChoice { key: string; label: string; fee: number | null; wage: number }

/**
 * How release clauses work in each country. Spain: every contract has one, by law. Portugal:
 * most do, and a player gives one up only for more money. Elsewhere they're the exception, so
 * no clause is the norm and costs nothing; a player who is given a way out takes a little less.
 */
type ClauseNorm = 'spain' | 'portugal' | 'rare';
export function clauseNorm(leagueId: string): ClauseNorm {
  return leagueId === 'ESP' || leagueId === 'ES2' ? 'spain' : leagueId === 'POR' || leagueId === 'PT2' ? 'portugal' : 'rare';
}

const CLAUSE_WAGE: Record<ClauseNorm, Record<string, number>> = {
  spain: { x5: 1.06, x3: 1.03, x2: 1, 'x1.5': 0.96 },
  portugal: { none: 1.12, x5: 1.05, x3: 1.02, x2: 1, 'x1.5': 0.96 },
  rare: { none: 1, x5: 0.99, x3: 0.97, x2: 0.95, 'x1.5': 0.92 },
};

/** The clause a new contract usually has in this league: the choice the form starts on. */
export function defaultClause(c: Club): string {
  return clauseNorm(c.leagueId) === 'rare' ? 'none' : 'x3';
}

export function clauseChoices(state: GameState, p: Player, c: Club, fee = 0): ClauseChoice[] {
  // Measured against what he's worth, or what was just paid for him if that's more.
  const value = Math.max(valueOf(state, p), fee, 250_000);
  const table = CLAUSE_WAGE[clauseNorm(c.leagueId)];
  const out: ClauseChoice[] = [];
  if (table.none !== undefined) out.push({ key: 'none', label: 'No release clause', fee: null, wage: table.none });
  for (const [k, mult] of [['x5', 5], ['x3', 3], ['x2', 2], ['x1.5', 1.5]] as const) {
    out.push({ key: k, label: `${fmtMoney(niceMoney(value * mult))} (${mult}x ${fee > valueOf(state, p) ? 'the fee' : 'his value'})`, fee: niceMoney(value * mult), wage: table[k] });
  }
  return out;
}

/** What his present clause is worth to him, on the same scale (for renewals). */
function currentClauseWage(state: GameState, p: Player, c: Club): number {
  const table = CLAUSE_WAGE[clauseNorm(c.leagueId)];
  if (!p.releaseClause) return table.none ?? table.x5;
  const ratio = p.releaseClause / Math.max(valueOf(state, p), 250_000);
  const near = ([['x5', 5], ['x3', 3], ['x2', 2], ['x1.5', 1.5]] as const).reduce((a, b) => (Math.abs(Math.log(b[1] / ratio)) < Math.abs(Math.log(a[1] / ratio)) ? b : a));
  return table[near[0]];
}

/** The clause he has now as a choice (kept on a renewal unless changed). */
function clauseWage(state: GameState, p: Player, c: Club, key: string | undefined, fee = 0): { fee: number | null | undefined; mult: number; changed: boolean } {
  // 'auto': whatever the move itself leaves (a signing from Spain gets a new clause, and so on).
  if (key === 'auto') return { fee: undefined, mult: 1, changed: false };
  if (!key || key === 'keep') return { fee: p.releaseClause, mult: 1, changed: false };
  const ch = clauseChoices(state, p, c, fee).find((x) => x.key === key);
  if (!ch) return { fee: p.releaseClause, mult: 1, changed: false };
  // On a renewal the price is the change from the clause he has now (giving up a way out costs more).
  const renewing = p.clubId === c.id;
  const mult = renewing ? ch.wage / currentClauseWage(state, p, c) : ch.wage;
  return { fee: ch.fee, mult: Math.max(mult, renewing && ch.fee === null && p.releaseClause ? 1.06 : 0), changed: true };
}

export function preferredYears(p: Player): number {
  return p.age <= 23 ? 5 : p.age <= 27 ? 4 : p.age <= 30 ? 3 : p.age <= 32 ? 2 : 1;
}

/* ───────────────────────── Checks for the manager ───────────────────────── */

/** Players counting towards the squad limit (academy players covering a summer tournament don't). */
export function squadCount(c: Club, players: Record<number, Player>): number {
  return c.playerIds.filter((id) => !players[id]?.cover).length;
}

/** Why a signing can't go ahead, or null if it can. */
export function signingBlocked(state: GameState, buyer: Club, fee: number, wage: number): string | null {
  const f = buyer.finance;
  if (fee > f.transferBudget) return `That's more than your transfer budget of ${fmtMoney(f.transferBudget)}.`;
  if (fee > Math.max(0, f.balance) + 20 * M) return 'The club can\'t raise that much cash.';
  if (squadCount(buyer, state.players) >= MAX_SQUAD) return `Your squad is full (${MAX_SQUAD} players). Sell or release someone first.`;
  if (wage && wageBill(state, buyer.id) + wage > f.wageBudget) return `His wages would take you over your wage budget of ${fmtWage(f.wageBudget)} (current bill ${fmtWage(wageBill(state, buyer.id))}).`;
  if (buyer.leagueId === 'ESP' && wage) {
    const after = (squadCost(state, buyer) + wage * 52 + fee / 4) / Math.max(1, expectedRevenue(state, buyer));
    if (after > SQUAD_COST_LIMIT) return `La Liga wouldn't register him: squad costs would be ${Math.round(after * 100)}% of revenue (limit ${Math.round(SQUAD_COST_LIMIT * 100)}%).`;
  }
  return null;
}

/* ───────────────────────── Moving players ───────────────────────── */

function recordMove(state: GameState, p: Player, fromId: number | null, toId: number | null, fee: number, kind: TransferRecord['kind']): void {
  state.transfers.push({ season: state.season, day: state.day, playerId: p.id, name: fullName(p), fromId, toId, fee, kind });
  // Anyone leaving the manager's club (a loan ending included) stays fully known.
  if (fromId !== null && fromId === state.userClubId) rememberFormer(state, p.id);
  if (toId !== null && toId === state.userClubId) newSigningSetback(state, club(state, toId));
}

function detach(state: GameState, p: Player): void {
  if (p.clubId === null) return;
  const c = club(state, p.clubId);
  c.playerIds = c.playerIds.filter((id) => id !== p.id);
  if (c.lineup?.includes(p.id)) c.lineup = null;
  if (c.runs) delete c.runs[p.id];
  if (c.bench) c.bench = c.bench.filter((id) => id !== p.id);
}

function attach(state: GameState, p: Player, c: Club): void {
  p.clubId = c.id;
  c.playerIds.push(p.id);
  p.squadNo = 0;
  assignSquadNumbers(c, state.players);
}

/** Money for a permanent move: the buyer pays, the seller books the profit over the player's remaining book value. */
function payFee(state: GameState, buyer: Club | null, seller: Club | null, p: Player, fee: number): void {
  if (buyer) {
    buyer.finance.balance -= fee;
    buyer.finance.ledger.purchases += fee;
    buyer.finance.transferBudget = Math.max(0, buyer.finance.transferBudget - fee);
  }
  if (seller) {
    seller.finance.balance += fee;
    seller.finance.ledger.sales += fee;
    seller.finance.ledger.saleProfit += fee - p.bookValue;
    seller.finance.transferBudget += niceMoney(fee * SALE_REINVEST);
    if (seller.id === state.userClubId) refreshWageBudget(state, seller);
  }
}

/** Complete a permanent transfer (or a free signing when there's no selling club). */
export function completeTransfer(state: GameState, p: Player, buyer: Club, fee: number, wage: number, years: number): void {
  const from = p.loan ? club(state, p.loan.parentId) : p.clubId ? club(state, p.clubId) : null;
  if (p.loan) {
    // Buying a player on loan from his parent club.
    p.loan = null;
  }
  payFee(state, buyer, from, p, fee);
  detach(state, p);
  for (const c of state.clubs) if (c.bench?.includes(p.id)) c.bench = c.bench.filter((id) => id !== p.id);
  attach(state, p, buyer);
  p.wage = niceWage(wage);
  p.contractEnd = contractEndFor(state, years);
  p.bookValue = fee;
  p.listed = null;
  p.preContract = null;
  p.joined = state.season;
  p.freeSince = undefined;
  p.morale = Math.min(100, p.morale + 10);
  // A new contract: the clause is whatever is usual where he's going (the manager's own signings
  // then take the clause agreed in the personal terms).
  const norm = clauseNorm(buyer.leagueId);
  if (norm === 'spain') p.releaseClause = niceMoney(Math.max(fee * 2, valueOf(state, p) * 3));
  else if (norm === 'portugal' && p.ca >= 115) p.releaseClause = niceMoney(Math.max(fee * 2, valueOf(state, p) * 3));
  else p.releaseClause = null;
  recordMove(state, p, from?.id ?? null, buyer.id, fee, from ? 'transfer' : 'free');
  for (const o of state.offers) if (o.playerId === p.id && (o.status === 'pending' || o.status === 'accepted' || o.status === 'countered')) o.status = 'expired';
}

/** A contract of `years` signed today runs to June of this year: the next June counts as one. */
export function contractEndFor(state: GameState, years: number): number {
  return state.season + years + (state.day >= 300 ? 1 : 0);
}

/** Complete a loan to the end of the season. */
export function completeLoan(state: GameState, p: Player, borrower: Club, wageShare: number, fee: number, optionFee: number | null, recall = false): void {
  const parent = club(state, p.clubId!);
  detach(state, p);
  attach(state, p, borrower);
  p.loan = { parentId: parent.id, wageShare, optionFee, recall: recall || undefined };
  p.listed = null;
  if (fee) {
    borrower.finance.balance -= fee;
    borrower.finance.ledger.loanFeesOut += fee;
    parent.finance.balance += fee;
    parent.finance.ledger.loanFeesIn += fee;
  }
  recordMove(state, p, parent.id, borrower.id, fee, 'loan');
  for (const o of state.offers) if (o.playerId === p.id && (o.status === 'pending' || o.status === 'accepted' || o.status === 'countered')) o.status = 'expired';
}

/** Send a loan player back to his parent club. */
export function endLoan(state: GameState, p: Player): void {
  if (!p.loan) return;
  const parent = club(state, p.loan.parentId);
  const from = p.clubId;
  detach(state, p);
  p.loan = null;
  attach(state, p, parent);
  recordMove(state, p, from, parent.id, 0, 'loan-end');
}

/** Release a player to the free-agent pool. */
export function makeFreeAgent(state: GameState, p: Player, record = true): void {
  const from = p.clubId;
  if (from !== null && from === state.userClubId) rememberFormer(state, p.id);
  if (p.loan) endLoan(state, p);
  detach(state, p);
  p.clubId = null;
  p.loan = null;
  p.listed = null;
  p.preContract = null;
  p.bookValue = 0;
  p.freeSince = state.day + state.season * 365;
  p.squadNo = 0;
  if (record) recordMove(state, p, from, null, 0, 'release');
}

/* ───────────────────────── The manager's bids ───────────────────────── */

function newOffer(state: GameState, o: Omit<Offer, 'id' | 'day' | 'season' | 'status'> & { status?: Offer['status'] }): Offer {
  const offer: Offer = { status: 'pending', ...o, id: state.nextOfferId++, day: state.day, season: state.season };
  state.offers.push(offer);
  return offer;
}

/** How many times this club has turned the manager down for this player this window. */
function rejections(state: GameState, playerId: number, buyerId: number): number {
  return state.offers.filter((o) => o.playerId === playerId && o.buyerId === buyerId && o.season === state.season && o.status === 'rejected' && state.day - o.day < 40).length;
}

/**
 * The manager bids for a player. The selling club answers straight away: accept, name its
 * price, or turn it down. A bid that meets a release clause can't be refused.
 */
export function makeBid(state: GameState, playerId: number, fee: number): Offer | string {
  const p = state.players[playerId];
  const me = userClub(state);
  if (!p || p.clubId === me.id) return 'He is already your player.';
  if (p.clubId === null) return 'He is a free agent: offer him a contract instead.';
  if (p.loan) return `He is on loan at ${club(state, p.clubId).name}. Bid to his parent club when the loan ends.`;
  const blocked = signingBlocked(state, me, fee, 0);
  if (blocked) return blocked;
  if (rejections(state, playerId, me.id) >= 3) return `${club(state, p.clubId).name} have broken off talks after three rejected bids.`;
  const seller = club(state, p.clubId);
  const offer = newOffer(state, { kind: 'transfer', playerId, buyerId: me.id, sellerId: seller.id, fee });
  if (p.releaseClause && fee >= p.releaseClause) {
    offer.status = 'accepted';
    offer.note = `Your bid meets his ${fmtMoney(p.releaseClause)} release clause, so ${seller.name} must let him talk to you.`;
    return offer;
  }
  if (!ambitionOk(state, p, me)) {
    offer.status = 'rejected';
    offer.note = `${seller.name} say ${p.lastName} has no interest in joining a club of your stature.`;
    return offer;
  }
  const ask = askingPrice(state, p, me);
  const key = standing(state, p, seller) === 0 && seller.reputation >= me.reputation + 1.5;
  if (key && fee < ask * 1.5) {
    offer.status = 'rejected';
    offer.note = `${seller.name} say ${p.lastName} is not for sale.`;
  } else if (fee >= ask) {
    offer.status = 'accepted';
    offer.note = `${seller.name} have accepted your offer of ${fmtMoney(fee)}. Agree personal terms with ${p.lastName} to complete the deal.`;
  } else if (fee >= ask * 0.72) {
    offer.status = 'countered';
    offer.counterFee = ask;
    offer.note = `${seller.name} want ${fmtMoney(ask)} for ${p.lastName}.`;
  } else {
    offer.status = 'rejected';
    offer.note = `${seller.name} have rejected your offer of ${fmtMoney(fee)} out of hand.`;
  }
  return offer;
}

/** Accept the selling club's counter-offer. */
export function acceptCounter(state: GameState, offerId: number): Offer | string {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o || o.status !== 'countered' || !o.counterFee) return 'That offer is no longer open.';
  const blocked = signingBlocked(state, userClub(state), o.counterFee, 0);
  if (blocked) return blocked;
  o.fee = o.counterFee;
  o.status = 'accepted';
  o.note = `${club(state, o.sellerId).name} accept ${fmtMoney(o.fee)}. Agree personal terms to complete the deal.`;
  return o;
}

/** Ask a club to loan you a player until the end of the season. */
export function makeLoanBid(state: GameState, playerId: number, wageShare: number, optionFee: number | null): Offer | string {
  const p = state.players[playerId];
  const me = userClub(state);
  if (!p || p.clubId === null || p.clubId === me.id) return 'You can only borrow players from other clubs.';
  if (p.loan) return 'He is already out on loan.';
  const seller = club(state, p.clubId);
  const wage = p.wage * wageShare;
  const blocked = signingBlocked(state, me, 0, wage);
  if (blocked) return blocked;
  const offer = newOffer(state, { kind: 'loan', playerId, buyerId: me.id, sellerId: seller.id, fee: 0, wageShare, optionFee });
  const st = standing(state, p, seller);
  const minShare = seller.reputation > me.reputation ? 0.75 : 0.5;
  if (st <= 1 && !(p.listed === 'loan')) {
    offer.status = 'rejected';
    offer.note = `${seller.name} won't loan out ${p.lastName}: he's part of their first team.`;
  } else if (!ambitionOk(state, p, me) && p.age > 23) {
    offer.status = 'rejected';
    offer.note = `${p.lastName} doesn't want to join you on loan.`;
  } else if (wageShare < minShare) {
    offer.status = 'rejected';
    offer.note = `${seller.name} want you to pay at least ${Math.round(minShare * 100)}% of his wages.`;
  } else if (optionFee !== null && !ambitionOk(state, p, me)) {
    // An option to buy is a permanent move in waiting: he has to be willing to make it.
    offer.status = 'countered';
    offer.counterFee = undefined;
    offer.note = `${p.lastName} would come on loan for the experience, but won't agree to an option to buy: he doesn't see his future at a club of your stature.`;
  } else if (optionFee !== null && optionFee < valueOf(state, p) * 1.1) {
    offer.status = 'countered';
    offer.counterFee = niceMoney(valueOf(state, p) * 1.2);
    offer.note = `${seller.name} will agree the loan with an option to buy at ${fmtMoney(offer.counterFee)}, or without an option.`;
  } else {
    // Over the summer, parent clubs often keep the right to call a youngster back in January.
    const recall = summerWindow(state) && !optionFee && settled(p.id, state.season, 71) < (p.age <= 21 ? 0.5 : 0.25);
    offer.recall = recall;
    // Agreed, but not done: the manager gets a final say before the loan goes through.
    offer.status = 'accepted';
    offer.agreed = true;
    offer.note = `${seller.name} agree to loan you ${p.lastName}${optionFee ? ` with an option to buy for ${fmtMoney(optionFee)}` : ''}${recall ? ', with a clause to recall him in the January window' : ''}. Confirm to complete the loan.`;
  }
  return offer;
}

/** The final go-ahead for an agreed loan: he joins now, or the day the window opens. */
export function confirmLoan(state: GameState, offerId: number): Offer | string {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o || o.kind !== 'loan' || o.status !== 'accepted' || !o.agreed) return 'There is no loan to confirm.';
  const p = state.players[o.playerId];
  const me = userClub(state);
  const seller = club(state, o.sellerId);
  if (!p || p.clubId !== o.sellerId || p.loan) {
    o.status = 'collapsed';
    o.note = p?.loan ? `Too late: ${p.lastName} has gone out on loan elsewhere.` : p?.clubId ? `Too late: ${p.lastName} has joined ${club(state, p.clubId).name}.` : 'He is no longer available.';
    return o;
  }
  const share = o.wageShare ?? 1;
  const blocked = signingBlocked(state, me, 0, p.wage * share);
  if (blocked) return blocked;
  const optionFee = o.optionFee ?? null;
  const recall = !!o.recall;
  if (windowOpen(state)) {
    completeLoan(state, p, me, share, 0, optionFee, recall);
    o.status = 'done';
    o.note = `${fullName(p)} joins on loan until the end of the season${recall ? `; ${seller.name} can recall him in January` : ''}.`;
    addNews(state, { kind: 'transfer', title: `${fullName(p)} joins on loan`, body: `${fullName(p)} has joined ${me.name} on loan from ${seller.name} until the end of the season. You pay ${Math.round(share * 100)}% of his ${fmtWage(p.wage)} wage.${optionFee ? ` You can make the move permanent for ${fmtMoney(optionFee)}.` : ''}${recall ? ` ${seller.name} have kept the right to recall him in the January window.` : ''}` });
  } else {
    o.status = 'terms';
    o.note = `The loan of ${p.lastName} is agreed. The move will go through when the window opens.`;
  }
  return o;
}

/** Accept a loan counter: with the club's option price, or without an option at all. */
export function acceptLoanCounter(state: GameState, offerId: number, withOption: boolean): Offer | string {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o || o.kind !== 'loan' || o.status !== 'countered') return 'That offer is no longer open.';
  o.status = 'withdrawn';
  const r = makeLoanBid(state, o.playerId, o.wageShare ?? 1, withOption ? o.counterFee ?? null : null);
  // The manager has already confirmed the counter-offer: no second confirmation.
  return typeof r !== 'string' && r.status === 'accepted' && r.agreed ? confirmLoan(state, r.id) : r;
}

/**
 * Personal terms: the manager offers a weekly wage and contract length. The player accepts,
 * says what he wants, or walks away after three rounds.
 */
export function proposeTerms(state: GameState, offerId: number, wage: number, years: number, clause = 'auto'): Offer | string {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o || o.status !== 'accepted') return 'There is nothing to agree yet.';
  const p = state.players[o.playerId];
  const me = userClub(state);
  const cl = clauseWage(state, p, me, clause, o.fee);
  // A player coming on a free knows there's no fee to pay, and asks for some of it in wages.
  const demand = niceWage(wageDemand(state, p, me) * cl.mult * (o.kind === 'precontract' ? 1.1 : 1));
  o.demand = { wage: demand, years: preferredYears(p) };
  o.clause = clause;
  o.agreed = false;
  o.talks = (o.talks ?? 0) + 1;
  const blocked = o.kind === 'precontract' ? preContractBlocked(state, me, wage) : signingBlocked(state, me, o.fee, wage);
  if (blocked) return blocked;
  // Shorter or longer deals than he wants cost a little more.
  const need = demand * (1 + Math.abs(years - preferredYears(p)) * 0.04);
  if (wage >= need) {
    o.wage = niceWage(wage);
    o.years = years;
    o.clauseFee = cl.fee;
    // His yes isn't the signature: the manager gets a final say before the fee and wages are committed.
    o.agreed = true;
    o.note = o.kind === 'precontract'
      ? `${p.lastName} has agreed terms: ${fmtWage(o.wage)} for ${years} year${years > 1 ? 's' : ''} from 1 July. Confirm to sign the pre-contract.`
      : `${p.lastName} has agreed terms: ${fmtWage(o.wage)} for ${years} year${years > 1 ? 's' : ''}. Confirm to sign him.`;
  } else if (o.talks >= 3 && wage < need * 0.9) {
    o.status = 'collapsed';
    o.note = `${p.lastName} has walked away from talks. He wanted ${fmtWage(niceWage(need))}.`;
  } else {
    o.note = `${p.lastName} wants ${fmtWage(niceWage(need))} over ${years} year${years > 1 ? 's' : ''}${years !== preferredYears(p) ? ` (he'd prefer ${preferredYears(p)})` : ''}.`;
  }
  return o;
}

function finishUserSigning(state: GameState, o: Offer): void {
  const p = state.players[o.playerId];
  const me = userClub(state);
  const from = p.clubId ? club(state, p.clubId).name : null;
  completeTransfer(state, p, me, o.fee, o.wage!, o.years!);
  // The release clause agreed in the personal terms.
  if (o.clauseFee !== undefined) p.releaseClause = o.clauseFee;
  o.status = 'done';
  o.note = `${fullName(p)} has signed for ${me.name}.`;
  addNews(state, {
    kind: 'transfer',
    title: `${fullName(p)} signs${o.fee ? ` for ${fmtMoney(o.fee)}` : ' on a free'}`,
    body: `${fullName(p)} has joined ${me.name}${from ? ` from ${from}` : ' as a free agent'}${o.fee ? ` for ${fmtMoney(o.fee)}` : ''} on a ${o.years}-year contract worth ${fmtWage(o.wage!)}.`,
    link: { label: 'View player', screen: 'player', playerId: p.id },
  });
}

/**
 * The final go-ahead once a player has agreed terms: the fee (if any) is paid and he signs on what
 * was agreed. A fee deal agreed while the window is shut goes through the day it opens; free agents
 * sign at any time.
 */
export function confirmSigning(state: GameState, offerId: number): Offer | string {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o || o.status !== 'accepted' || !o.agreed || o.wage === undefined || o.years === undefined) return 'There is no agreement to confirm.';
  if (o.kind === 'precontract') return signPreContract(state, o);
  const p = state.players[o.playerId];
  const me = userClub(state);
  const from = o.sellerId || null;
  if (!p || p.clubId !== from) {
    o.status = 'collapsed';
    o.note = p?.clubId ? `Too late: ${p.lastName} has signed for ${club(state, p.clubId).name}.` : 'He is no longer available.';
    return o;
  }
  if (squadCount(me, state.players) >= MAX_SQUAD) return `Your squad is full (${MAX_SQUAD} players).`;
  const blocked = signingBlocked(state, me, o.fee, o.wage);
  if (blocked) return blocked;
  if (!from || windowOpen(state)) {
    finishUserSigning(state, o);
  } else {
    o.status = 'terms';
    o.note = `${p.lastName} has agreed terms. The transfer will go through when the window opens.`;
  }
  return o;
}

/** Back to the table after a player has agreed: the agreement is off until he accepts again. */
export function reopenTerms(state: GameState, offerId: number): void {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o || o.status !== 'accepted' || !o.agreed) return;
  o.agreed = false;
  o.note = 'Make him a new offer.';
}

/** Approach a free agent: there's no fee, so talks go straight to personal terms. */
export function approachFreeAgent(state: GameState, playerId: number): Offer | string {
  const p = state.players[playerId];
  const me = userClub(state);
  if (!p || p.clubId !== null) return 'He is not a free agent.';
  if (squadCount(me, state.players) >= MAX_SQUAD) return `Your squad is full (${MAX_SQUAD} players).`;
  const existing = state.offers.find((o) => o.playerId === playerId && o.buyerId === me.id && o.status === 'accepted');
  if (existing) return existing;
  return newOffer(state, { kind: 'transfer', playerId, buyerId: me.id, sellerId: 0, fee: 0, status: 'accepted', note: `${fullName(p)} is willing to talk. Offer him a contract.` });
}

/* ───────────────────────── Pre-contracts ───────────────────────── */

/**
 * Countries whose clubs may sign a pre-contract with a player at another club in the same country
 * once he is in the last six months of his deal. In England a club may only talk to a player at
 * another English club in the last month of his contract; clubs abroad may talk to him from 1 January
 * (FIFA's six-month rule). In the game the last month is June, which begins once the season is over.
 */
const DOMESTIC_PRE_CONTRACT = new Set(['ESP', 'GER', 'ITA', 'FRA', 'POR']);

/** Last six months of a contract that ends this June: from 1 January (or once the season is over). */
function lastSixMonths(state: GameState): boolean {
  const d = dateOf(state.season, state.day);
  return seasonOver(state) || (d.getUTCFullYear() === state.season + 1 && d.getUTCMonth() <= 5);
}

/** Last month: June, which in the game starts once the season is over. */
function lastMonth(state: GameState): boolean {
  const d = dateOf(state.season, state.day);
  return seasonOver(state) || (d.getUTCFullYear() === state.season + 1 && d.getUTCMonth() === 5);
}

/** May a club in `buyerLeague` agree a pre-contract with a player whose club plays in `ownerLeague`, today? */
export function preContractAllowed(state: GameState, ownerLeague: string, buyerLeague: string): boolean {
  const from = leagueCountry(ownerLeague);
  const to = leagueCountry(buyerLeague);
  if (from !== to || DOMESTIC_PRE_CONTRACT.has(from)) return lastSixMonths(state);
  return lastMonth(state);
}

export interface PreContractStatus {
  /** He can sign one with the manager's club today. */
  open: boolean;
  /** Why not, or what the rules say, in a sentence. */
  why: string;
}

/**
 * Whether the manager can offer this player a pre-contract, and if not, when he can. Null when it
 * doesn't apply (his contract doesn't end this season, he's the manager's own player, a free agent, or
 * at a club outside the six leagues).
 */
export function preContractStatus(state: GameState, p: Player): PreContractStatus | null {
  const me = userClub(state);
  const ownerId = p.loan ? p.loan.parentId : p.clubId;
  if (!ownerId || ownerId === me.id || isExtPlayer(p) || p.contractEnd > state.season + 1) return null;
  const owner = club(state, ownerId);
  if (p.preContract === me.id) return { open: false, why: `He has signed a pre-contract and joins you on 1 July.` };
  if (p.preContract) return { open: false, why: `He has already agreed to join ${club(state, p.preContract).name} when his contract ends.` };
  const from = leagueCountry(owner.leagueId);
  const domestic = from === leagueCountry(me.leagueId);
  if (preContractAllowed(state, owner.leagueId, me.leagueId)) {
    return { open: true, why: `His contract with ${owner.name} ends in June and he hasn't agreed a new one, so he is free to agree to join you on a free transfer in the summer.` };
  }
  if (domestic && !DOMESTIC_PRE_CONTRACT.has(from)) {
    return { open: false, why: `His contract ends in June. English clubs may only talk to a player at another English club in the last month of his contract: here, once the season is over.` };
  }
  return { open: false, why: `His contract ends in June. From 1 January, his last six months, he can agree a pre-contract with ${domestic ? `a club in ${COUNTRY_NAMES[from] ?? from}` : 'a club abroad'}, yours included.` };
}

/** Next season's squad and wage bill at the manager's club, with the players who have agreed to join. */
function nextSeasonSquad(state: GameState, me: Club): { count: number; wages: number } {
  let count = 0;
  let wages = 0;
  for (const id of me.playerIds) {
    const p = state.players[id];
    if (!p || p.loan || p.cover || p.preContract || p.contractEnd <= state.season + 1) continue;
    count++;
    wages += p.wage;
  }
  for (const p of Object.values(state.players)) {
    if (p.preContract !== me.id) continue;
    count++;
    wages += p.preTerms?.wage ?? p.wage;
  }
  return { count, wages };
}

/** Why a pre-contract can't be agreed on these terms, or null. */
export function preContractBlocked(state: GameState, me: Club, wage: number): string | null {
  const next = nextSeasonSquad(state, me);
  if (next.count >= MAX_SQUAD) return `Next season's squad would be over ${MAX_SQUAD}: you already have ${next.count} players for it.`;
  if (wage && next.wages + wage > me.finance.wageBudget) return `His wages would take next season's bill (${fmtWage(next.wages)}, counting the players staying and those joining) over your wage budget of ${fmtWage(me.finance.wageBudget)}.`;
  return null;
}

/**
 * Approach a player in the last months of his contract. His club has to be told before any talks
 * (the rules say in writing), but has no say: it's personal terms straight away, and no fee.
 */
export function approachPreContract(state: GameState, playerId: number): Offer | string {
  const p = state.players[playerId];
  const me = userClub(state);
  if (!p) return 'That player no longer exists.';
  const st = preContractStatus(state, p);
  if (!st) return 'His contract doesn\'t end this season.';
  if (!st.open) return st.why;
  const existing = state.offers.find((o) => o.playerId === playerId && o.buyerId === me.id && o.kind === 'precontract' && o.status === 'accepted');
  if (existing) return existing;
  const ownerId = p.loan ? p.loan.parentId : p.clubId!;
  const owner = club(state, ownerId);
  const blocked = preContractBlocked(state, me, 0);
  if (blocked) return blocked;
  if (!ambitionOk(state, p, me)) return `${p.lastName} isn't interested in joining a club of your stature.`;
  return newOffer(state, {
    kind: 'precontract', playerId, buyerId: me.id, sellerId: ownerId, fee: 0, status: 'accepted',
    note: `${owner.name} have been told in writing that you want to talk to him, as the rules require. ${p.lastName} is willing to listen: offer him a contract that starts on 1 July.`,
  });
}

/** The pre-contract is signed: he joins on 1 July on the terms agreed. It can't be undone. */
function signPreContract(state: GameState, o: Offer): Offer | string {
  const p = state.players[o.playerId];
  const me = userClub(state);
  const st = p ? preContractStatus(state, p) : null;
  if (!p || !st || !st.open) {
    o.status = 'collapsed';
    o.note = p ? st?.why ?? `${p.lastName} has signed a new contract with his club.` : 'He is no longer available.';
    return o;
  }
  const blocked = preContractBlocked(state, me, o.wage!);
  if (blocked) return blocked;
  const owner = club(state, o.sellerId);
  p.preContract = me.id;
  p.preTerms = { wage: niceWage(o.wage!), years: o.years!, clauseFee: o.clauseFee ?? null };
  o.status = 'done';
  o.note = `${fullName(p)} has signed a pre-contract. He joins you on a free transfer on 1 July.`;
  addNews(state, {
    kind: 'transfer',
    title: `${fullName(p)} agrees to join you in the summer`,
    body: `${fullName(p)} has signed a pre-contract with ${me.name}. He will join on a free transfer on 1 July, when his contract with ${owner.name} ends, on ${fmtWage(p.preTerms.wage)} for ${o.years} year${o.years === 1 ? '' : 's'}. ${owner.name} have been told.`,
    link: { label: 'View player', screen: 'player', playerId: p.id },
  });
  return o;
}

export function withdrawOffer(state: GameState, offerId: number): void {
  const o = state.offers.find((x) => x.id === offerId);
  if (o && ['pending', 'accepted', 'countered', 'terms'].includes(o.status)) o.status = 'withdrawn';
}

/** Turn a loan into a permanent move by paying the agreed option fee. */
export function exerciseOption(state: GameState, playerId: number): string | null {
  const p = state.players[playerId];
  const me = userClub(state);
  if (!p?.loan || p.clubId !== me.id || p.loan.optionFee === null) return 'There is no option to buy.';
  const fee = p.loan.optionFee;
  if (!ambitionOk(state, p, me)) return `${p.lastName} won't sign permanently: he doesn't want to stay at a club of your stature.`;
  const wage = wageDemand(state, p, me);
  const blocked = signingBlocked(state, me, fee, Math.max(0, wage - p.wage * p.loan.wageShare));
  if (blocked) return blocked;
  completeTransfer(state, p, me, fee, wage, preferredYears(p));
  addNews(state, { kind: 'transfer', title: `${fullName(p)} signs permanently`, body: `${me.name} have taken up the option to sign ${fullName(p)} for ${fmtMoney(fee)}. He signs a ${preferredYears(p)}-year deal worth ${fmtWage(wage)}.` });
  return null;
}

/* ───────────────────────── The manager's own players ───────────────────────── */

export function setListed(state: GameState, playerId: number, listed: Player['listed']): void {
  const p = state.players[playerId];
  if (!p || p.clubId !== state.userClubId || p.loan) return;
  if (listed && !p.listed) p.morale = Math.max(0, p.morale - 8);
  p.listed = listed;
}

/** Offer one of your players a new contract. */
export function offerRenewal(state: GameState, playerId: number, wage: number, years: number, clause = 'keep'): { ok: boolean; message: string } {
  const p = state.players[playerId];
  const me = userClub(state);
  if (!p || p.clubId !== me.id || p.loan) return { ok: false, message: 'You can only renew your own players\' contracts.' };
  if (p.preContract) return { ok: false, message: `${p.lastName} has already agreed to join ${club(state, p.preContract).name}.` };
  // A player tied up for years can be offered a new deal (a pay rise, a new clause), but he won't give up years he has.
  if (contractEndFor(state, years) < p.contractEnd) return { ok: false, message: `${p.lastName} won't sign for less time than he has left: his contract runs to June ${p.contractEnd}.` };
  const cl = clauseWage(state, p, me, clause);
  const left = yearsLeft(p, state.season, state.day);
  let demand = niceWage(wageDemand(state, p, me) * cl.mult * (left < 1 ? 1.05 : 1) * (1 + Math.abs(years - preferredYears(p)) * 0.04));
  // Mid-contract he holds the cards: he doesn't need a new deal, so he almost always wants a rise
  // on what he already earns (unless he's paid far more than he's worth).
  const midContract = left >= 1;
  if (midContract && p.wage < clubWage(p, me) * 1.6) demand = Math.max(demand, niceWage(p.wage * cl.mult * (left >= 2 ? 1.12 : 1.08)));
  if (wage < demand) {
    const why = midContract ? ` He's under contract to June ${p.contractEnd}, so he'd want a rise to sign again.` : '';
    return { ok: false, message: `${p.lastName} wants ${fmtWage(demand)} over ${years} year${years > 1 ? 's' : ''}${cl.changed ? (cl.fee ? ` with a ${fmtMoney(cl.fee)} release clause` : ' with no release clause') : ''}.${why}` };
  }
  if (wageBill(state, me.id) - p.wage + wage > me.finance.wageBudget) return { ok: false, message: `That would take you over your wage budget of ${fmtWage(me.finance.wageBudget)}.` };
  p.wage = niceWage(wage);
  p.contractEnd = contractEndFor(state, years);
  p.morale = Math.min(100, p.morale + 12);
  if (cl.changed) p.releaseClause = cl.fee ?? null;
  else if (me.leagueId === 'ESP') p.releaseClause = niceMoney(Math.max(p.releaseClause ?? 0, valueOf(state, p) * 3));
  addNews(state, { kind: 'transfer', title: `${fullName(p)} signs a new contract`, body: `${fullName(p)} has signed a new ${years}-year contract worth ${fmtWage(p.wage)}, running to June ${p.contractEnd}${p.releaseClause ? `, with a ${fmtMoney(p.releaseClause)} release clause` : ', with no release clause'}.` });
  return { ok: true, message: `${p.lastName} has signed a new contract to June ${p.contractEnd}.` };
}

/** Cost of releasing a player: half the wages left on his contract. */
export function severanceCost(state: GameState, p: Player): number {
  return niceMoney(p.wage * 52 * yearsLeft(p, state.season, state.day) * 0.5);
}

export function releaseToFree(state: GameState, playerId: number): string | null {
  const p = state.players[playerId];
  const me = userClub(state);
  if (!p || p.clubId !== me.id) return 'Not your player.';
  if (p.loan) {
    endLoan(state, p);
    return null;
  }
  if (me.playerIds.length <= MIN_SQUAD) return `You need at least ${MIN_SQUAD} players.`;
  const cost = severanceCost(state, p);
  me.finance.balance -= cost;
  me.finance.ledger.severance += cost;
  me.finance.ledger.amortisation += p.bookValue; // write off what's left of his fee
  makeFreeAgent(state, p);
  addNews(state, { kind: 'transfer', title: `${fullName(p)} released`, body: `${fullName(p)} has left ${me.name} by mutual consent. The pay-off cost ${fmtMoney(cost)}.` });
  return null;
}

/* ───────────────────────── Bids for the manager's players ───────────────────────── */

/** Would the buyer meet a counter-offer of this size? (Used to ask for a final confirmation first.) */
export function counterAccepted(state: GameState, offerId: number, counterFee: number): boolean {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o) return false;
  const buyer = club(state, o.buyerId);
  const want = niceMoney(counterFee);
  return want <= (o.limit ?? o.fee * 1.25) && want <= buyer.finance.transferBudget + o.fee * 0.3;
}

/** The manager's answer to a bid for one of his players. */
export function respondToBid(state: GameState, offerId: number, answer: 'accept' | 'accept-recall' | 'reject' | 'counter', counterFee?: number): string {
  const o = state.offers.find((x) => x.id === offerId);
  const me = userClub(state);
  if (!o || o.sellerId !== me.id || o.status !== 'pending') return 'That offer is no longer open.';
  const p = state.players[o.playerId];
  const buyer = club(state, o.buyerId);
  if (answer === 'reject') {
    if (p.releaseClause && o.fee >= p.releaseClause) return `${buyer.name} have met his release clause: you can't turn them down.`;
    o.status = 'rejected';
    o.note = 'You turned the offer down.';
    return `You rejected ${buyer.name}'s offer.`;
  }
  if (answer === 'counter') {
    const want = niceMoney(counterFee ?? 0);
    if (counterAccepted(state, offerId, want)) {
      o.fee = want;
    } else {
      o.status = 'withdrawn';
      o.note = `${buyer.name} weren't prepared to pay ${fmtMoney(want)} and have pulled out.`;
      return o.note;
    }
  }
  // Accepted: the buying club agrees terms with the player.
  if (o.kind === 'loan') {
    if (answer === 'accept-recall') {
      if (!summerWindow(state)) return 'A recall clause can only be agreed for a loan made in the summer.';
      // The borrower wants him for the season: young squad players they'll usually allow, a player
      // they'd build their team around, less often.
      const key = buyer.playerIds.length && clubLevel(state, buyer) <= p.ca - 5;
      const agree = settled(o.id, p.id, 113) < (p.age <= 21 ? 0.72 : 0.5) - (key ? 0.2 : 0);
      if (!agree) {
        o.recallRefused = true;
        o.note = `${buyer.name} won't agree to a January recall clause: they want ${p.lastName} for the whole season. Accept without it, or turn them down.`;
        return o.note;
      }
      o.recall = true;
    }
    completeLoanOut(state, o);
    return o.note ?? '';
  }
  const willing = buyer.reputation >= me.reputation - 1.5 || p.listed === 'transfer' || standing(state, p, me) >= 2;
  if (!willing) {
    o.status = 'collapsed';
    o.note = `${p.lastName} couldn't agree terms with ${buyer.name}, so he stays.`;
    return o.note;
  }
  if (!windowOpen(state)) {
    o.status = 'terms';
    o.note = `Fee agreed with ${buyer.name}. ${p.lastName} will leave when the window opens.`;
    return o.note;
  }
  sellToAi(state, o);
  return o.note ?? '';
}

function sellToAi(state: GameState, o: Offer): void {
  const p = state.players[o.playerId];
  const buyer = club(state, o.buyerId);
  const me = userClub(state);
  completeTransfer(state, p, buyer, o.fee, wageDemand(state, p, buyer), preferredYears(p));
  o.status = 'done';
  o.note = `${fullName(p)} has joined ${buyer.name} for ${fmtMoney(o.fee)}.`;
  addNews(state, { kind: 'transfer', title: `${fullName(p)} sold to ${buyer.name}`, body: `${fullName(p)} has left ${me.name} for ${buyer.name}. The fee of ${fmtMoney(o.fee)} goes into the bank, and ${fmtMoney(niceMoney(o.fee * SALE_REINVEST))} of it has been added to your transfer budget.` });
}

function completeLoanOut(state: GameState, o: Offer): void {
  const p = state.players[o.playerId];
  const buyer = club(state, o.buyerId);
  if (!windowOpen(state)) {
    o.status = 'terms';
    o.note = `${p.lastName} will join ${buyer.name} on loan when the window opens.`;
    return;
  }
  completeLoan(state, p, buyer, o.wageShare ?? 1, 0, o.optionFee ?? null, !!o.recall);
  o.status = 'done';
  o.note = `${fullName(p)} has joined ${buyer.name} on loan; they pay ${Math.round((o.wageShare ?? 1) * 100)}% of his wages.${o.recall ? ' You can recall him in the January window.' : ''}`;
  addNews(state, { kind: 'transfer', title: `${fullName(p)} loaned to ${buyer.name}`, body: o.note });
}

/* ───────────────────────── The AI market ───────────────────────── */

/** Which position a club most needs to strengthen: the weakest slot in its best XI. */
function needs(state: GameState, c: Club): { pos: Pos; ca: number; level: number } {
  const f = getFormation(c.tactics.formation);
  const xi = autoPickXI(c, state.players);
  const level = xi.reduce((s, id) => s + state.players[id].ca, 0) / Math.max(1, xi.length);
  let worst = 0;
  let worstScore = Infinity;
  xi.forEach((id, i) => {
    const p = state.players[id];
    const score = p.ca * (slotRating(p, f.slots[i]) / 20);
    if (score < worstScore) {
      worstScore = score;
      worst = i;
    }
  });
  // Thin on numbers somewhere? That wins.
  return { pos: f.slots[worst], ca: worstScore, level };
}

/** One AI club looks for a signing. Players at the manager's club turn into bids he must answer. */
function aiTryBuy(state: GameState, rng: Rng, c: Club, pool: Player[]): void {
  const f = c.finance;
  const need = needs(state, c);
  const lo = Math.max(need.ca + 3, need.level - 12);
  const hi = need.level + 14;
  const budget = f.transferBudget;
  const room = f.wageBudget - wageBill(state, c.id);
  const candidates: Player[] = [];
  for (let i = 0; i < 260 && candidates.length < 12; i++) {
    const p = pool[rng.int(0, pool.length - 1)];
    if (!p || p.clubId === c.id || p.loan || p.preContract || p.age > 32) continue;
    // Clubs don't sell players they've only just bought.
    if (p.clubId !== null && (p.joined >= state.season || (p.joined === state.season - 1 && rng.chance(0.6)))) continue;
    if ((p.pos[need.pos] ?? 0) < 16) continue;
    if (p.ca < lo || p.ca > hi) continue;
    if (p.clubId === null) {
      candidates.push(p);
      continue;
    }
    const seller = club(state, p.clubId);
    if (seller.reputation > c.reputation + 1.5) continue;
    if (!ambitionOk(state, p, c)) continue;
    if (valueOf(state, p) > budget * 1.05) continue;
    candidates.push(p);
  }
  if (!candidates.length) return;
  candidates.sort((a, b) => b.ca - a.ca + (a.age - b.age) * 0.5);
  const p = candidates[rng.int(0, Math.min(3, candidates.length - 1))];
  const wage = wageDemand(state, p, c);
  if (wage > room + wage * 0.15 && room < wage) return;
  if (p.clubId === null) {
    completeTransfer(state, p, c, 0, wage, contractYears(rng, p.age));
    return;
  }
  const seller = club(state, p.clubId);
  if (seller.id === state.userClubId) {
    bidForUserPlayer(state, rng, c, p, 1.0 + rng.next() * 0.3);
    return;
  }
  if (seller.playerIds.length <= 18) return;
  // Big clubs don't strengthen their direct domestic rivals.
  if (seller.leagueId === c.leagueId && seller.reputation >= 8.5 && c.reputation >= 8.5 && p.ca >= 145) return;
  const ask = askingPrice(state, p, c);
  if (ask > budget) return;
  // Key players rarely go, and only to bigger clubs.
  const st = standing(state, p, seller);
  const clause = p.releaseClause && ask >= p.releaseClause;
  if (!clause && st <= 1 && (c.reputation <= seller.reputation || rng.chance(st === 0 ? 0.85 : 0.5))) return;
  completeTransfer(state, p, c, ask, wage, contractYears(rng, p.age));
}

/** Days since the player joined his present club (a long time if it isn't on record). */
export function daysSinceJoined(state: GameState, p: Player): number {
  for (let i = state.transfers.length - 1; i >= 0; i--) {
    const t = state.transfers[i];
    if (t.playerId === p.id && t.toId === p.clubId && t.kind !== 'loan-end') return (state.season - t.season) * 365 + state.day - t.day;
  }
  return 9999;
}

/** An AI club makes a bid for one of the manager's players. */
function bidForUserPlayer(state: GameState, rng: Rng, buyer: Club, p: Player, factor: number): void {
  if (state.offers.some((o) => o.playerId === p.id && o.status === 'pending' && o.sellerId === state.userClubId)) return;
  if (state.offers.filter((o) => o.status === 'pending' && o.sellerId === state.userClubId).length >= 4) return;
  // A player who has only just arrived isn't for sale unless he's been listed.
  if (!p.listed && daysSinceJoined(state, p) < 90) return;
  const value = valueOf(state, p);
  let fee = niceMoney(value * factor);
  // A clause is met only when it's a bargain, by a bigger club, and not for a player who has
  // only just signed (clubs give a new man time to settle; nobody bids for him in the first months).
  const joinedAgo = daysSinceJoined(state, p);
  const clause = p.releaseClause && p.releaseClause <= buyer.finance.transferBudget && p.releaseClause <= value * 1.6
    && buyer.reputation > club(state, p.clubId!).reputation && joinedAgo > 180 && rng.chance(0.3) ? p.releaseClause : null;
  if (clause) fee = clause;
  if (fee > buyer.finance.transferBudget) return;
  const o = newOffer(state, { kind: 'transfer', playerId: p.id, buyerId: buyer.id, sellerId: state.userClubId, fee });
  o.limit = niceMoney(fee * (1.12 + rng.next() * 0.25));
  const me = userClub(state);
  if (clause) {
    o.note = `${buyer.name} have met ${p.lastName}'s release clause of ${fmtMoney(clause)}.`;
    // The club can't refuse; it's up to the player.
    if (buyer.reputation >= me.reputation - 0.5 && rng.chance(0.75) && windowOpen(state)) {
      sellToAi(state, o);
      addNews(state, { kind: 'transfer', title: `${buyer.name} trigger ${p.lastName}'s release clause`, body: `${o.note} He has chosen to leave, and the deal is done.` });
    } else {
      o.status = 'collapsed';
      addNews(state, { kind: 'transfer', title: `${p.lastName} turns down ${buyer.name}`, body: `${o.note} He has decided to stay with ${me.name}.` });
    }
    return;
  }
  addNews(state, {
    kind: 'transfer',
    title: `${o.kind === 'loan' ? 'Loan' : 'Transfer'} offer for ${p.lastName}`,
    body: `${buyer.name} have offered ${fmtMoney(fee)} for ${fullName(p)} (valued at ${fmtMoney(value)}). Accept, reject or ask for more before the window shuts.`,
    link: { label: 'Answer the offer', screen: 'transfers', tab: 'offers' },
  });
}

function loanBidForUserPlayer(state: GameState, rng: Rng, p: Player): void {
  if (state.offers.some((o) => o.playerId === p.id && o.status === 'pending')) return;
  const me = userClub(state);
  const options = state.clubs.filter((c) => c.id !== me.id && c.reputation <= me.reputation && c.playerIds.length < 28 && clubLevel(state, c) <= p.ca + 12);
  if (!options.length) return;
  const buyer = rng.pick(options);
  const share = rng.pick([0.5, 0.75, 1, 1]);
  const o = newOffer(state, { kind: 'loan', playerId: p.id, buyerId: buyer.id, sellerId: me.id, fee: 0, wageShare: share, optionFee: null });
  o.limit = 0;
  addNews(state, {
    kind: 'transfer',
    title: `Loan offer for ${p.lastName}`,
    body: `${buyer.name} would like to take ${fullName(p)} on loan for the rest of the season, paying ${Math.round(share * 100)}% of his wages.`,
    link: { label: 'Answer the offer', screen: 'transfers', tab: 'offers' },
  });
}

/** Big clubs send promising youngsters out on loan to smaller ones where they'll play. */
function aiLoanOut(state: GameState, rng: Rng, c: Club): void {
  const xi = new Set(resolveLineup(c, state.players));
  const kids = c.playerIds.map((id) => state.players[id]).filter((p) => !p.loan && p.age <= 22 && !xi.has(p.id) && p.ca >= 85 && p.pa - p.ca >= 15 && available(p));
  if (!kids.length) return;
  const p = rng.pick(kids);
  const hosts = state.clubs.filter((h) => h.id !== c.id && h.id !== state.userClubId && h.reputation <= c.reputation - 1.5 && h.playerIds.length < 28 && clubLevel(state, h) <= p.ca + 8);
  if (!hosts.length) return;
  completeLoan(state, p, rng.pick(hosts), rng.pick([0.5, 0.75, 1]), 0, null, summerWindow(state) && rng.chance(0.35));
}

/** Use a recall clause: the player comes back from his loan now (January only). */
export function recallLoan(state: GameState, playerId: number): string | null {
  const p = state.players[playerId];
  if (!p?.loan || p.loan.parentId !== state.userClubId) return 'He is not out on loan from you.';
  if (!p.loan.recall) return 'His loan has no recall clause.';
  if (!januaryWindow(state)) return 'Loan players with a recall clause can only be called back in the January window.';
  const host = club(state, p.clubId!);
  endLoan(state, p);
  addNews(state, { kind: 'transfer', title: `${fullName(p)} recalled from loan`, body: `You have used the clause in ${fullName(p)}'s loan to bring him back from ${host.name}.` });
  return null;
}

/**
 * January: AI parent clubs decide whether to use their recall clauses, more often when the
 * player is hardly playing where he is or they're short at home.
 */
function aiRecalls(state: GameState, rng: Rng): void {
  for (const p of Object.values(state.players)) {
    if (!p.loan?.recall || p.loan.parentId === state.userClubId) continue;
    const parent = club(state, p.loan.parentId);
    const host = club(state, p.clubId!);
    const benched = p.stats.apps < 6;
    const shortAtHome = parent.playerIds.map((id) => state.players[id]).filter((x) => !x.loan && available(x)).length < 20;
    const chance = (benched ? 0.55 : 0.12) + (shortAtHome ? 0.25 : 0);
    if (!rng.chance(chance)) continue;
    const mine = host.id === state.userClubId;
    endLoan(state, p);
    if (mine) addNews(state, { kind: 'transfer', title: `${parent.name} recall ${fullName(p)}`, body: `${parent.name} have used the recall clause in ${fullName(p)}'s loan: he has gone back to them${benched ? ' after too few games with you' : ''}.` });
  }
}

/** Squads over the limit let their weakest players go. */
function aiTrim(state: GameState, c: Club): void {
  if (c.id === state.userClubId) return;
  while (squadCount(c, state.players) > 30) {
    const squad = c.playerIds.map((id) => state.players[id]).filter((p) => !p.loan && !p.cover).sort((a, b) => a.ca + (a.pa - a.ca) * 0.4 - (b.ca + (b.pa - b.ca) * 0.4));
    const p = squad[0];
    if (!p) break;
    makeFreeAgent(state, p);
  }
}

/**
 * One day of business: AI clubs buy, sell, loan and sign free agents; bids arrive for the
 * manager's players. `intensity` scales how busy the market is.
 */
export function marketDay(state: GameState, rng: Rng, intensity = 1): void {
  const pool = Object.values(state.players).filter((p) => !isExtPlayer(p));
  const me = state.userClubId;
  const deadline = windowInfo(state).untilDay - state.day <= 1;
  const busy = intensity * (deadline ? 2.5 : 1);
  for (const c of state.clubs) {
    if (c.id === me) continue;
    if (rng.chance(0.08 * busy)) aiTryBuy(state, rng, c, pool);
    if (rng.chance(0.012 * busy) && c.reputation >= 6) aiLoanOut(state, rng, c);
    if (squadCount(c, state.players) > 30) aiTrim(state, c);
  }
  // Bids for the manager's players.
  if (!me) return;
  const mine = userClub(state);
  for (const id of mine.playerIds) {
    const p = state.players[id];
    if (p.loan) continue;
    if (p.listed === 'transfer' && rng.chance(0.14 * busy)) {
      const value = valueOf(state, p);
      const buyers = state.clubs.filter((c) => c.id !== me && c.finance.transferBudget >= value * 0.8 && clubLevel(state, c) >= p.ca - 12 && clubLevel(state, c) <= p.ca + 10);
      if (buyers.length) bidForUserPlayer(state, rng, rng.pick(buyers), p, 0.75 + rng.next() * 0.35);
    } else if (p.listed === 'loan' && rng.chance(0.14 * busy)) {
      loanBidForUserPlayer(state, rng, p);
    }
  }
  // Now and then someone wants one of your best players.
  const best = mine.playerIds.map((id) => state.players[id]).filter((p) => !p.loan && !p.listed).sort((a, b) => b.ca - a.ca).slice(0, 7);
  for (const p of best) {
    if (!rng.chance(0.01 * busy)) continue;
    const value = valueOf(state, p);
    const buyers = state.clubs.filter((c) => c.id !== me && c.reputation >= mine.reputation - 0.5 && c.finance.transferBudget >= value && clubLevel(state, c) <= p.ca + 6);
    if (buyers.length) bidForUserPlayer(state, rng, rng.pick(buyers), p, 1 + rng.next() * 0.35);
  }
}

/** Deals agreed while the window was shut go through on the day it opens. */
function completeAgreedDeals(state: GameState): void {
  for (const o of state.offers) {
    if (o.status !== 'terms') continue;
    const p = state.players[o.playerId];
    if (!p) {
      o.status = 'collapsed';
      continue;
    }
    if (o.buyerId === state.userClubId) {
      if (o.kind === 'loan') {
        if (p.clubId !== o.sellerId) {
          o.status = 'collapsed';
          continue;
        }
        completeLoan(state, p, userClub(state), o.wageShare ?? 1, 0, o.optionFee ?? null, !!o.recall);
        o.status = 'done';
        addNews(state, { kind: 'transfer', title: `${fullName(p)} joins on loan`, body: `The window is open and ${fullName(p)} has joined you on loan.` });
      } else finishUserSigning(state, o);
    } else if (o.sellerId === state.userClubId) {
      if (o.kind === 'loan') completeLoanOut(state, o);
      else sellToAi(state, o);
    }
  }
}

/** Window closes: open offers lapse. */
function closeWindow(state: GameState): void {
  for (const o of state.offers) if (o.status === 'pending' || o.status === 'accepted' || o.status === 'countered') o.status = 'expired';
}

/**
 * Called for each new day. Handles the window opening and closing, the day's market, and
 * contract milestones in the new year.
 */
/** Tell the manager (once) which of his players have release clauses. */
export function clauseNotice(state: GameState): void {
  if (state.clauseNotice || !state.userClubId) return;
  state.clauseNotice = true;
  const me = userClub(state);
  const list = me.playerIds.map((id) => state.players[id]).filter((p) => p.releaseClause && !p.loan).sort((a, b) => (a.releaseClause ?? 0) - (b.releaseClause ?? 0));
  if (!list.length) return;
  addNews(state, {
    kind: 'transfer',
    title: `${list.length} of your players ${list.length > 1 ? 'have' : 'has a'} release clause${list.length > 1 ? 's' : ''}`,
    body: `Any club that bids the clause can talk to the player, and you can't turn the bid down: ${list.map((p) => `${fullName(p)} (${fmtMoney(p.releaseClause!)})`).join(', ')}. You can change or remove a clause when you offer a new contract (a player wants more wages to give up his way out).`,
    link: { label: 'Squad', screen: 'squad' },
  });
}

export function transferDay(state: GameState, rng: Rng): void {
  clauseNotice(state);
  const open = windowOpen(state);
  const wasOpen = windowOpenOn(state.season, state.day - 1);
  if (open && !wasOpen) {
    completeAgreedDeals(state);
    if (januaryWindow(state)) {
      aiRecalls(state, rng);
      const mine = Object.values(state.players).filter((p) => p.loan?.recall && p.loan.parentId === state.userClubId);
      if (mine.length) addNews(state, { kind: 'transfer', title: 'Recall clauses', body: `You can recall ${mine.map((p) => `${fullName(p)} (at ${club(state, p.clubId!).name})`).join(', ')} from loan until the window shuts. Open a player's page to bring him back.` });
    }
    aiListings(state);
    addNews(state, { kind: 'transfer', title: 'The transfer window is open', body: `The ${dateOf(state.season, state.day).getUTCMonth() <= 1 ? 'January' : 'summer'} window is open until ${dateOf(state.season, windowInfo(state).untilDay).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}. Players in the last six months of their contracts can now agree to join other clubs next summer.`, link: { label: 'Transfers', screen: 'transfers' } });
    contractWarnings(state);
  }
  if (!open && wasOpen) {
    closeWindow(state);
    addNews(state, { kind: 'transfer', title: 'The transfer window has closed', body: 'No more permanent transfers or loans until the window opens again. Free agents can still be signed.' });
  }
  // Squads in the first summer are already the real, finished ones, so the AI is quieter.
  if (open) marketDay(state, rng, state.day > 120 ? 0.4 : state.history.length === 0 ? 0.35 : state.day < 0 ? 0.35 : 1);
  // Free agents: clubs short of numbers pick them up any time.
  if (rng.chance(0.3)) {
    for (const c of state.clubs) {
      if (c.id === state.userClubId || c.playerIds.length >= 20) continue;
      const pool = Object.values(state.players).filter((p) => p.clubId === null && p.age <= 33).sort((a, b) => b.ca - a.ca).slice(0, 30);
      const p = pool.find((x) => x.ca <= clubLevel(state, c) + 5);
      if (p) completeTransfer(state, p, c, 0, wageDemand(state, p, c), contractYears(rng, p.age));
    }
  }
  // A scenario that releases a big club's players: the rest of the league moves for them.
  if (state.scenario && state.history.length === 0) freeAgentScramble(state, rng);
  // Pre-contracts: from February, players in the last months of their deals may agree to move on.
  const d = dateOf(state.season, state.day);
  if (d.getUTCMonth() === 1 && d.getUTCDate() === 3) preContracts(state, rng);
}

/**
 * After a big club is wound up (Flying Ants mode), its players are the best free agents there
 * have ever been. The other clubs go after them, within their wage budgets, from day one.
 */
function freeAgentScramble(state: GameState, rng: Rng): void {
  const pool = Object.values(state.players).filter((p) => p.clubId === null && p.ca >= 110 && !isExtPlayer(p));
  if (!pool.length) return;
  for (const c of state.clubs) if (c.id !== state.userClubId && rng.chance(0.08)) aiTryBuy(state, rng, c, pool);
}

/** Warn the manager about contracts running out this summer. */
export function contractWarnings(state: GameState): void {
  const me = userClub(state);
  const ending = me.playerIds.map((id) => state.players[id]).filter((p) => !p.loan && p.contractEnd <= state.season + 1 && !p.preContract);
  if (!ending.length) return;
  addNews(state, {
    kind: 'transfer',
    title: `${ending.length} contract${ending.length > 1 ? 's' : ''} running out`,
    body: `These players' contracts end in June ${state.season + 1}: ${ending.map((p) => `${fullName(p)} (${fmtWage(p.wage)})`).join(', ')}. Offer new deals or they'll leave on free transfers, and others may agree pre-contracts from February.`,
    link: { label: 'Squad contracts', screen: 'squad', tab: 'contracts' },
  });
}

/** Players in their final months agree to join other clubs on a free next summer. */
function preContracts(state: GameState, rng: Rng): void {
  const me = userClub(state);
  for (const p of Object.values(state.players)) {
    if (!p.clubId || isExtPlayer(p) || p.loan || p.preContract || p.contractEnd > state.season + 1 || p.age > 31 || p.ca < 120) continue;
    const c = club(state, p.clubId);
    if (c.id !== me.id && rng.chance(0.6)) {
      // Most AI clubs tie down the players they want.
      p.contractEnd += contractYears(rng, p.age);
      p.wage = niceWage(Math.max(p.wage, clubWage(p, c)));
      continue;
    }
    if (!rng.chance(c.id === me.id ? 0.35 : 0.3)) continue;
    // The same rules as for the manager: in February, an English club can't sign a player from another English club.
    const suitors = state.clubs.filter((x) => x.id !== c.id && x.id !== me.id && x.reputation >= c.reputation - 0.5 && clubLevel(state, x) <= p.ca + 8 && preContractAllowed(state, c.leagueId, x.leagueId));
    if (!suitors.length) continue;
    const to = rng.pick(suitors);
    p.preContract = to.id;
    if (c.id === me.id) {
      addNews(state, { kind: 'transfer', title: `${p.lastName} agrees to join ${to.name}`, body: `${fullName(p)} has signed a pre-contract with ${to.name} and will leave on a free transfer when his contract ends in June.` });
    }
  }
}

/**
 * The summer: loans end (with options taken up), pre-contracts go through, expiring
 * contracts are renewed or players leave, and the AI clubs do their summer business.
 */
export function summerContracts(state: GameState, rng: Rng, userNews: string[]): void {
  const me = userClub(state);
  // Loans: back to the parent, unless the borrower buys.
  for (const p of Object.values(state.players)) {
    if (!p.loan || !p.clubId) continue;
    const borrower = club(state, p.clubId);
    const opt = p.loan.optionFee;
    if (borrower.id !== me.id && opt !== null && opt <= borrower.finance.balance && standing(state, p, borrower) <= 1) {
      completeTransfer(state, p, borrower, opt, wageDemand(state, p, borrower), contractYears(rng, p.age));
      continue;
    }
    if (borrower.id === me.id) userNews.push(`${fullName(p)} has returned to ${club(state, p.loan.parentId).name} at the end of his loan.`);
    else if (p.loan.parentId === me.id) userNews.push(`${fullName(p)} is back from his loan at ${borrower.name}.`);
    endLoan(state, p);
  }
  // Contracts ending this summer.
  for (const p of Object.values(state.players)) {
    if (!p.clubId || p.contractEnd > state.season + 1) continue;
    const c = club(state, p.clubId);
    if (p.preContract) {
      const to = club(state, p.preContract);
      if (c.id === me.id) userNews.push(`${fullName(p)} has left for ${to.name} on a free transfer.`);
      const terms = p.preTerms;
      makeFreeAgent(state, p, false);
      completeTransfer(state, p, to, 0, terms?.wage ?? wageDemand(state, p, to), terms?.years ?? contractYears(rng, p.age));
      if (terms) {
        // The release clause agreed in the pre-contract.
        p.releaseClause = terms.clauseFee;
        if (to.id === me.id) userNews.push(`${fullName(p)} has joined from ${c.name} on a free transfer, as agreed in his pre-contract.`);
      }
      delete p.preTerms;
      continue;
    }
    if (c.id === me.id) {
      userNews.push(`${fullName(p)} has left on a free transfer after his contract ran out.`);
      makeFreeAgent(state, p);
      continue;
    }
    const keep = standing(state, p, c) <= 2 && p.age <= 33 ? 0.8 : p.age <= 23 && p.pa - p.ca >= 15 ? 0.7 : 0.25;
    if (rng.chance(keep)) {
      p.contractEnd = state.season + 1 + contractYears(rng, p.age + 1);
      p.wage = niceWage(Math.max(p.wage * 0.95, clubWage(p, c)));
    } else makeFreeAgent(state, p);
  }
  // Free agents who can't find a club retire.
  const now = state.season * 365 + state.day;
  for (const p of Object.values(state.players)) {
    if (p.clubId !== null) continue;
    if (p.age >= 34 || (p.freeSince !== undefined && now - p.freeSince > 330) || p.ca < 70) delete state.players[p.id];
  }
}

/** The AI clubs' pre-season business (June and July, played out in a burst). */
export function summerMarket(state: GameState, rng: Rng): void {
  const saveDay = state.day;
  for (let i = 0; i < 20; i++) marketDay(state, rng, 0.9);
  state.day = saveDay;
  // Nobody should be left short.
  for (const c of state.clubs) if (c.id !== state.userClubId) aiTrim(state, c);
}

/**
 * AI clubs put surplus players up for sale or loan: older fringe players on the transfer
 * list, young ones who aren't playing on the loan list. Refreshed when a window opens.
 */
export function aiListings(state: GameState): void {
  for (const c of state.clubs) {
    if (c.id === state.userClubId) continue;
    const squad = c.playerIds.map((id) => state.players[id]).filter((p) => !p.loan);
    const ranked = [...squad].sort((a, b) => b.ca - a.ca);
    for (const p of squad) {
      const rank = ranked.indexOf(p);
      p.listed = null;
      if (rank >= 20 && p.age >= 24) p.listed = 'transfer';
      else if (rank >= 16 && p.age <= 21 && p.pa - p.ca >= 10) p.listed = 'loan';
      else if (squad.length > 27 && rank >= 22) p.listed = 'transfer';
    }
  }
}

/** Tidy up old offers and transfer records so saves stay small. */
export function pruneMarket(state: GameState): void {
  state.offers = state.offers.filter((o) => o.season === state.season && (['pending', 'accepted', 'countered', 'terms'].includes(o.status) || state.day - o.day < 45));
  // Every club's moves for the last five seasons (for the club screens); the manager's own club's for good.
  state.transfers = state.transfers.filter((t) => t.season >= state.season - 4 || t.fromId === state.userClubId || t.toId === state.userClubId);
}

/** Wage and value summary used by several screens. */
export function contractSummary(state: GameState, p: Player): string {
  const clause = p.releaseClause ? ` · release clause ${fmtMoney(p.releaseClause)}` : '';
  return `${fmtWage(p.wage)} · contract to June ${p.contractEnd}${clause}`;
}

export { clamp, spendingRule };
