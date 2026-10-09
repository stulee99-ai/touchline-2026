import type { DrillKey, Player } from './types.js';

/** Small pure helpers for how preparation (sharpness, familiarity, drills) changes a match. No imports beyond types. */

export const DEFAULT_SHARP = 88;
export const sharpOf = (p: Player): number => p.sharp ?? DEFAULT_SHARP;

/** What the match engine needs to know about a side's preparation. */
export interface Prep {
  fam: number;
  drills: Record<DrillKey, number>;
}

/** Match multiplier from tactical familiarity: 75 is neutral. */
export const famFactor = (fam: number): number => 1 + (fam - 75) * 0.0015;

/** Match multiplier from how well drilled the side is in an instruction: 50 is neutral. */
export const drillFactor = (d: number): number => 1 + (d - 50) * 0.0012;

/** Match sharpness's effect on strength, fatigue and injury risk. */
export const sharpStrength = (s: number): number => 0.85 + 0.15 * (s / 100);
export const sharpFatigue = (s: number): number => 1 + (100 - s) * 0.008;
export const sharpInjury = (s: number): number => 1 + (100 - s) * 0.012;
