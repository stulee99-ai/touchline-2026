import { INJURIES } from './data.js';
import { fmtMoney, LEAGUE_MONEY } from './finance.js';
import { addNews, userClub } from './game.js';
import { clamp, Rng } from './rng.js';
import type { GameState, Player } from './types.js';

/**
 * Surgery for serious injuries (the long ones: torn ligaments, breaks, a ruptured tendon). The manager
 * chooses how the player is treated. Rehabilitation alone is free and takes the injury's natural time;
 * an operation at the club's surgeon or a top specialist costs money and gets him back sooner, and the
 * better the surgeon the less likely a complication (which adds weeks, and for the worst injuries can
 * take a little pace for good). The choice is made once and the outcome is known straight away.
 */

export type Treatment = 'rehab' | 'surgery' | 'specialist';

/** Injuries shorter than this (days left) aren't worth an operation. */
export const SURGERY_MIN_DAYS = 28;

export interface SurgeryOption {
  how: Treatment;
  label: string;
  cost: number;
  /** Rough time out (days), from best to worst case, if all goes to plan. */
  days: [number, number];
  /** Chance of a complication. */
  risk: number;
  blurb: string;
}

const RATE: Record<Treatment, { cut: [number, number]; riskMul: number; costMul: number; label: string }> = {
  rehab: { cut: [1, 1], riskMul: 1, costMul: 0, label: 'Rehabilitation only' },
  surgery: { cut: [0.72, 0.86], riskMul: 0.5, costMul: 1, label: 'Operation at the club surgeon' },
  specialist: { cut: [0.6, 0.76], riskMul: 0.2, costMul: 3.5, label: 'Operation by a top specialist' },
};

/** Extra time when there is a complication. */
const COMPLICATION = 1.35;

export function surgicalDef(injuryName: string): { risk: number; lasting?: boolean } | null {
  return INJURIES.find((d) => d.name === injuryName)?.surgical ?? null;
}

/** Can the manager still decide how this player's injury is treated? */
export function canTreat(state: GameState, p: Player | undefined): boolean {
  if (!p?.injury || p.clubId !== state.userClubId || p.injury.treated) return false;
  return p.injury.days >= SURGERY_MIN_DAYS && !!surgicalDef(p.injury.name);
}

function feeFor(state: GameState, p: Player, how: Treatment): number {
  const lg = LEAGUE_MONEY[userClub(state).leagueId] ?? LEAGUE_MONEY.ENG;
  const base = (15_000 + p.injury!.days * 900) * (0.45 + 0.55 * lg.wages);
  return Math.round((base * RATE[how].costMul) / 1000) * 1000;
}

export function surgeryOptions(state: GameState, playerId: number): SurgeryOption[] {
  const p = state.players[playerId];
  if (!canTreat(state, p)) return [];
  const inj = p.injury!;
  const def = surgicalDef(inj.name)!;
  const age = p.age >= 32 ? 0.02 : 0;
  return (['rehab', 'surgery', 'specialist'] as Treatment[]).map((how) => {
    const r = RATE[how];
    const risk = clamp(def.risk * r.riskMul + age, 0.01, 0.4);
    return {
      how, label: r.label, cost: feeFor(state, p, how),
      days: [Math.round(inj.days * r.cut[0]), Math.round(inj.days * r.cut[1])] as [number, number],
      risk,
      blurb: how === 'rehab' ? 'Free. He recovers in his own time.' : how === 'surgery' ? 'Back sooner, at a fair price.' : 'The quickest way back and the safest hands, at a high price.',
    };
  });
}

/** Carry out the chosen treatment. Returns a message for the manager, or an error. */
export function treatInjury(state: GameState, playerId: number, how: Treatment): { ok: boolean; message: string } {
  const p = state.players[playerId];
  const opt = surgeryOptions(state, playerId).find((o) => o.how === how);
  if (!p || !opt) return { ok: false, message: 'That injury can no longer be treated.' };
  const me = userClub(state);
  if (opt.cost > me.finance.balance + me.finance.transferBudget) return { ok: false, message: `The club can't afford the ${fmtMoney(opt.cost)} for that.` };
  // Seeded from the game and the moment, so reloading a save can't re-roll the operation.
  const rng = new Rng(state.rngState ^ 0x5e17 ^ (playerId * 2654435761) ^ (state.day * 40503));
  const inj = p.injury!;
  const def = surgicalDef(inj.name)!;
  const before = inj.days;
  const r = RATE[how];
  if (opt.cost) {
    me.finance.balance -= opt.cost;
    me.finance.ledger.operating += opt.cost;
  }
  let days = before * (r.cut[0] + rng.next() * (r.cut[1] - r.cut[0]));
  const complication = rng.chance(opt.risk);
  let lasting: string | undefined;
  if (complication) {
    days *= COMPLICATION;
    if (def.lasting && rng.chance(0.3)) {
      lasting = 'pace';
      p.attrs.pace = Math.max(1, p.attrs.pace - 1);
    }
  }
  inj.days = Math.max(1, Math.round(days));
  inj.seen = true;
  inj.treated = { how, complication, lasting };
  const wk = (d: number) => `${Math.max(1, Math.round(d / 7))} week${Math.round(d / 7) === 1 ? '' : 's'}`;
  const who = `${p.firstName} ${p.lastName}`.trim();
  const what = how === 'rehab' ? 'will follow a rehabilitation programme' : how === 'surgery' ? 'had his operation with the club surgeon' : 'was operated on by a leading specialist';
  const outcome = complication
    ? `There were complications, so he'll be out for about ${wk(inj.days)} (it would have been ${wk(before)}).${lasting ? ' The doctors warn he may have lost a little pace for good.' : ''}`
    : how === 'rehab'
      ? `He should be back in about ${wk(inj.days)}.`
      : `It went well. He should be back in about ${wk(inj.days)} instead of ${wk(before)}.`;
  const message = `${who} ${what}. ${outcome}${opt.cost ? ` The bill was ${fmtMoney(opt.cost)}.` : ''}`;
  addNews(state, { kind: 'injury', title: `${who}: ${how === 'rehab' ? 'rehab plan' : 'surgery update'}`, body: message, link: { screen: 'player', playerId: p.id, label: 'View player' } });
  return { ok: true, message };
}
