/**
 * Tactics lab: replay the same fixture thousands of times with one instruction changed,
 * to check each option has a visible but not overwhelming effect.
 * Run with:  npx tsx tools/tactics-lab.ts
 */
import { teamSetup } from '../src/engine/game.js';
import { defaultTactics, newGame } from '../src/engine/generate.js';
import { MatchSim } from '../src/engine/match.js';
import { Rng } from '../src/engine/rng.js';
import type { Tactics } from '../src/engine/types.js';

const N = 3000;
const state = newGame(7);
const home = state.clubs.find((c) => c.short === 'NFO')!;
const away = state.clubs.find((c) => c.short === 'BHA')!;

function run(label: string, mine: Partial<Tactics>, theirs: Partial<Tactics> = {}): void {
  const rng = new Rng(99);
  let gf = 0, ga = 0, pts = 0, poss = 0, shots = 0, fouls = 0;
  for (let i = 0; i < N; i++) {
    home.tactics = { ...defaultTactics('4-2-3-1'), ...mine };
    away.tactics = { ...defaultTactics('4-2-3-1'), ...theirs };
    const hs = { ...teamSetup(state, home, away, true), ai: false, tactics: { ...home.tactics } };
    const as = { ...teamSetup(state, away, home, false), ai: false, tactics: { ...away.tactics } };
    const sim = new MatchSim(hs, as, state.players, rng);
    const r = sim.runToEnd().summary;
    gf += r.hg; ga += r.ag; poss += r.stats.possession[0]; shots += r.stats.shots[0]; fouls += r.stats.fouls[0];
    pts += r.hg > r.ag ? 3 : r.hg === r.ag ? 1 : 0;
  }
  const f = (x: number) => (x / N).toFixed(2);
  console.log(`${label.padEnd(34)} GF ${f(gf)}  GA ${f(ga)}  pts ${f(pts)}  poss ${f(poss)}%  shots ${f(shots)}  fouls ${f(fouls)}`);
}

run('baseline', {});
run('attacking', { mentality: 'attacking' });
run('defensive', { mentality: 'defensive' });
run('short passing', { passing: 'short' });
run('long passing', { passing: 'long' });
run('closing down: all over', { closingDown: 'all-over' });
run('closing down: own half', { closingDown: 'own-half' });
run('hard tackling', { tackling: 'hard' });
run('counter vs attacking side', { counterAttack: true }, { mentality: 'attacking' });
run('no counter vs attacking side', {}, { mentality: 'attacking' });
run('offside trap', { offsideTrap: true });
