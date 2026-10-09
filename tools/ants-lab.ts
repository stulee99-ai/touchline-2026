import { newGame } from '../src/engine/generate.js';
import { traitsOf } from '../src/engine/traits.js';
import { posLabel } from '../src/engine/attributes.js';
const s = newGame(7, 'x', 'flying-ants');
const c = s.clubs[s.scenario!.clubId - 1];
console.log(c.name, c.short, c.stadium, c.capacity, c.reputation, 'balance', c.finance.balance, 'wageBudget', c.finance.wageBudget, 'tv', c.finance.tvShare);
for (const id of c.playerIds) {
  const p = s.players[id];
  console.log(String(p.squadNo).padStart(2), `${p.firstName} ${p.lastName}`.padEnd(18), p.nation, p.age, 'CA', p.ca, 'PA', p.pa, posLabel(p).padEnd(22), traitsOf(p).join(','), 'wage', p.wage, 'end', p.contractEnd);
}
const cas = c.playerIds.map((i) => s.players[i].ca).sort((a, b) => b - a);
console.log('xi', cas.slice(0, 11).reduce((a, b) => a + b, 0) / 11, 'n', cas.length);
console.log(s.scenario);
for (const n of s.news) console.log('---', n.title, '\n', n.body);
const eng = s.comps[0].clubIds.map((i) => s.clubs[i - 1]);
console.log(eng.map((x) => `${x.name}:${Math.round(x.finance.balance / 1e6)}`).join(' '));
const free = Object.values(s.players).filter((p) => p.clubId === null);
console.log('free agents', free.length, 'best', free.sort((a, b) => b.ca - a.ca).slice(0, 5).map((p) => p.lastName + p.ca).join(' '));
console.log('cups with FA:', s.cups.filter((cup) => cup.ties.some((t: any) => t.a === c.id || t.b === c.id) || (cup as any).table?.some?.((r: any) => r.clubId === c.id)).map((x) => x.id).join(','), s.cups.map(x=>x.id).join(','));
console.log('millwall:', s.extClubs.some((x) => x.name === 'Millwall'), 'city:', s.clubs.some((x) => x.name === 'Manchester City'));
