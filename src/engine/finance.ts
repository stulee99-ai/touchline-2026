import { clamp, type Rng } from './rng.js';
import type { Club, Finance, GameState, Ledger, Player } from './types.js';

/**
 * Club money and player valuations. All figures are in pounds sterling, including for the
 * clubs outside England (converted at about €1 = £0.85). Everything here is Touchline's own
 * estimate. Club revenues are anchored to Deloitte's Football Money League 2026 for the 20
 * biggest earners (minus an allowance for European prize money, which comes with the cups)
 * and to a model of TV, matchday and commercial income for everyone else.
 */

export const M = 1_000_000;
/** Non-wage running costs as a share of revenue. */
export const OPERATING_SHARE = 0.4;

interface LeagueMoney {
  /** Equal TV share at reputation 5, change per reputation point, floor. */
  tvBase: number;
  tvRep: number;
  tvMin: number;
  /** Merit payment for finishing top; last place gets a twentieth of it. */
  merit: number;
  /** Average ticket price at a mid-sized club. */
  ticket: number;
  commercial: number;
  /** Relative wage levels. */
  wages: number;
  /** Relative transfer values. */
  values: number;
  /** Target wages-to-revenue ratio range. */
  wageRatio: [number, number];
  /** Cash reserves scale. */
  cash: number;
  /** Second tiers: how much of the Premier League-sized parachute a club relegated from the top flight gets. */
  parachute?: number;
}

export const LEAGUE_MONEY: Record<string, LeagueMoney> = {
  ENG: { tvBase: 102 * M, tvRep: 3.5 * M, tvMin: 95 * M, merit: 56 * M, ticket: 48, commercial: 1.0, wages: 1.0, values: 1.15, wageRatio: [0.44, 0.6], cash: 1.0 },
  ESP: { tvBase: 48 * M, tvRep: 12 * M, tvMin: 32 * M, merit: 24 * M, ticket: 36, commercial: 1.0, wages: 0.72, values: 1.0, wageRatio: [0.44, 0.62], cash: 0.6 },
  GER: { tvBase: 44 * M, tvRep: 8 * M, tvMin: 28 * M, merit: 24 * M, ticket: 30, commercial: 0.95, wages: 0.7, values: 0.95, wageRatio: [0.42, 0.55], cash: 0.7 },
  ITA: { tvBase: 36 * M, tvRep: 8 * M, tvMin: 24 * M, merit: 22 * M, ticket: 30, commercial: 0.8, wages: 0.65, values: 0.95, wageRatio: [0.5, 0.66], cash: 0.45 },
  FRA: { tvBase: 14 * M, tvRep: 5 * M, tvMin: 8 * M, merit: 16 * M, ticket: 28, commercial: 0.75, wages: 0.6, values: 0.9, wageRatio: [0.52, 0.7], cash: 0.4 },
  POR: { tvBase: 9 * M, tvRep: 3.5 * M, tvMin: 3 * M, merit: 7 * M, ticket: 18, commercial: 0.55, wages: 0.32, values: 0.8, wageRatio: [0.48, 0.66], cash: 0.3 },
  // The English pyramid below the Premier League: small TV money, wages that swallow most of the revenue.
  EN2: { tvBase: 8 * M, tvRep: 1.2 * M, tvMin: 5 * M, merit: 3 * M, ticket: 27, commercial: 0.5, wages: 1.0, values: 0.9, wageRatio: [0.62, 0.9], cash: 0.5, parachute: 1 },
  // Second divisions elsewhere in Europe.
  ES2: { tvBase: 5 * M, tvRep: 0.9 * M, tvMin: 3 * M, merit: 1.5 * M, ticket: 22, commercial: 0.35, wages: 0.55, values: 0.75, wageRatio: [0.55, 0.8], cash: 0.3, parachute: 0.3 },
  DE2: { tvBase: 9 * M, tvRep: 1.2 * M, tvMin: 6 * M, merit: 2 * M, ticket: 24, commercial: 0.5, wages: 0.55, values: 0.8, wageRatio: [0.5, 0.72], cash: 0.4, parachute: 0.35 },
  IT2: { tvBase: 4 * M, tvRep: 0.7 * M, tvMin: 2.5 * M, merit: 1 * M, ticket: 20, commercial: 0.3, wages: 0.45, values: 0.7, wageRatio: [0.6, 0.85], cash: 0.25, parachute: 0.3 },
  FR2: { tvBase: 3.5 * M, tvRep: 0.6 * M, tvMin: 2 * M, merit: 1 * M, ticket: 17, commercial: 0.25, wages: 0.4, values: 0.65, wageRatio: [0.6, 0.85], cash: 0.2, parachute: 0.25 },
  PT2: { tvBase: 1.2 * M, tvRep: 0.25 * M, tvMin: 0.7 * M, merit: 0.3 * M, ticket: 10, commercial: 0.1, wages: 0.18, values: 0.5, wageRatio: [0.6, 0.85], cash: 0.1, parachute: 0.1 },
  EN3: { tvBase: 1.8 * M, tvRep: 0.25 * M, tvMin: 1.2 * M, merit: 0.6 * M, ticket: 21, commercial: 0.2, wages: 0.6, values: 0.65, wageRatio: [0.6, 0.85], cash: 0.25 },
  EN4: { tvBase: 1.2 * M, tvRep: 0.15 * M, tvMin: 0.8 * M, merit: 0.3 * M, ticket: 18, commercial: 0.12, wages: 0.5, values: 0.5, wageRatio: [0.6, 0.85], cash: 0.15 },
};

