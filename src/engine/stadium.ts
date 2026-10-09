/**
 * The manager's ground: how many people want tickets, and asking the board to expand it or
 * build a new one. The board decide on their confidence in the manager, whether the club
 * could fill it, and whether it can pay: cash it can spare first, then a loan repaid monthly.
 * Infrastructure sits outside the spending rules (as in the real PSR), so it shows in the
 * cash flow but not in the profit the rules measure.
 *
 * Realistic times: an expansion takes about ten months with some seats closed while the
 * stand is built; a new stadium takes three seasons and opens for the start of a season.
 */
import { expectedRevenue, fmtMoney, M, niceMoney } from './finance.js';
import { addNews, userClub } from './game.js';
import { leagueTable } from './league.js';
import { tierOf } from './pyramid.js';
import { clamp } from './rng.js';
import type { Club, GameState, StadiumWorks } from './types.js';

const SEASON_DAYS = 365;
const abs = (season: number, day: number) => season * SEASON_DAYS + day;

/** The crowd a club's standing attracts: reputation, and the division it plays in. */
export function reputationCrowd(c: Club): number {
  const tier = tierOf(c.leagueId);
  const mult = tier === 1 ? 1 : tier === 2 ? 0.55 : tier === 3 ? 0.38 : 0.28;
  return 6000 * Math.pow(1.32, c.reputation) * mult;
}

/** Supporters wanting a ticket for a typical league game. Most grounds have a waiting list. */
export function fansOf(c: Club): number {
  return c.fans ?? Math.max(c.capacity * 1.1, reputationCrowd(c));
}

/** This season's demand: the fan base, lifted by a good season in the top flight. */
export function stadiumDemand(state: GameState, c: Club): number {
  let d = fansOf(c);
  const played = state.fixtures.some((f) => f.result && f.comp === c.leagueId);
  if (played && tierOf(c.leagueId) === 1) {
    const pos = leagueTable(state, c.leagueId).findIndex((r) => r.clubId === c.id) + 1;
    d *= pos <= 4 ? 1.15 : pos <= 7 ? 1.1 : pos <= 10 ? 1.04 : 1;
  }
  if (state.cups.some((cup) => cup.kind === 'euro' && cup.phaseClubs?.includes(c.id))) d *= 1.05;
  return Math.round(d);
}

/** The crowd for one home game: demand, give or take, never more than the seats available. */
export function crowdFor(c: Club, roll: number, big = false): number {
  const want = fansOf(c) * (0.88 + roll * 0.17) * (big ? 1.1 : 1);
  return Math.round(Math.min(c.capacity, want));
}

export interface StadiumOption {
  kind: 'expand' | 'new';
  capacity: number;
  added: number;
  cost: number;
  /** Days of building. */
  days: number;
  label: string;
}

const round500 = (v: number) => Math.round(v / 500) * 500;

/** What the club could build: two sizes of new stand, or a new ground of 30,000 to 80,000. */
export function stadiumOptions(state: GameState, c: Club): StadiumOption[] {
  const out: StadiumOption[] = [];
  for (const share of [0.15, 0.3]) {
    const added = Math.max(2000, round500(c.capacity * share));
    out.push({ kind: 'expand', capacity: c.capacity + added, added, cost: niceMoney(added * 8000 + 4 * M), days: 300, label: share < 0.2 ? 'Rebuild one stand' : 'Rebuild two stands' });
  }
  for (const cap of [30000, 40000, 50000, 60000, 80000]) {
    if (cap < c.capacity * 1.25) continue;
    out.push({ kind: 'new', capacity: cap, added: cap - c.capacity, cost: niceMoney(60 * M + cap * 9000), days: 0, label: `New stadium, ${cap.toLocaleString('en-GB')} seats` });
  }
  return out;
}

/** Monthly repayment of a loan at 5% a year over `years`. */
export function loanPayment(principal: number, years: number): number {
  const r = 0.05 / 12;
  const n = years * 12;
  return principal * r / (1 - Math.pow(1 + r, -n));
}

/** How the board would pay: cash they can spare, the rest borrowed. */
export function fundingPlan(state: GameState, c: Club, o: StadiumOption): { cash: number; loan: number; years: number; monthly: number } {
  const f = c.finance;
  const spare = Math.max(0, f.balance - f.transferBudget - expectedRevenue(state, c) * 0.1);
  const cash = Math.min(o.cost, niceMoney(spare));
  const loan = o.cost - cash;
  const years = o.kind === 'new' ? 25 : 8;
  return { cash, loan, years, monthly: loan > 0 ? loanPayment(loan, years) : 0 };
}

