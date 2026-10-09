/** Board check: play seasons as clubs of different strength and see when (if ever) the sack comes. Run: npx tsx tools/board-check.ts */
import { playDay, playUntilUserMatch, seasonOver, takeCharge } from '../src/engine/game.js';
import { newGame } from '../src/engine/generate.js';
import { leagueTable } from '../src/engine/league.js';

for (const tier of ['top', 'mid', 'bottom'] as const) {
  let sacked = 0;
  const finals: number[] = [];
  const N = 6;
  for (let s = 0; s < N; s++) {
    const g = newGame(500 + s * 31);
    const eng = g.comps.find((c) => c.id === 'ENG')!;
    const ranked = eng.clubIds.map((id) => g.clubs.find((c) => c.id === id)!).sort((a, b) => b.reputation - a.reputation);
    const c = tier === 'top' ? ranked[1] : tier === 'mid' ? ranked[9] : ranked[17];
    takeCharge(g, c.id, 'T');
    while (!seasonOver(g) && !g.board!.sacked) { playUntilUserMatch(g); if (seasonOver(g)) break; playDay(g); }
    if (g.board!.sacked) sacked++;
    finals.push(Math.round(g.board!.confidence));
    void leagueTable;
  }
  console.log(`${tier}: sacked ${sacked}/${N}, final confidence ${finals.join(', ')}`);
}