/** Parachute payments for a club relegated from the Premier League, by seasons left (3 = the first season down). */
export const PARACHUTE: Record<number, number> = { 3: 45 * M, 2: 36 * M, 1: 18 * M };

/** The parachute a club in this (second-tier) league gets with this many seasons left. */
export function parachuteFor(leagueId: string, seasonsLeft: number): number {
  return (PARACHUTE[seasonsLeft] ?? 0) * (LEAGUE_MONEY[leagueId]?.parachute ?? 0);
}

const money = (id: string) => LEAGUE_MONEY[id] ?? LEAGUE_MONEY.ENG;

/** A club's annual TV money in its league at this reputation, plus any parachute. */
function tvFor(lm: LeagueMoney, rep: number, parachute?: number): number {
  return Math.max(lm.tvMin, lm.tvBase + lm.tvRep * (rep - 5)) + (parachute ? (PARACHUTE[parachute] ?? 0) * (lm.parachute ?? 0) : 0);
}

function ticketFor(lm: LeagueMoney, rep: number): number {
  return Math.round(lm.ticket * (0.7 + rep * 0.06) * (rep >= 8 ? 1.4 : 1));
}

/** Deloitte Football Money League 2026 (2024/25 revenue), converted to pounds. */
const REVENUE_ANCHOR: Record<string, number> = {
  'Real Madrid': 987 * M, Barcelona: 829 * M, 'Bayern Munich': 732 * M, 'Paris Saint-Germain': 711 * M,
  Liverpool: 711 * M, 'Manchester City': 705 * M, Arsenal: 698 * M, 'Manchester United': 674 * M,
  'Tottenham Hotspur': 572 * M, Chelsea: 496 * M, 'Inter Milan': 457 * M, 'Borussia Dortmund': 452 * M,
  'Atlético Madrid': 386 * M, 'Aston Villa': 383 * M, 'AC Milan': 349 * M, Juventus: 341 * M,
  'Newcastle United': 339 * M, 'VfB Stuttgart': 252 * M, Benfica: 241 * M, 'West Ham United': 235 * M,
};
/** Share of those revenues that comes from home competitions (European prize money arrives with the cups). */
const DOMESTIC_SHARE = 0.88;

/** Round money to figures a club would quote: £25k steps under £1m, £100k under £10m, £0.5m above. */
export function niceMoney(v: number): number {
  if (v < 1 * M) return Math.max(0, Math.round(v / 25_000) * 25_000);
  if (v < 10 * M) return Math.round(v / 100_000) * 100_000;
  if (v < 100 * M) return Math.round(v / 500_000) * 500_000;
  return Math.round(v / M) * M;
}

export function niceWage(w: number): number {
  if (w < 5_000) return Math.max(250, Math.round(w / 250) * 250);
  if (w < 50_000) return Math.round(w / 1_000) * 1_000;
  return Math.round(w / 5_000) * 5_000;
}

/* ───────────────────────── Contracts ───────────────────────── */

