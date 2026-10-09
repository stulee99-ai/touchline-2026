import type { RunFlags } from '../engine/types.js';

export const ARROW_BALL = `<svg viewBox="0 0 12 22" aria-hidden="true"><path d="M6 21V5M1.5 9.5 6 4l4.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const ARROW_OFF = `<svg viewBox="0 0 12 22" aria-hidden="true"><path d="M6 21V7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="3.2 2.6"/><path d="M1.5 9.5 6 4l4.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const RUN_HELP = 'Arrows above a shirt: a solid arrow means he runs with the ball (more carries and chances made, but he leaves space behind him); a dashed arrow means he makes forward runs without it (more chances on the end of moves, but more offsides and a gap at the back).';

/** The two arrow toggles above a shirt: run with the ball, and run without it. */
export function runControls(x: number, y: number, playerId: number, flags: RunFlags, act: string): string {
  const btn = (k: 'ball' | 'off', on: boolean) =>
    `<button class="run ${k}${on ? ' on' : ''}" data-act="${act}" data-id="${playerId}" data-k="${k}" aria-pressed="${on}" title="${k === 'ball' ? 'Runs with the ball' : 'Runs forward without the ball'}: ${on ? 'on' : 'off'}">${k === 'ball' ? ARROW_BALL : ARROW_OFF}</button>`;
  return `<div class="runctl" style="left:${x}%;bottom:${y}%">${btn('ball', !!flags.ball)}${btn('off', !!flags.off)}</div>`;
}
