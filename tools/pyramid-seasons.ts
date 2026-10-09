/**
 * Plays seasons of the whole world with the computer in charge and reports on the pyramid:
 * league balance (goals, points), promotion and relegation, the play-offs, and how the
 * promoted clubs do in their first season up. Run with:  npx tsx tools/pyramid-seasons.ts [seasons] [seed]
 */
import { playDay, seasonOver, startNewSeason, takeCharge } from '../src/engine/game.js';
import { newGame } from '../src/engine/generate.js';
import { leagueTable } from '../src/engine/league.js';
import { tierOf } from '../src/engine/pyramid.js';

declare const process: { argv: string[] };
const seasons = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 2026);
const state = newGame(seed, 'Test', 'classic');
takeCharge(state, 1, 'Test');
const promotedLast = new Map<number, string>();
for (let s = 0; s < seasons; s++) {
  const t0 = Date.now();
  let days = 0;
  while (!seasonOver(state)) { playDay(state); days++; }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== ${state.season}/${state.season + 1}: ${days} match days in ${secs}s ===`);
  for (const c of state.comps) {
    const t = leagueTable(state, c.id);
    const fx = state.fixtures.filter((f) => f.comp === c.id && f.result);
    const goals = fx.reduce((a, f) => a + f.result!.hg + f.result!.ag, 0) / fx.length;
    const home = fx.filter((f) => f.result!.hg > f.result!.ag).length / fx.length;
    const draw = fx.filter((f) => f.result!.hg === f.result!.ag).length / fx.length;
    const nm = (i: number) => state.clubs.find((x) => x.id === t[i].clubId)!.short;
    console.log(`${c.name.padEnd(15)} goals ${goals.toFixed(2)} H/D ${(home * 100).toFixed(0)}/${(draw * 100).toFixed(0)}  champ ${t[0].pts} pts (${nm(0)}), 2nd ${t[1].pts}, 6th ${t[5].pts}, 3rd-last ${t[t.length - 3].pts}, last ${t[t.length - 1].pts} (${nm(t.length - 1)})`);
  }
  for (const [id, was] of promotedLast) {
    const c = state.clubs.find((x) => x.id === id)!;
    const t = leagueTable(state, c.leagueId);
    console.log(`  promoted last year: ${c.name} (${was}) -> ${t.findIndex((r) => r.clubId === id) + 1}th of ${t.length} in ${c.leagueId}`);
  }
  promotedLast.clear();
  const cupsLine = state.cups.filter((c) => c.id.endsWith('PO')).map((c) => `${c.name}: ${state.clubs.find((x) => x.id === c.winnerId)?.name ?? '?'}`);
  console.log(cupsLine.join(' | '));
  const before = state.clubs.map((c) => [c.id, c.leagueId] as const);
  startNewSeason(state);
  const mv = state.movements![state.movements!.length - 1];
  console.log('moves:', mv.moves.map((m: [string, string, string]) => `${m[0]} ${m[1]}->${m[2]}`).join('; '));
  for (const [id, lg] of before) {
    const c = state.clubs.find((x) => x.id === id)!;
    if (tierOf(lg) === 2 && tierOf(c.leagueId) === 1) promotedLast.set(id, c.name);
  }
  console.log('sacked?', state.board?.sacked ? 'yes' : 'no', 'pools', Object.entries(state.pools!).map(([k, v]) => `${k}:${v.length}`).join(' '), 'players', Object.keys(state.players).length);
}