/** Season day of 30 June in a contract's final year. */
export function contractEndDay(p: Player, season: number): number {
  return (p.contractEnd - season - 1) * 365 + 333;
}

/** Years left on a player's contract (fractional). */
export function yearsLeft(p: Player, season: number, day: number): number {
  return Math.max(0, (contractEndDay(p, season) - day) / 365);
}

/** A fresh contract length for a player of this age. */
export function contractYears(rng: Rng, age: number): number {
  if (age <= 21) return rng.int(2, 5);
  if (age <= 28) return rng.pick([1, 2, 2, 3, 3, 4, 4, 5]);
  if (age <= 31) return rng.pick([1, 1, 2, 2, 3]);
  return rng.pick([1, 1, 2]);
}

/* ───────────────────────── Values and wages ───────────────────────── */

/**
 * What a player is worth: ability, adjusted for potential in the young, age, contract length,
 * position and the league he plays in. About £20m for ability 150 at 25, £70m at 170.
 */
export function playerValue(p: Player, season: number, day: number, leagueId: string | null): number {
  const youth = p.age <= 18 ? 0.55 : p.age <= 20 ? 0.45 : p.age <= 22 ? 0.3 : p.age <= 24 ? 0.15 : 0;
  const ca = p.ca + Math.max(0, p.pa - p.ca) * youth;
  let v = 20 * M * Math.exp(0.0594 * (ca - 150));
  const a = p.age;
  v *= a <= 20 ? 1.2 : a <= 23 ? 1.15 : a <= 26 ? 1.05 : a <= 28 ? 0.9 : a === 29 ? 0.75 : a === 30 ? 0.6 : a === 31 ? 0.45 : a === 32 ? 0.33 : a === 33 ? 0.25 : 0.15;
  if (p.clubId !== null) {
    const yl = yearsLeft(p, season, day);
    v *= yl < 0.6 ? 0.45 : yl < 1.2 ? 0.7 : yl < 2 ? 0.9 : 1;
  } else v *= 0.5;
  if ((p.pos.GK ?? 0) >= 20) v *= 0.7;
  v *= leagueId ? money(leagueId).values : 1;
  return Math.max(25_000, niceMoney(Math.min(v, 250 * M)));
}

/** A typical weekly wage for this player at a club of this reputation in this league, before the club's own pay scale. */
export function marketWage(p: Player, leagueId: string, rep: number): number {
  const w = 100_000 * Math.exp(0.038 * (p.ca - 150)) * money(leagueId).wages * (0.55 + rep * 0.055);
  const ageF = p.age <= 19 ? 0.45 : p.age <= 21 ? 0.7 : p.age >= 33 ? 0.7 : p.age >= 31 ? 0.85 : 1;
  const gk = (p.pos.GK ?? 0) >= 20 ? 0.7 : 1;
  return clamp(w * ageF * gk, 500, 650_000);
}

/** What the club would pay a player of this ability, on its own pay scale. */
export function clubWage(p: Player, c: Club): number {
  return niceWage(Math.min(650_000, marketWage(p, c.leagueId, c.reputation) * c.finance.wageScale));
}

/* ───────────────────────── Club accounts ───────────────────────── */

export function emptyLedger(): Ledger {
  return { gate: 0, tv: 0, prize: 0, sponsorship: 0, merchandise: 0, sales: 0, loanFeesIn: 0, wages: 0, purchases: 0, operating: 0, loanFeesOut: 0, severance: 0, amortisation: 0, saleProfit: 0, scouting: 0 };
}

/** Revenue (not counting player sales) and profit or loss for the spending rules. */
export function ledgerRevenue(l: Ledger): number {
  return l.gate + l.tv + l.prize + l.sponsorship + l.merchandise + l.loanFeesIn;
}

export function ledgerProfit(l: Ledger): number {
  return ledgerRevenue(l) + l.saleProfit - l.wages - l.amortisation - l.operating - l.loanFeesOut - l.severance - (l.scouting ?? 0);
}

function homeGames(state: GameState, c: Club): number {
  const size = state.comps.find((x) => x.id === c.leagueId)?.clubIds.length ?? 20;
  return size - 1;
}

/** Estimated annual revenue from home competitions: TV, gates, commercial, average merit money. */
export function expectedRevenue(state: GameState, c: Club): number {
  const lm = money(c.leagueId);
  const gate = homeGames(state, c) * Math.min(c.capacity, c.fans ?? Infinity) * 0.93 * c.finance.ticketPrice;
  return c.finance.tvShare + lm.merit * 0.5 + gate + c.finance.commercial;
}