/** The board's answer, without asking yet: null if they'd agree, else why not. */
export function boardObjection(state: GameState, c: Club, o: StadiumOption): string | null {
  const conf = state.board?.confidence ?? 60;
  if (c.stadiumWorks) return 'Work on the ground is already under way.';
  if (c.stadiumLoan && c.stadiumLoan.monthsLeft > 0 && o.kind === 'new' && c.stadiumLoan.remaining > 20 * M) return 'The board want the current stadium loan paid down before borrowing again.';
  const asked = c.stadiumAsked;
  if (asked && abs(state.season, state.day) - abs(asked.season, asked.day) < 60) return 'The board turned down a request recently. Give it a couple of months.';
  if (conf < (o.kind === 'new' ? 65 : 55)) return `The board's confidence in you (${Math.round(conf)}/100) isn't high enough for a project this size: they want ${o.kind === 'new' ? 65 : 55}.`;
  const demand = stadiumDemand(state, c);
  if (o.kind === 'expand' && demand < c.capacity * 0.95) return `The ground isn't full yet: about ${demand.toLocaleString('en-GB')} want tickets for ${c.capacity.toLocaleString('en-GB')} seats.`;
  const limit = demand * (o.kind === 'new' ? 1.6 : 1.3);
  if (o.capacity > limit) return `The board think the club would struggle to fill ${o.capacity.toLocaleString('en-GB')} seats: about ${demand.toLocaleString('en-GB')} want tickets now.`;
  const plan = fundingPlan(state, c, o);
  const revenue = expectedRevenue(state, c);
  const existing = c.stadiumLoan?.monthly ?? 0;
  if ((plan.monthly + existing) * 12 > revenue * 0.2) return `It's too expensive for now: repayments of ${fmtMoney((plan.monthly + existing) * 12)} a year would be more than a fifth of the club's revenue.`;
  return null;
}

/**
 * Ask the board. If they agree the works start straight away: the cash part is paid now and
 * a loan covers the rest. `name` is a new ground's name; `rights` sells its naming rights.
 */
export function requestStadium(state: GameState, o: StadiumOption, name?: string, rights = false): { ok: boolean; message: string } {
  const c = userClub(state);
  const no = boardObjection(state, c, o);
  if (no) {
    if (!c.stadiumWorks) c.stadiumAsked = { season: state.season, day: state.day };
    addNews(state, { kind: 'board', title: 'The board say no to stadium plans', body: `You asked the board to approve: ${o.label.toLowerCase()} (${o.capacity.toLocaleString('en-GB')} seats, ${fmtMoney(o.cost)}). ${no}` });
    return { ok: false, message: no };
  }
  const plan = fundingPlan(state, c, o);
  const f = c.finance;
  f.balance -= plan.cash;
  f.ledger.stadium = (f.ledger.stadium ?? 0) + plan.cash;
  if (plan.loan > 0) {
    const prev = c.stadiumLoan;
    c.stadiumLoan = { remaining: plan.loan + (prev?.remaining ?? 0), monthly: plan.monthly + (prev?.monthly ?? 0), monthsLeft: Math.max(plan.years * 12, prev?.monthsLeft ?? 0) };
  }
  const start = abs(state.season, state.day);
  let readySeason: number;
  let readyDay: number;
  const closed = o.kind === 'expand' ? Math.round(o.added * 0.6 / 100) * 100 : 0;
  if (o.kind === 'expand') {
    const end = start + o.days;
    readySeason = Math.floor(end / SEASON_DAYS);
    readyDay = end - readySeason * SEASON_DAYS;
  } else {
    // About three years: three more seasons at the old ground (counting this one if it's still
    // early), then the move in the summer.
    readySeason = state.season + (state.day < 150 ? 3 : 4);
    readyDay = 0;
  }
  const rightsFee = rights ? niceMoney(o.capacity * 150 * (1 + c.reputation / 5)) : 0;
  const ground = o.kind === 'new' ? (rights ? `${SPONSORS[Math.abs(c.id * 7 + state.season) % SPONSORS.length]} Stadium` : (name?.trim() || `${c.name} Stadium`)) : undefined;
  const works: StadiumWorks = {
    kind: o.kind, capacity: o.capacity, before: c.capacity, name: ground, namingRights: rightsFee || undefined,
    cost: o.cost, startSeason: state.season, startDay: state.day, readySeason, readyDay,
  };
  c.stadiumWorks = works;
  c.stadiumAsked = undefined;
  if (closed) c.capacity -= closed;
  const when = readyText(works);
  const money = `It costs ${fmtMoney(o.cost)}: ${plan.cash ? `${fmtMoney(plan.cash)} from the bank` : ''}${plan.cash && plan.loan ? ' and ' : ''}${plan.loan ? `a ${fmtMoney(plan.loan)} loan repaid over ${plan.years} years (${fmtMoney(plan.monthly)} a month)` : ''}. Stadium costs don't count towards the spending rules.`;
  const body = o.kind === 'expand'
    ? `The board have approved your plans to rebuild ${o.added >= c.capacity * 0.25 ? 'two stands' : 'a stand'}, taking ${c.name}'s ground to ${o.capacity.toLocaleString('en-GB')}. Work starts now; ${closed.toLocaleString('en-GB')} seats are closed while it goes on, and it should be finished ${when}. ${money}`
    : `The board have approved a new ${o.capacity.toLocaleString('en-GB')}-seat stadium${ground ? `, ${ground}` : ''}${rightsFee ? `, with the naming rights sold for ${fmtMoney(rightsFee)} a year` : ''}. It should be ready ${when}; until then you stay at ${c.stadium}. ${money}`;
  addNews(state, { kind: 'board', title: o.kind === 'expand' ? 'Stadium expansion approved' : 'New stadium approved', body });
  return { ok: true, message: o.kind === 'expand' ? `Approved: building starts now, finished ${when}.` : `Approved: the new ground opens ${when}.` };
}

