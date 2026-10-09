import { newGame } from '../src/engine/generate.js';
import { autoPickXI } from '../src/engine/tactics.js';
const s = newGame(2000, 'x', 'flying-ants');
const rows = s.comps[0].clubIds.map((id) => {
  const c = s.clubs[id - 1];
  const xi = autoPickXI(c, s.players).map((i) => s.players[i].ca);
  return { name: c.name, xi: Math.round(xi.reduce((a, b) => a + b, 0) / 11), min: Math.min(...xi) };
}).sort((a, b) => a.xi - b.xi);
console.log(rows.map((r) => `${r.name} ${r.xi}/${r.min}`).join(' | '));