/**
 * Weekly wages a club pays: its own players (less any share paid by clubs they're on loan
 * at) plus its share for players it has borrowed.
 */
export function wageBill(state: GameState, clubId: number): number {
  let w = 0;
  const c = state.clubs[clubId - 1];
  for (const id of c.playerIds) {
    const p = state.players[id];
    w += p.loan ? p.wage * p.loan.wageShare : p.wage;
  }
  for (const p of loanedOut(state, clubId)) w += p.wage * (1 - p.loan!.wageShare);
  return w;
}

/** Players owned by a club but out on loan elsewhere. */
export function loanedOut(state: GameState, clubId: number): Player[] {
  const out: Player[] = [];
  for (const c of state.clubs) {
    if (c.id === clubId) continue;
    for (const id of c.playerIds) {
      const p = state.players[id];
      if (p.loan?.parentId === clubId) out.push(p);
    }
  }
  return out;
}

/** Set a club's finances at the start of a new game, and put its players on wages and contracts. */
export function initClubFinance(rng: Rng, state: GameState, c: Club): void {
  const lm = money(c.leagueId);
  const rep = c.reputation;
  const tvShare = tvFor(lm, rep);
  const ticketPrice = ticketFor(lm, rep);
  const size = state.comps.find((x) => x.id === c.leagueId)?.clubIds.length ?? 20;
  const gate = (size - 1) * c.capacity * 0.93 * ticketPrice;
  let commercial = 350 * M * Math.exp(-0.55 * (10 - rep)) * lm.commercial;
  const anchor = REVENUE_ANCHOR[c.name];
  if (anchor) commercial = Math.max(commercial * 0.5, anchor * DOMESTIC_SHARE - tvShare - lm.merit * 0.5 - gate);
  c.finance = {
    balance: 0, transferBudget: 0, wageBudget: 0, commercial, tvShare, ticketPrice, wageScale: 1,
    ledger: emptyLedger(), history: [], deduction: 0,
  };
  const revenue = expectedRevenue(state, c);

  // Wages: market rates, then scaled so the club's wage bill is a realistic share of its revenue.
  const players = c.playerIds.map((id) => state.players[id]);
  const raw = players.map((p) => marketWage(p, c.leagueId, rep));
  const rawAnnual = raw.reduce((a, b) => a + b, 0) * 52;
  // Big earners spend a smaller share of revenue on wages.
  const ratio = lm.wageRatio[0] + rng.next() * (lm.wageRatio[1] - lm.wageRatio[0]) - (rep >= 9.5 ? 0.15 : rep >= 8.5 ? 0.1 : rep >= 7.5 ? 0.05 : 0);
  c.finance.wageScale = clamp((revenue * ratio) / Math.max(1, rawAnnual), 0.45, 3.5);
  players.forEach((p, i) => {
    p.wage = niceWage(Math.min(650_000, raw[i] * c.finance.wageScale * (0.85 + rng.next() * 0.3)));
  });

  // Recent seasons' results for the spending rules: roughly break-even, with some noise.
  for (let k = 2; k >= 1; k--) c.finance.history.push({ season: state.season - k, profit: niceMoney(Math.abs(revenue * rng.normal() * 0.06)) * (rng.chance(0.55) ? -1 : 1), revenue });
  c.finance.balance = niceMoney((5 + rep * rep * 1.3) * M * lm.cash * (0.6 + rng.next() * 0.8));
  setBudgets(state, c);
}

/**
 * A club that has changed division: its TV money, ticket prices and sponsorship follow the new
 * league (relegated Premier League clubs also get parachute payments), and its pay scale is
 * reset so that wages for new contracts fit the new revenue.
 */
export function repriceForLeague(state: GameState, c: Club, from: string): void {
  const lm = money(c.leagueId);
  const old = money(from);
  const f = c.finance;
  f.tvShare = tvFor(lm, c.reputation, f.parachute);
  f.ticketPrice = ticketFor(lm, c.reputation);
  f.commercial = f.commercial * (lm.commercial / old.commercial);
  const revenue = expectedRevenue(state, c);
  const rawAnnual = c.playerIds.reduce((a, id) => a + marketWage(state.players[id], c.leagueId, c.reputation), 0) * 52;
  const ratio = (lm.wageRatio[0] + lm.wageRatio[1]) / 2;
  f.wageScale = clamp((revenue * ratio) / Math.max(1, rawAnnual), 0.45, 3.5);
  setBudgets(state, c);
}

