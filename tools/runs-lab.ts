/**
 * Runs lab: the same fixture with different arrows switched on, to check each has a visible
 * but not overwhelming effect, and that no set of arrows is simply better.
 * Run with:  npx tsx tools/runs-lab.ts [N]
 */
import { resolveLineup, getFormation } from '../src/engine/tactics.js';
import { teamSetup } from '../src/engine/game.js';
import { defaultTactics, newGame } from '../src/engine/generate.js';
import { MatchSim } from '../src/engine/match.js';
import { POS_ROLE } from '../src/engine/attributes.js';
import { Rng } from '../src/engine/rng.js';
import type { RunFlags } from '../src/engine/types.js';

declare const process: { argv: string[] };
const N = Number(process.argv[2] ?? 2000);
const state = newGame(7);
const home = state.clubs.find((c) => c.short === 'NFO')!;
const away = state.clubs.find((c) => c.short === 'BHA')!;
const formation = '4-2-3-1';
const slots = getFormation(formation).slots;

function run(label: string, pick: (slot: string, role: string) => RunFlags | null): void {
  const rng = new Rng(99);
  let gf = 0, ga = 0, pts = 0, shots = 0, sa = 0, offs = 0, cond = 0;
  for (let i = 0; i < N; i++) {
    home.tactics = defaultTactics(formation);
    away.tactics = defaultTactics(formation);
    const hs = { ...teamSetup(state, home, away, true), ai: false, tactics: { ...home.tactics } };
    const as = { ...teamSetup(state, away, home, false), ai: false, tactics: { ...away.tactics } };
    const xi = resolveLineup(home, state.players);
    hs.xi = xi;
    hs.runs = {};
    xi.forEach((id, k) => {
      const f = pick(slots[k], POS_ROLE[slots[k]]);
      if (f) hs.runs![id] = f;
    });
    const sim = new MatchSim(hs, as, state.players, rng);
    const out = sim.runToEnd();
    const r = out.summary;
    gf += r.hg; ga += r.ag; shots += r.stats.shots[0]; sa += r.stats.shots[1]; offs += r.stats.offsides[0];
    pts += r.hg > r.ag ? 3 : r.hg === r.ag ? 1 : 0;
    cond += xi.reduce((s, id) => s + (out.conditions[id] ?? 0), 0) / xi.length;
  }
  const f = (x: number) => (x / N).toFixed(2);
  console.log(`${label.padEnd(30)} GF ${f(gf)}  GA ${f(ga)}  diff ${((gf - ga) / N).toFixed(2)}  pts ${f(pts)}  shots ${f(shots)}-${f(sa)}  offs ${f(offs)}  cond ${f(cond)}`);
}

const ball: RunFlags = { ball: true };
const off: RunFlags = { off: true };
const both: RunFlags = { ball: true, off: true };
run('no arrows', () => null);
run('full backs: with ball', (s) => (s === 'DL' || s === 'DR' ? ball : null));
run('full backs: without ball', (s) => (s === 'DL' || s === 'DR' ? off : null));
run('wingers: with ball', (s) => (s === 'AML' || s === 'AMR' ? ball : null));
run('wingers: without ball', (s) => (s === 'AML' || s === 'AMR' ? off : null));
run('striker: without ball', (s) => (s === 'ST' ? off : null));
run('AMC: with ball', (s) => (s === 'AMC' ? ball : null));
run('holding mids: without ball', (s) => (s === 'DM' ? off : null));
run('centre-backs: with ball', (s) => (s === 'DC' ? ball : null));
run('everyone (outfield): with ball', (s) => (s === 'GK' ? null : ball));
run('everyone (outfield): without', (s) => (s === 'GK' ? null : off));
run('everyone (outfield): both', (s) => (s === 'GK' ? null : both));
