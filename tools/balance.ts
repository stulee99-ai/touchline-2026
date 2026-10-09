/**
 * Headless balance check: simulate full seasons of all six leagues and print averages.
 * Run with:  npx tsx tools/balance.ts [seasons]
 *
 * Real-world targets for a top European league (roughly):
 *   goals/game 2.6–3.0 · home win 42–46% · draw 24–27% · away win 28–32%
 *   shots/team 11–14 · yellows/game 3.5–4.5 · reds/game ~0.15
 *   champion 80–95 pts (38 games) · bottom club 20–35 pts
 */
import { playDay, seasonOver, takeCharge } from '../src/engine/game.js';
import { newGame } from '../src/engine/generate.js';
import { leagueTable } from '../src/engine/league.js';

declare const process: { argv: string[] };

const seasons = Number(process.argv[2] ?? 5);
const t0 = Date.now();

interface Acc { games: number; goals: number; homeW: number; draws: number; awayW: number; shots: number; yel: number; red: number; champPts: number; bottomPts: number; titles: Map<string, number> }
const acc = new Map<string, Acc>();
const get = (id: string) => {
  if (!acc.has(id)) acc.set(id, { games: 0, goals: 0, homeW: 0, draws: 0, awayW: 0, shots: 0, yel: 0, red: 0, champPts: 0, bottomPts: 0, titles: new Map() });
  return acc.get(id)!;
};
let saveBytes = 0;

for (let s = 0; s < seasons; s++) {
  const state = newGame(1000 + s * 7919);
  takeCharge(state, 1, 'Test');
  while (!seasonOver(state)) playDay(state);
  for (const f of state.fixtures) {
    const a = get(f.comp);
    const r = f.result!;
    a.games++;
    a.goals += r.hg + r.ag;
    if (r.hg > r.ag) a.homeW++; else if (r.hg < r.ag) a.awayW++; else a.draws++;
    a.shots += r.stats.shots[0] + r.stats.shots[1];
    for (const e of r.events) {
      if (e.kind === 'yellow') a.yel++;
      if (e.kind === 'red') a.red++;
    }
  }
  for (const c of state.comps) {
    const t = leagueTable(state, c.id);
    const a = get(c.id);
    a.champPts += t[0].pts;
    a.bottomPts += t[t.length - 1].pts;
    const champ = state.clubs.find((x) => x.id === t[0].clubId)!.short;
    a.titles.set(champ, (a.titles.get(champ) ?? 0) + 1);
  }
  saveBytes = JSON.stringify(state).length;
}

console.log(`${seasons} seasons in ${((Date.now() - t0) / 1000).toFixed(1)}s · save ${(saveBytes / 1e6).toFixed(2)} MB raw JSON`);
for (const [id, a] of acc) {
  const pct = (n: number) => ((n / a.games) * 100).toFixed(0) + '%';
  console.log(`${id}  g/g ${(a.goals / a.games).toFixed(2)}  H/D/A ${pct(a.homeW)}/${pct(a.draws)}/${pct(a.awayW)}  shots ${(a.shots / a.games / 2).toFixed(1)}  Y ${(a.yel / a.games).toFixed(1)} R ${(a.red / a.games).toFixed(2)}  champ ${(a.champPts / seasons).toFixed(0)} bottom ${(a.bottomPts / seasons).toFixed(0)}  titles ${[...a.titles].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