/** Contract, release clause and remaining transfer fee for a player in a new world. */
export function initContract(rng: Rng, p: Player, season: number, leagueId: string): void {
  p.contractEnd = season + contractYears(rng, p.age);
  p.listed = null;
  p.loan = null;
  p.preContract = null;
  p.joined = season - (p.age <= 20 ? rng.int(0, 2) : rng.int(0, 5));
  p.wage ??= 0;
  const value = playerValue(p, season, 0, leagueId);
  // Signings in the last few years still have part of their fee on the books.
  p.bookValue = p.age <= 28 && p.ca >= 135 && season - p.joined <= 3 && rng.chance(0.6) ? niceMoney(value * (0.2 + rng.next() * 0.5)) : 0;
  // Release clauses: every player in Spain has one by law; most in Portugal; a few elsewhere.
  p.releaseClause = null;
  if (leagueId === 'ESP' || leagueId === 'ES2') p.releaseClause = niceMoney(Math.min(850 * M, value * (p.ca >= 160 ? 4 + rng.next() * 2 : 2.5 + rng.next() * 1.5)));
  else if ((leagueId === 'POR' || leagueId === 'PT2') && p.ca >= 115) p.releaseClause = niceMoney(value * (2.5 + rng.next() * 1.5));
  else if (p.ca >= 140 && rng.chance(0.06)) p.releaseClause = niceMoney(value * (1.6 + rng.next() * 0.9));
}

/**
 * The board's budgets for the season: spend part of the cash, less if recent seasons lost
 * money; a wage budget with a little room above the current bill.
 */
export function setBudgets(state: GameState, c: Club): void {
  const f = c.finance;
  const revenue = expectedRevenue(state, c);
  const recent = f.history.slice(-2).reduce((s, h) => s + h.profit, 0);
  let budget = Math.max(0, f.balance) * 0.45 + revenue * 0.08 + Math.min(0, recent) * 0.25;
  if (c.leagueId === 'ENG') {
    // Premier League PSR: keep well clear of the £105m three-year loss limit.
    const room = 105 * M + recent;
    if (room < 40 * M) budget *= 0.4;
  }
  f.transferBudget = niceMoney(clamp(budget, 0, Math.max(0, f.balance)));
  const bill = wageBill(state, c.id);
  f.wageBase = niceWage(Math.max(bill * 1.04, (revenue * money(c.leagueId).wageRatio[1]) / 52 * 0.95));
  f.wageShift = 0;
  f.wageBudget = f.wageBase;
  if (c.id === state.userClubId) refreshWageBudget(state, c);
}

/** Weeks of wages one pound of transfer budget is swapped for: a year's worth. */
export const WAGE_WEEKS = 52;

/**
 * The most the club can pay in wages each week without breaking its league's spending rule:
 * PSR in the Premier League (allowing for the last two seasons' results and a £10m margin),
 * squad costs within 70% of revenue elsewhere.
 */
export function wageCap(state: GameState, c: Club): number {
  const revenue = expectedRevenue(state, c);
  const amort = Math.max(0, squadCost(state, c) - wageBill(state, c.id) * 52);
  if (c.leagueId === 'ENG') {
    const room = PSR_LIMIT + c.finance.history.slice(-2).reduce((s, h) => s + h.profit, 0) - 10 * M;
    const operating = revenue * (OPERATING_SHARE + 0.08) + 3 * M;
    return Math.max(0, (revenue - operating - amort + room) / 52);
  }
  return Math.max(0, (SQUAD_COST_LIMIT * revenue - amort) / 52);
}

/**
 * The board's wage budget moves with the club's money: on top of the season's base, a share
 * of the cash in the bank (so sales and prize money raise it), never above what the spending
 * rule allows, and never below what was promised at the start of the season. The manager's
 * own moves between budgets come on top.
 */
