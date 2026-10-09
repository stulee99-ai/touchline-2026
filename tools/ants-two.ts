/** Two seasons as Flying Ants, human-slot: checks nothing breaks across a season change. */
import { playDay, seasonOver, startNewSeason, takeCharge } from '../src/engine/game.js';
import { newGame } from '../src/engine/generate.js';
import { leagueTable } from '../src/engine/league.js';
const s = newGame(3131, 'Test', 'flying-ants');
takeCharge(s, s.scenario!.clubId, 'Test');
let guard = 0;
while (!seasonOver(s) && guard++ < 2000) playDay(s);
const t = leagueTable(s, 'ENG');
console.log('season 1: FA', t.findIndex((r) => r.clubId === s.scenario!.clubId) + 1, 'of', t.length);
startNewSeason(s);
for (let i = 0; i < 80; i++) playDay(s);
const ucl = s.cups.find((c) => c.id === 'UCL');
console.log('season 2 day', s.day, 'cups', s.cups.length, 'FA fixtures', s.fixtures.filter((f) => f.homeId === s.scenario!.clubId || f.awayId === s.scenario!.clubId).length, 'UCL?', !!ucl);
console.log('extClubs Millwall/City:', s.extClubs.some((c) => c.name === 'Millwall' || c.name === 'Manchester City'), 'headlines', s.news.filter((n) => n.kind === 'headline').length);
