/** Play Flying Ants seasons with the AI in charge of them: where do they finish? */
import { playDay, seasonOver, takeCharge } from '../src/engine/game.js';
import { newGame } from '../src/engine/generate.js';
import { leagueTable } from '../src/engine/league.js';
declare const process: { argv: string[] };
const n = Number(process.argv[2] ?? 4);
const out: string[] = [];
for (let k = 0; k < n; k++) {
  const s = newGame(2000 + k * 31, 'Test', 'flying-ants');
  takeCharge(s, 1, 'Test'); // manage Arsenal; Flying Ants are run by the computer
  while (!seasonOver(s)) playDay(s);
  const t = leagueTable(s, 'ENG');
  const i = t.findIndex((r) => r.clubId === s.scenario!.clubId);
  const c = s.clubs[s.scenario!.clubId - 1];
  const rw = s.players[c.playerIds.find((id) => s.players[id].lastName === 'Roworth')!];
  out.push(`seed ${k}: Flying Ants ${i + 1}th, ${t[i].pts} pts (GD ${t[i].gf - t[i].ga}); bottom ${t[19].pts}; Roworth apps ${rw.stats.apps} goals ${rw.stats.goals}; freed players still free: ${Object.values(s.players).filter((p) => p.clubId === null).length}`);
}
console.log(out.join('\n'));
