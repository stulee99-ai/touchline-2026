/**
 * Round 2, batch C: summer tournaments and the Ballon d'Or.
 * Run with:  npx tsx --test tests/round2c.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ballonDays } from '../src/engine/ballon.js';
import { playerValue } from '../src/engine/finance.js';
import { playDay, takeCharge } from '../src/engine/game.js';
import { newGame, SAVE_VERSION } from '../src/engine/generate.js';
import { migrateSave } from '../src/engine/migrate.js';
import { coverEnds, HOLIDAY_DAYS, keepCover, tournamentsIn } from '../src/engine/tournaments.js';
import { available, autoPickXI, BENCH_SIZE, pickBench } from '../src/engine/tactics.js';
import { MAX_SQUAD, squadCount } from '../src/engine/transfers.js';

test('tournaments: the real cycle of World Cups, Euros, Copas, AFCONs and Gold Cups', () => {
  assert.deepEqual(tournamentsIn(2026), ['WC']);
  assert.deepEqual(tournamentsIn(2027), ['AFCON', 'GOLD']);
  assert.deepEqual(tournamentsIn(2028), ['EURO', 'COPA', 'AFCON']);
  assert.deepEqual(tournamentsIn(2029), ['GOLD']);
  assert.deepEqual(tournamentsIn(2030), ['WC']);
  assert.deepEqual(tournamentsIn(2031), ['GOLD']);
  assert.deepEqual(tournamentsIn(2032), ['EURO', 'COPA', 'AFCON']);
});

test('tournaments: the 2026 World Cup from the start of a career, to the awards and the players\' return', () => {
  const g = newGame(7);
  const t = g.intl.tournaments![0];
  assert.equal(t.id, 'WC2026');
  assert.deepEqual(t.groups[0].teams, ['MEX', 'RSA', 'KOR', 'CZE']);
  assert.deepEqual(t.groups[11].teams, ['ENG', 'CRO', 'GHA', 'PAN']);
  const group = g.intl.matches.filter((m) => m.comp === t.id && !m.ko);
  assert.equal(group.length, 72);
  assert.ok(group.some((m) => m.result) && group.some((m) => !m.result), 'games before the career began are played; the rest wait');
  takeCharge(g, g.clubs.find((c) => c.short === 'ARS')!.id, 'Test');
  const ars = g.clubs.find((c) => c.short === 'ARS')!;
  const away = ars.playerIds.filter((id) => g.players[id].away);
  assert.ok(away.length >= 8, `Arsenal's internationals are at the World Cup (${away.length})`);
  assert.ok(g.news.some((n) => /World Cup 2026 is under way/.test(n.title)), 'the manager is told');
  while (g.day <= t.final) playDay(g);
  assert.ok(t.winner && t.runnerUp, 'there is a winner');
  assert.equal(g.intl.matches.filter((m) => m.comp === t.id && m.stage === 'Round of 32').length, 16);
  assert.equal(g.intl.matches.filter((m) => m.comp === t.id && m.stage === 'Final').length, 1);
  assert.ok(g.news.some((n) => /World Cup 2026 semi-finals/.test(n.title)));
  assert.ok(g.news.some((n) => /World Cup 2026 final:/.test(n.title)));
  assert.ok(t.player && t.young, 'player and young player of the tournament');
  assert.ok(g.players[t.young!.id].age <= 21);
  assert.ok(g.players[t.player!.id].honours?.includes('Player of the World Cup 2026'));
  while (g.day <= t.final + HOLIDAY_DAYS + 1) playDay(g);
  assert.equal(Object.values(g.players).filter((p) => p.away).length, 0, 'everyone is back three weeks after his country went out');
});

test('Ballon d\'Or: nominees in August, ceremony in September, and the winner\'s fame', () => {
  const g = newGame(7);
  takeCharge(g, g.clubs.find((c) => c.short === 'ARS')!.id, 'Test');
  const { shortlist, ceremony } = ballonDays(g.season);
  while (g.day < shortlist) playDay(g);
  playDay(g);
  const ed = g.ballon!.editions.find((e) => e.year === 2026)!;
  assert.ok(ed && ed.shortlisted && !ed.done);
  assert.equal(ed.nominees.length, 30);
  assert.ok(g.news.some((n) => n.title === 'Ballon d\'Or 2026: the 30 nominees'));
  while (g.day <= ceremony) playDay(g);
  assert.ok(ed.done);
  const w = g.players[ed.nominees[0].id];
  assert.ok(g.news.some((n) => n.title === `${ed.nominees[0].name} wins the Ballon d'Or 2026`));
  assert.ok(w.honours?.includes('Ballon d\'Or 2026'));
  assert.ok((w.fame ?? 0) >= 3);
  assert.ok(ed.kopa && g.players[ed.kopa.id].age <= 21);
  assert.ok(ed.yashin && (g.players[ed.yashin.id].pos.GK ?? 0) >= 20);
  const famous = playerValue(w, g.season, g.day, 'ENG');
  const plain = playerValue({ ...w, fame: 0 }, g.season, g.day, 'ENG');
  assert.ok(famous > plain * 1.1, `fame adds to his value (${famous} v ${plain})`);
});

test('tournaments: academy players cover for the internationals, then go back unless kept', () => {
  const g = newGame(7);
  const real = g.clubs.find((c) => c.short === 'RMA')!;
  takeCharge(g, real.id, 'Test');
  const squad = () => real.playerIds.map((id) => g.players[id]);
  const cover = squad().filter((p) => p.cover);
  assert.ok(cover.length > 0, 'Real Madrid call up academy players');
  assert.ok(squad().filter(available).length >= 20, 'enough for a full matchday squad');
  const xi = autoPickXI(real, g.players);
  assert.equal(pickBench(real, g.players, xi).length, BENCH_SIZE);
  assert.ok(cover.every((p) => p.age <= 19 && p.releaseClause && p.wage > 0), 'young, paid, and with a Spanish release clause');
  assert.equal(squadCount(real, g.players), real.playerIds.length - cover.length, 'they do not count towards the squad limit');
  assert.ok(squadCount(real, g.players) <= MAX_SQUAD);
  assert.ok(g.news.some((n) => /academy player/.test(n.body)), 'the manager is told');
  const kept = cover[0];
  keepCover(g, kept);
  const until = coverEnds(g.intl.tournaments!.filter((t) => t.year === g.season));
  assert.ok(cover.slice(1).every((p) => p.cover?.until === until));
  while (g.day <= until) playDay(g);
  assert.ok(real.playerIds.includes(kept.id) && !kept.cover, 'the one he kept stays');
  assert.ok(cover.slice(1).every((p) => !real.playerIds.includes(p.id) && !g.players[p.id]), 'the rest go back to the academy');
  assert.ok(g.news.some((n) => n.title === 'Academy players return to the youth teams'));
  assert.equal(Object.values(g.players).filter((p) => p.cover).length, 0, 'every club sends them back');
});

test('migration: an older save gets the tournaments', () => {
  const g = newGame(7);
  takeCharge(g, 1, 'Test');
  delete g.intl.tournaments;
  delete g.ballon;
  (g as { version: number }).version = 16;
  g.day = 30; // after the World Cup
  const m = migrateSave(JSON.parse(JSON.stringify(g)))!;
  assert.equal(m.version, SAVE_VERSION);
  assert.deepEqual(m.intl.tournaments, []);
});
