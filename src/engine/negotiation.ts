/**
 * Contract talks: the player opens with an ask, has a hidden least he'll take, and a limited patience.
 * Below his ask he comes back with a figure between the two; lowball offers use up his patience
 * faster, and when it runs out he walks away.
 *
 * A package is a weekly wage plus two one-off payments: a signing-on fee (his, worth the same to him
 * as the wage spread over the contract) and his agent's fee (which, up to what the agent expects,
 * counts for half as much again: an agent who is paid pushes his client to sign). One-off fees come
 * out of the transfer budget, wages out of the wage budget.
 */
import { hashString } from './attributes.js';
import { fmtWage, niceMoney, niceWage } from './finance.js';
import type { GameState, Player, Talks, TalkKind } from './types.js';

export interface Package {
  wage: number;
  years: number;
  signOn: number;
  agentFee: number;
}

/** A weekly wage rounded up to the usual steps (so meeting his figure always meets his figure). */
function ceilWage(w: number): number {
  const step = w < 5_000 ? 250 : w < 50_000 ? 1_000 : 5_000;
  return Math.max(250, Math.ceil(w / step - 1e-9) * step);
}

/** What a one-off payment is worth a week over the contract. */
const weekly = (money: number, years: number): number => money / (52 * Math.max(1, years));

/** How much the agent's fee counts for, up to what he expects. */
const AGENT_WEIGHT = 1.5;

/**
 * Open talks. `demand` is the weekly wage he would settle around (for the clause he has and the
 * length he prefers); he asks a little more and will take a little less.
 */
export function openTalks(state: GameState, p: Player, kind: TalkKind, demand: number, years: number, midContract = false): Talks {
  const h = hashString(`talks:${p.id}:${state.season}:${state.day}:${kind}`);
  const jitter = ((h % 1000) / 1000 - 0.5) * 0.06;
  const ask = demand * 1.06;
  // How far he'll come down: not far when he doesn't need a new deal, further for veterans and
  // players who have been without a club a while.
  const unsigned = p.clubId === null && p.freeSince !== undefined ? state.season * 365 + state.day - p.freeSince : 0;
  const give = midContract ? 0.97 : p.age >= 32 ? 0.88 : unsigned > 60 ? 0.86 : 0.92;
  const floor = Math.min(ask, demand * (give + jitter));
  // With no transfer fee paid for him, a free agent (or a pre-contract) wants part of it up front.
  const signOnShare = kind === 'free' || kind === 'precontract' ? 0.12 : 0;
  const agentRate = kind === 'renewal' ? 0.03 : kind === 'transfer' ? 0.05 : 0.08;
  const signOn = niceMoney(ask * 52 * years * signOnShare);
  const agentFee = niceMoney(ask * 52 * years * agentRate);
  const askWage = ceilWage(ask - weekly(signOn, years) - weekly(agentFee * AGENT_WEIGHT, years));
  const patience = p.ca >= 165 ? 3 : 3 + ((h >>> 10) % 2);
  return { kind, ask, position: ask, floor, patience, maxPatience: patience, askWage, signOn, agentFee, years, round: 0, day: state.season * 365 + state.day };
}

/** The package's worth to him, in weekly wages, before the clause and contract length are allowed for. */
export function packageValue(t: Talks, pkg: Package): number {
  return pkg.wage + weekly(pkg.signOn, pkg.years) + weekly(Math.min(pkg.agentFee, t.agentFee) * AGENT_WEIGHT, pkg.years);
}

/** The weekly wage he wants now, with the fees and terms of this package. */
export function wageWanted(t: Talks, pkg: Package, mult: number): number {
  return ceilWage(Math.max(0, t.position * mult - (packageValue(t, pkg) - pkg.wage)));
}

export type ReplyKind = 'agree' | 'counter' | 'walk';
export interface Reply {
  kind: ReplyKind;
  /** The wage he now wants (counter) or wanted (walk), with this package's fees. */
  wage: number;
  note: string;
}

/**
 * His answer to an offer. `mult` is what the terms are worth to him against what he wants (above 1
 * for a clause he doesn't like or a length he doesn't want).
 */
export function respond(t: Talks, pkg: Package, mult: number, name: string): Reply {
  const v = packageValue(t, pkg) / mult;
  t.round++;
  t.offer = { ...pkg };
  if (v >= t.position * 0.99) return { kind: 'agree', wage: pkg.wage, note: agreed(name, pkg) };
  const insult = v < t.floor * 0.85;
  let cost = insult ? 2 : 1;
  if (t.last !== undefined && v < t.last * 0.995) cost++; // going backwards
  t.last = v;
  t.patience = Math.max(0, t.patience - cost);
  if (t.patience === 0) {
    return { kind: 'walk', wage: wageWanted(t, pkg, mult), note: `${name} has walked away. He wanted ${fmtWage(wageWanted(t, pkg, mult))}${feesNote(pkg)}.` };
  }
  const next = Math.max(t.floor, v + (t.position - v) * 0.55);
  // Close enough: he meets you.
  if (v >= t.floor && next - v <= t.position * 0.02) return { kind: 'agree', wage: pkg.wage, note: agreed(name, pkg) };
  t.position = next;
  const want = wageWanted(t, pkg, mult);
  t.want = want;
  const final = t.position <= t.floor * 1.001;
  const lead = insult ? `${name} is insulted. ` : '';
  return { kind: 'counter', wage: want, note: `${lead}He wants ${fmtWage(want)}${feesNote(pkg)}.${final ? ' His final offer.' : ''}` };
}

function feesNote(pkg: Package): string {
  return pkg.signOn || pkg.agentFee ? ' with these fees' : '';
}

function agreed(name: string, pkg: Package): string {
  return `${name} agrees: ${fmtWage(niceWage(pkg.wage))}, ${pkg.years} year${pkg.years > 1 ? 's' : ''}.`;
}

/** Patience as dots, for the terms forms. */
export function patienceDots(t: Talks): string {
  return '●'.repeat(t.patience) + '○'.repeat(Math.max(0, t.maxPatience - t.patience));
}