export function refreshWageBudget(state: GameState, c: Club): void {
  const f = c.finance;
  const revenue = expectedRevenue(state, c);
  const base = f.wageBase ?? f.wageBudget;
  const fromCash = Math.max(0, f.balance) * 0.1 / 52;
  const board = Math.max(base, Math.min((revenue * money(c.leagueId).wageRatio[1]) / 52 * 0.95 + fromCash, wageCap(state, c)));
  f.wageBudget = niceWage(Math.max(0, board + (f.wageShift ?? 0)));
}

/**
 * Move money between the transfer budget and the wage budget. `weekly` > 0 takes a year of
 * that weekly sum from the transfer budget and adds it to wages; < 0 does the reverse (but
 * never below the wages already being paid). Returns an error, or null when done.
 */
export function shiftTransferToWages(state: GameState, c: Club, weekly: number): string | null {
  const f = c.finance;
  if (!weekly) return null;
  if (weekly > 0) {
    const cost = weekly * WAGE_WEEKS;
    if (cost > f.transferBudget) return `That needs ${fmtMoney(cost)} of transfer budget; you have ${fmtMoney(f.transferBudget)}.`;
    if (f.wageBudget + weekly > wageCap(state, c) && f.wageBudget + weekly > wageBill(state, c.id)) {
      return `The board won't go above ${fmtWage(niceWage(Math.max(wageCap(state, c), f.wageBudget)))} a week: more would break the ${c.leagueId === 'ENG' ? 'PSR' : 'squad cost'} rules.`;
    }
    f.transferBudget -= cost;
  } else {
    const cut = -weekly;
    const bill = wageBill(state, c.id);
    if (f.wageBudget - cut < bill) return `The wage budget can't go below the ${fmtWage(bill)} you already pay.`;
    f.transferBudget += cut * WAGE_WEEKS;
  }
  f.wageShift = (f.wageShift ?? 0) + weekly;
  f.wageBudget = niceWage(f.wageBudget + weekly);
  return null;
}

/** Move money between the transfer budget and the scouting budget (amount > 0: to scouting). */
export function shiftTransferToScouting(c: Club, amount: number): string | null {
  const f = c.finance;
  if (amount > 0 && amount > f.transferBudget) return `You only have ${fmtMoney(f.transferBudget)} of transfer budget.`;
  if (amount < 0 && -amount > (f.scoutBudget ?? 0)) return `The scouting budget only has ${fmtMoney(f.scoutBudget ?? 0)} left.`;
  f.transferBudget -= amount;
  f.scoutBudget = (f.scoutBudget ?? 0) + amount;
  return null;
}

/** Home gate: attendance times the average ticket price. */
export function recordGate(c: Club, attendance: number): void {
  const g = attendance * c.finance.ticketPrice;
  c.finance.ledger.gate += g;
  c.finance.balance += g;
}

/**
 * A month's income and costs: TV instalments (August to May), sponsorship and merchandise,
 * wages, running costs and the amortisation of transfer fees.
 */
export function monthlyAccounts(state: GameState, month: number): void {
  const tvMonth = month >= 7 || month <= 4; // Aug–May
  for (const c of state.clubs) {
    const f = c.finance;
    const l = f.ledger;
    const tv = tvMonth ? f.tvShare / 10 : 0;
    const spons = (f.commercial * 0.7) / 12;
    const merch = (f.commercial * 0.3) / 12;
    const wages = (wageBill(state, c.id) * 52) / 12;
    // Everything else: staff, travel, matchday operations, the academy, facilities.
    const operating = (expectedRevenue(state, c) * (OPERATING_SHARE + (c.leagueId === 'ENG' ? 0.08 : 0)) + 3 * M) / 12;
    l.tv += tv;
    l.sponsorship += spons;
    l.merchandise += merch;
    l.wages += wages;
    l.operating += operating;
    f.balance += tv + spons + merch - wages - operating;
    for (const id of c.playerIds) {
      const p = state.players[id];
      if (p.loan || p.bookValue <= 0) continue;
      const months = Math.max(1, (contractEndDay(p, state.season) - state.day) / 30.4);
      const a = Math.min(p.bookValue, p.bookValue / months);
      p.bookValue -= a;
      l.amortisation += a;
    }
    for (const p of loanedOut(state, c.id)) {
      if (p.bookValue <= 0) continue;
      const months = Math.max(1, (contractEndDay(p, state.season) - state.day) / 30.4);
      const a = Math.min(p.bookValue, p.bookValue / months);
      p.bookValue -= a;
      l.amortisation += a;
    }
    if (c.id === state.userClubId) refreshWageBudget(state, c);
  }
}

