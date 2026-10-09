/**
 * Regen lab: do youth players grow into rounded footballers like the real ones?
 * Compares the attribute spread of real top players with regens grown from 16 to their peak.
 * Run with:  npx tsx tools/regen-lab.ts
 */
import { computeCA, MENTAL, PHYSICAL, shiftAbility, TECHNICAL, bestRole } from '../src/engine/attributes.js';
import { createPlayer, newGame } from '../src/engine/generate.js';
import { Rng } from '../src/engine/rng.js';
import type { AttrKey, Player, Pos } from '../src/engine/types.js';

const PERSONALITY = new Set<AttrKey>(['determination', 'aggression', 'flair', 'naturalFitness']);
const OUTFIELD: AttrKey[] = [...TECHNICAL, ...MENTAL, ...PHYSICAL].filter((k) => !PERSONALITY.has(k));

function spread(ps: Player[]) {
  const sd: number[] = [], lo: number[] = [], low5: number[] = [], range: number[] = [], pace: number[] = [], acc: number[] = [], top: number[] = [];
  for (const p of ps) {
    const v = OUTFIELD.map((k) => p.attrs[k]);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    sd.push(Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length));
    lo.push(Math.min(...v));
    low5.push(v.filter((x) => x <= 5).length);
    range.push(Math.max(...v) - Math.min(...v));
    pace.push(p.attrs.pace); acc.push(p.attrs.acceleration);
    top.push(v.filter((x) => x >= 19).length);
  }
  const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
  const pct = (xs: number[], f: (x: number) => boolean) => ((100 * xs.filter(f).length) / xs.length).toFixed(0) + '%';
  return `n=${ps.length}  CA ${avg(ps.map((p) => p.ca))}  SD ${avg(sd)}  lowest ${avg(lo)}  attrs<=5 ${avg(low5)}  19+ ${avg(top)}  range ${avg(range)}  pace ${avg(pace)} acc ${avg(acc)}  pace or acc <=8: ${pct(pace.map((x, i) => Math.min(x, acc[i])), (x) => x <= 8)}`;
}

const g = newGame(7);
const real = Object.values(g.players).filter((p) => p.ca >= 150 && (p.pos.GK ?? 0) < 15);
console.log('Real players, CA 150+:        ', spread(real));
const real130 = Object.values(g.players).filter((p) => p.ca >= 125 && p.ca < 150 && (p.pos.GK ?? 0) < 15);
console.log('Real players, CA 125-149:     ', spread(real130));

// Regens: born at 16 with a top potential, then grown month by month to their peak at 27.
const rng = new Rng(42);
const grown: Player[] = [];
const state = { nextPlayerId: 900000 };
const POS: Pos[] = ['DC', 'DR', 'DL', 'DM', 'MC', 'MR', 'ML', 'AMC', 'AMR', 'AML', 'ST'];
for (let i = 0; i < 600; i++) {
  const pos = POS[i % POS.length];
  const ca = 60 + rng.int(0, 30);
  const pa = 150 + rng.int(0, 45);
  const p = createPlayer(rng, state, { pos, ca, pa, age: 16, clubId: 1, nation: 'ENG' });
  for (let age = 16; age < 27; age++) {
    for (let m = 0; m < 10; m++) {
      const room = p.pa - p.ca;
      const rate = age <= 20 ? 0.39 : age <= 23 ? 0.34 : 0.24;
      const raw = (room * rate) / 10;
      const d = Math.trunc(raw) + (rng.chance(raw - Math.trunc(raw)) ? 1 : 0);
      if (d) shiftAbility(rng, p, d);
    }
    p.age++;
  }
  if (p.ca >= 150) grown.push(p);
  void bestRole; void computeCA;
}
console.log('Regens grown to CA 150-170:   ', spread(grown.filter((p) => p.ca <= 170)));
console.log('Regens grown to CA 171+:      ', spread(grown.filter((p) => p.ca > 170)));
console.log('Real players, CA 150-170:     ', spread(real.filter((p) => p.ca <= 170)));
