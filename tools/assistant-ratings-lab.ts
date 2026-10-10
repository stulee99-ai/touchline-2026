/**
 * Assistant ratings lab: how much does a better or worse assistant matter?
 *  - Picking: the XI and bench he picks (judging players), with the manager otherwise hands-off.
 *  - Skip to full time from kick-off (reading the game and judging players together).
 * Same fixtures and random seeds for every rating, so the differences come from his decisions.
 * Run with:  npx tsx tools/assistant-ratings-lab.ts [matches per fixture]
 */
import { teamSetup, takeCharge } from '../src/engine/game.js';
import { newGame } from '../src/engine/generate.js';
import { MatchSim } from '../src/engine/match.js';
import { Rng } from '../src/engine/rng.js';
import type { Club } from '../src/engine/types.js';

declare const process: { argv: string[] };
const N = Number(process.argv[2] ?? 600);
const state = newGame(7);
const byShort = (s: string) => state.clubs.find((c) => c.short === s)!;
const FIXTURES: [string, string, boolean][] = [['ARS', 'HUL', true], ['BRE', 'FUL', true], ['EVE', 'NFO', false], ['COV', 'LIV', false]];
const LEVELS = [20, 14, 8, 4];

function play(me: Club, opp: Club, home: boolean, level: number, skip: boolean, seed: number): number {
  state.userClubId = me.id;
  me.lineup = null;
  me.bench = null;
  me.assistant = { id: 9000 + me.id, name: 'Lab', nation: 'ENG', age: 50, read: level, judge: level, wage: 1, joined: 2026 };
  const ms = teamSetup(state, me, opp, home);
  const os = { ...teamSetup(state, opp, me, !home), ai: true };
  const hs = home ? ms : os;
  const as = home ? os : ms;
  const side: 0 | 1 = home ? 0 : 1;
  const sim = new MatchSim(hs, as, state.players, new Rng(seed), { commentary: true, human: [home, !home] });
  if (skip) sim.setHuman(side, false);
  while (!sim.finished) sim.step();
  const r = sim.outcome().summary;
  const gf = side === 0 ? r.hg : r.ag;
  const ga = side === 0 ? r.ag : r.hg;
  delete me.assistant;
  return gf > ga ? 3 : gf === ga ? 1 : 0;
}

takeCharge(state, byShort('ARS').id, 'Lab');
for (const skip of [false, true]) {
  console.log(skip ? '\nAssistant picks the team AND runs the match (skip from kick-off):' : '\nAssistant picks the team; manager hands-off during the match:');
  for (const level of LEVELS) {
    let pts = 0;
    for (const [a, b, home] of FIXTURES) for (let i = 0; i < N; i++) pts += play(byShort(a), byShort(b), home, level, skip, 5000 + i);
    console.log(`  ratings ${String(level).padStart(2)}: ${(pts / (N * FIXTURES.length)).toFixed(3)} points a game`);
  }
}