/** Fictional sponsors for naming rights. */
const SPONSORS = ['Northmere Bank', 'Halcyon Air', 'Kestrel Energy', 'Bluecrest Insurance', 'Meridian Telecom', 'Arclight', 'Vantage Motors', 'Corvid Systems'];

export function readyText(w: StadiumWorks): string {
  const d = new Date(Date.UTC(w.readySeason, 7, 1 + w.readyDay));
  return w.kind === 'new' ? `for the start of the ${w.readySeason}/${String((w.readySeason + 1) % 100).padStart(2, '0')} season` : `by ${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
}

/** How far along the works are, 0–1. */
export function worksProgress(state: GameState, w: StadiumWorks): number {
  const a = abs(w.startSeason, w.startDay);
  const b = abs(w.readySeason, w.readyDay);
  return clamp((abs(state.season, state.day) - a) / Math.max(1, b - a), 0, 1);
}

/** Once a month: loan repayments, and works finished. */
export function stadiumMonthly(state: GameState): void {
  // Any club with works or a loan (the manager may have moved on since he asked for them).
  for (const c of state.clubs) if (c.stadiumWorks || c.stadiumLoan) clubMonthly(state, c);
}

function clubMonthly(state: GameState, c: Club): void {
  const mine = c.id === state.userClubId;
  const loan = c.stadiumLoan;
  if (loan && loan.monthsLeft > 0) {
    const pay = Math.min(loan.monthly, loan.remaining * (1 + 0.05 / 12));
    c.finance.balance -= pay;
    c.finance.ledger.stadium = (c.finance.ledger.stadium ?? 0) + pay;
    loan.remaining = Math.max(0, loan.remaining * (1 + 0.05 / 12) - pay);
    loan.monthsLeft--;
    if (loan.monthsLeft <= 0 || loan.remaining < 1000) {
      c.stadiumLoan = null;
      if (mine) addNews(state, { kind: 'finance', title: 'Stadium loan paid off', body: `The last repayment on the stadium loan has been made.` });
    }
  }
  const w = c.stadiumWorks;
  if (w && abs(state.season, state.day) >= abs(w.readySeason, w.readyDay)) completeWorks(state, c, w);
}

function completeWorks(state: GameState, c: Club, w: StadiumWorks): void {
  const old = c.stadium;
  c.capacity = w.capacity;
  if (w.kind === 'new' && w.name) c.stadium = w.name;
  if (w.namingRights) c.finance.commercial += w.namingRights;
  // New grounds bring better hospitality, and new seats bring new supporters.
  if (w.kind === 'new') c.finance.commercial = niceMoney(c.finance.commercial * 1.08);
  c.fans = Math.max(fansOf(c), w.before * 1.05) + (w.capacity - w.before) * 0.15;
  c.stadiumWorks = null;
  if (c.id !== state.userClubId) return;
  addNews(state, {
    kind: 'board',
    title: w.kind === 'new' ? `${c.stadium} opens` : 'Stadium works finished',
    body: w.kind === 'new'
      ? `${c.name} have moved from ${old} into ${c.stadium}, with ${w.capacity.toLocaleString('en-GB')} seats.${w.namingRights ? ` The naming rights bring in ${fmtMoney(w.namingRights)} a year.` : ''}`
      : `The new stand is open: ${c.stadium} now holds ${w.capacity.toLocaleString('en-GB')}.`,
  });
}

/** End of the season: a good one brings new supporters, a bad one loses some. */
export function stadiumSeasonEnd(state: GameState, c: Club, pos: number, size: number): void {
  const tier = tierOf(c.leagueId);
  let growth: number;
  if (tier === 1) growth = pos <= 4 ? 0.1 : pos <= 7 ? 0.06 : pos <= size / 2 ? 0.03 : pos > size - 3 ? -0.08 : 0;
  else growth = pos <= 2 ? 0.1 : pos <= 6 ? 0.04 : pos > size - 4 ? -0.06 : 0;
  let fans = fansOf(c) * (1 + growth);
  // The standing of the club pulls the fan base its way over time.
  fans += (reputationCrowd(c) - fans) * 0.1;
  c.fans = Math.round(Math.max(fans, c.capacity * 0.6));
}
