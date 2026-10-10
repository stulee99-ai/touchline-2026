import { available } from './tactics.js';
import { advanceCalendar, advanceToUserMatch, club, nextMatchDay, playDay, seasonOver, userClub, userPlaysNext } from './game.js';
import { fmtMoney } from './finance.js';
import { preseasonPending, preseasonStop } from './training.js';
import type { GameState } from './types.js';

/**
 * Things that need the manager's answer before the game moves on: bids for his players, counter-offers
 * and personal terms in his own signings, and serious injuries. Continue stops until they are dealt with.
 */
export interface Decision {
  kind: 'bid' | 'counter' | 'terms' | 'injury' | 'preseason';
  text: string;
  playerId: number;
  offerId?: number;
}

/** Injuries at least this long (days) need acknowledging: about six weeks. */
export const SEVERE_INJURY_DAYS = 42;

const name = (state: GameState, id: number): string => {
  const p = state.players[id];
  return p ? `${p.firstName} ${p.lastName}`.trim() : 'A player';
};

export function pendingDecisions(state: GameState): Decision[] {
  const me = state.userClubId;
  const out: Decision[] = [];
  for (const o of state.offers) {
    if (o.status === 'pending' && o.sellerId === me && o.buyerId !== me) {
      const what = o.kind === 'loan' ? `a loan for ${name(state, o.playerId)}` : `${fmtMoney(o.fee)} for ${name(state, o.playerId)}`;
      out.push({ kind: 'bid', playerId: o.playerId, offerId: o.id, text: `${club(state, o.buyerId).name} have bid ${what}. Accept, reject or counter.` });
    } else if (o.buyerId === me && o.status === 'countered') {
      out.push({ kind: 'counter', playerId: o.playerId, offerId: o.id, text: `${club(state, o.sellerId).name} have countered for ${name(state, o.playerId)}. Accept it or make another offer.` });
    } else if (o.buyerId === me && o.status === 'accepted') {
      const text = o.kind === 'loan'
        ? `${name(state, o.playerId)}: the loan is agreed. Confirm it, or walk away.`
        : o.kind === 'precontract'
        ? o.agreed
          ? `${name(state, o.playerId)} has agreed the terms of a pre-contract. Sign it, or walk away.`
          : `${name(state, o.playerId)} is willing to talk about a pre-contract. Offer him terms, or walk away.`
        : o.agreed
        ? `${name(state, o.playerId)} has agreed terms. Confirm the signing, or walk away.`
        : o.sellerId
          ? `${name(state, o.playerId)}: the fee is agreed. Offer him a contract, or walk away.`
          : `${name(state, o.playerId)} is willing to talk. Offer him a contract, or walk away.`;
      out.push({ kind: 'terms', playerId: o.playerId, offerId: o.id, text });
    }
  }
  if (state.userClubId && preseasonPending(state)) {
    out.push({ kind: 'preseason', playerId: 0, text: 'The players are back for pre-season. Choose a training camp and set the programme.' });
  }
  for (const id of userClub(state).playerIds) {
    const p = state.players[id];
    if (p?.injury && p.injury.days >= SEVERE_INJURY_DAYS && !p.injury.seen) {
      const wk = Math.ceil(p.injury.days / 7);
      out.push({ kind: 'injury', playerId: p.id, text: `${name(state, p.id)} has a serious injury (${p.injury.name.toLowerCase()}, about ${wk} weeks).` });
    }
  }
  return out;
}

export function acknowledgeInjury(state: GameState, playerId: number): void {
  const p = state.players[playerId];
  if (p?.injury) p.injury.seen = true;
}

/** Problems that stop the manager kicking off: an XI he picked that can't play, or too few fit players. */
export function lineupBlockers(state: GameState): string[] {
  const c = userClub(state);
  const out: string[] = [];
  const fit = c.playerIds.map((id) => state.players[id]).filter((p) => p && available(p));
  if (fit.length < 11) out.push(`Only ${fit.length} players are fit to play. You need 11: recall loan players or sign someone.`);
  if (c.lineup) {
    const empty = c.lineup.filter((id) => id === -1).length;
    if (empty) out.push(`Your XI is incomplete: ${empty} empty slot${empty > 1 ? 's' : ''}. Pick players for them, or let the assistant pick.`);
    const bad = c.lineup.filter((id) => id !== -1).map((id) => state.players[id]).filter((p) => !p || !available(p) || !c.playerIds.includes(p.id));
    if (bad.length) out.push(`Your XI includes ${bad.length} player${bad.length > 1 ? 's' : ''} who can't play (${bad.map((p) => (p ? `${p.lastName}: ${p.injury ? 'injured' : p.suspended ? 'suspended' : p.away ? 'on international duty' : 'unavailable'}` : 'has left')).join(', ')}). Fix your team, or let the assistant pick.`);
  }
  return out;
}

/**
 * Like playUntilUserMatch, but stops early when something needs an answer. With `maxDays`, it
 * never moves the calendar on more than that many days (Continue goes a week at a time at most).
 * Returns the number of steps taken (0 if nothing moved).
 */
export function playUntilDecision(state: GameState, maxDays = Infinity): number {
  const start = state.day;
  const limit = start + maxDays;
  const nextStop = () => {
    const next = nextMatchDay(state);
    const stop = preseasonStop(state);
    return next === null ? null : stop !== null && stop < next ? stop : next;
  };
  let n = 0;
  while (!seasonOver(state) && !userPlaysNext(state)) {
    if (pendingDecisions(state).length) break;
    const at = nextStop();
    if (at !== null && at > limit) {
      // Nothing to play within the week: just move the calendar on to the end of it.
      const before = state.day;
      advanceCalendar(state, limit);
      return n + (state.day !== before ? 1 : 0);
    }
    playDay(state);
    n++;
    if (pendingDecisions(state).length) break;
  }
  // Up to the day of the match, so the squad on the pre-match screen is the one that can play.
  const before = state.day;
  if (!seasonOver(state) && !pendingDecisions(state).length) {
    const at = nextMatchDay(state);
    if (at !== null && at > limit) advanceCalendar(state, limit);
    else advanceToUserMatch(state, () => pendingDecisions(state).length > 0);
  }
  return n + (state.day !== before ? 1 : 0);
}