/** Merit money by final league position. */
export function meritPayment(leagueId: string, pos: number, size: number): number {
  const m = money(leagueId).merit;
  return niceMoney(m * (size - pos + 1) / size);
}

/* ───────────────────────── Spending rules ───────────────────────── */

export interface RuleStatus {
  name: string;
  /** How far along the limit the club is, 0–1+. */
  used: number;
  ok: boolean;
  text: string;
}

export const PSR_LIMIT = 105 * M;
export const SQUAD_COST_LIMIT = 0.7;

/** Annual squad cost: wages plus the amortisation of transfer fees (current run-rate). */
export function squadCost(state: GameState, c: Club): number {
  let amort = 0;
  const own = [...c.playerIds.map((id) => state.players[id]).filter((p) => !p.loan), ...loanedOut(state, c.id)];
  for (const p of own) {
    if (p.bookValue <= 0) continue;
    amort += p.bookValue / Math.max(0.5, yearsLeft(p, state.season, state.day));
  }
  return wageBill(state, c.id) * 52 + amort;
}

/**
 * The spending rule for a club's league.
 * - Premier League: Profit and Sustainability, losses over three seasons capped at £105m.
 * - La Liga: squad cost limit; a club over it can't register new signings.
 * - Elsewhere: UEFA's squad cost ratio, wages and amortisation at most 70% of revenue.
 */
export function spendingRule(state: GameState, c: Club): RuleStatus {
  const f = c.finance;
  if (c.leagueId === 'ENG') {
    const current = ledgerProfit(f.ledger);
    const loss = -(f.history.slice(-2).reduce((s, h) => s + h.profit, 0) + current);
    const used = Math.max(0, loss) / PSR_LIMIT;
    return {
      name: 'Profit and Sustainability (PSR)',
      used,
      ok: loss <= PSR_LIMIT,
      text: loss > 0 ? `Losses over three seasons: ${fmtMoney(loss)} of the ${fmtMoney(PSR_LIMIT)} allowed.` : `In profit over three seasons (${fmtMoney(-loss)}).`,
    };
  }
  const ratio = squadCost(state, c) / Math.max(1, expectedRevenue(state, c));
  if (c.leagueId === 'ESP') {
    return {
      name: 'La Liga squad cost limit',
      used: ratio / SQUAD_COST_LIMIT,
      ok: ratio <= SQUAD_COST_LIMIT,
      text: `Squad costs are ${Math.round(ratio * 100)}% of revenue. Over ${Math.round(SQUAD_COST_LIMIT * 100)}%, La Liga won't register new signings until costs come down.`,
    };
  }
  return {
    name: 'UEFA squad cost ratio',
    used: ratio / SQUAD_COST_LIMIT,
    ok: ratio <= SQUAD_COST_LIMIT,
    text: `Squad costs are ${Math.round(ratio * 100)}% of revenue (limit ${Math.round(SQUAD_COST_LIMIT * 100)}%).`,
  };
}

/** £1.2m, £850k, £4,500. */
export function fmtMoney(v: number): string {
  const neg = v < 0;
  const a = Math.abs(v);
  let s: string;
  if (a >= 100 * M) s = `£${Math.round(a / M)}m`;
  else if (a >= 1 * M) s = `£${(a / M).toFixed(1).replace(/\.0$/, '')}m`;
  else if (a >= 10_000) s = `£${Math.round(a / 1000)}k`;
  else s = `£${Math.round(a).toLocaleString('en-GB')}`;
  return neg ? `-${s}` : s;
}

export function fmtWage(w: number): string {
  return `${fmtMoney(w)} p/w`;
}

/** Everything about a club's money reset for a new season. Returns last season's profit. */
export function closeSeasonAccounts(state: GameState, c: Club): number {
  const f = c.finance;
  const profit = ledgerProfit(f.ledger);
  f.history.push({ season: state.season, profit, revenue: ledgerRevenue(f.ledger) });
  if (f.history.length > 5) f.history.shift();
  f.lastLedger = f.ledger;
  f.ledger = emptyLedger();
  return profit;
}

export type { Finance };
