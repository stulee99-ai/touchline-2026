/**
 * The English pyramid: Championship, League One, League Two, play-offs, promotion and relegation.
 * Run with:  npx tsx --test tests/pyramid.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playDay, seasonOver, startNewSeason, takeCharge } from '../src/engine/game.js';
import { newGame, SAVE_VERSION } from '../src/engine/generate.js';
import { leagueTable } from '../src/engine/league.js';
import { migrateSave } from '../src/engine/migrate.js';
import { LEVELS, PYRAMIDS, promoteAndRelegate, isLowerLeague, tierOf } from '../src/engine/pyramid.js';
import { Rng } from '../src/engine/rng.js';
import { wageBill } from '../src/engine/finance.js';
import type { GameState } from '../src/engine/types.js';

const inLeague = (g: GameState, id: string) => g.clubs.filter((c) => c.leagueId === id);

test('pyramid: a new world has the English lower leagues, 24 clubs each', () => {
  const g = newGame(11);
  assert.equal(g.comps.length, 14);
  assert.equal(g.clubs.length, 280);
  assert.equal(SAVE_VERSION, 17);
  for (const [id, n] of [['ENG', 20], ['EN2', 24], ['EN3', 24], ['EN4', 24]] as const) {
    assert.equal(g.comps.find((c) => c.id === id)!.clubIds.length, n, `${id} size`);
    assert.equal(inLeague(g, id).length, n);
  }
  assert.deepEqual([tierOf('ENG'), tierOf('EN2'), tierOf('EN3'), tierOf('EN4')], [1, 2, 3, 4]);
  assert.ok(isLowerLeague('EN3') && !isLowerLeague('ENG') && !isLowerLeague('ESP'));
  assert.equal(g.pools!.ENG.length, 24, 'the National League pool');
  const names = g.clubs.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, 'club names are unique');
  for (const c of g.clubs.filter((x) => isLowerLeague(x.leagueId))) {
    assert.ok(c.playerIds.length >= 22 && c.playerIds.length <= 38, `${c.name} squad ${c.playerIds.length}`); // real squad lists run long
    assert.ok(c.playerIds.every((id) => g.players[id].clubId === c.id));
    assert.ok(c.playerIds.filter((id) => (g.players[id].pos.GK ?? 0) >= 15).length >= 2, `${c.name} keepers`);
    assert.ok(wageBill(g, c.id) > 0 && c.finance.tvShare > 0);
  }
  // Money follows the division: a League Two club is far poorer than a Premier League one.
  const avg = (id: string, f: (c: GameState['clubs'][number]) => number) => inLeague(g, id).reduce((a, c) => a + f(c), 0) / 20;
  assert.ok(avg('ENG', (c) => c.finance.tvShare) > avg('EN2', (c) => c.finance.tvShare) * 2);
  assert.ok(avg('EN2', (c) => wageBill(g, c.id)) > avg('EN4', (c) => wageBill(g, c.id)) * 2);
});

test('pyramid: the calendar has 46 league rounds and a play-off cup per division', () => {
  const g = newGame(12);
  for (const id of ['EN2', 'EN3', 'EN4']) {
    const fx = g.fixtures.filter((f) => f.comp === id);
    assert.equal(new Set(fx.map((f) => f.round)).size, 46, `${id} rounds`);
    assert.equal(fx.length, 24 * 23, `${id} games`);
    const dates = new Set(fx.map((f) => f.day));
    assert.ok(dates.size >= 46);
  }
  const efl = g.cups.find((c) => c.id === 'EFL')!;
  assert.ok(efl.rounds[0].name === 'First round' || efl.rounds.length >= 7, 'the EFL Cup starts with a first round');
});

test('pyramid: a season of promotion, relegation and play-offs keeps every division whole', () => {
  const g = newGame(13);
  takeCharge(g, 1, 'Test'); // Arsenal
  while (!seasonOver(g)) playDay(g);
  const top = (id: string, n: number) => leagueTable(g, id).slice(0, n).map((r) => r.clubId);
  const bottom = (id: string, n: number) => leagueTable(g, id).slice(-n).map((r) => r.clubId);
  const champ = top('EN2', 2), l1 = top('EN3', 2), l2 = top('EN4', 2);
  const relPL = bottom('ENG', 3), rel2 = bottom('EN2', 3), rel3 = bottom('EN3', 4);
  const relOut = bottom('EN4', 2);
  const po = g.cups.filter((c) => c.id.endsWith('PO'));
  assert.equal(po.length, 5, 'play-offs in the Championship, Leagues One and Two, the Segunda and Serie B');
  assert.ok(po.every((c) => c.winnerId), 'each play-off has a winner');
  const winners: Record<string, number> = {};
  for (const id of ['EN2', 'EN3', 'EN4']) winners[id] = g.cups.find((c) => c.id === id + 'PO')!.winnerId!;
  const poWinner = (id: string) => winners[id];
  const before = new Map(g.clubs.map((c) => [c.id, c.leagueId]));
  startNewSeason(g);
  for (const [id, n] of [['ENG', 20], ['EN2', 24], ['EN3', 24], ['EN4', 24]] as const) assert.equal(inLeague(g, id).length, n, `${id} still ${n}`);
  assert.equal(g.clubs.length, 280);
  for (const id of [...champ, poWinner('EN2')]) assert.equal(g.clubs.find((c) => c.id === id)!.leagueId, 'ENG', 'Championship promotion');
  for (const id of relPL) assert.equal(g.clubs.find((c) => c.id === id)!.leagueId, 'EN2', 'Premier League relegation');
  for (const id of [...l1, poWinner('EN3')]) assert.equal(g.clubs.find((c) => c.id === id)!.leagueId, 'EN2', 'League One promotion');
  for (const id of rel2) assert.equal(g.clubs.find((c) => c.id === id)!.leagueId, 'EN3');
  for (const id of [...l2, poWinner('EN4')]) assert.equal(g.clubs.find((c) => c.id === id)!.leagueId, 'EN3', 'League Two promotion');
  for (const id of rel3) assert.equal(g.clubs.find((c) => c.id === id)!.leagueId, 'EN4');
  // The bottom two of League Two go out; the same league slots hold the two who came in.
  assert.deepEqual(relOut.map((id) => before.get(id)), ['EN4', 'EN4']);
  for (const id of relOut) assert.ok(g.pools!.ENG.some((n) => n.name === g.movements![0].moves.find((m) => m[1] === 'League Two' && m[2] === 'National League' && n.name === m[0])?.[0]), 'the relegated clubs are in the non-league pool');
  assert.equal(g.pools!.ENG.length, 24);
  assert.equal(g.movements!.length, 1);
  assert.ok(g.movements![0].moves.length >= 24, 'moves recorded');
  // The new season is ready: fixtures for all nine leagues, and the manager (if still in a job) has a squad.
  for (const id of ['ENG', 'EN2', 'EN3', 'EN4']) assert.ok(g.fixtures.some((f) => f.comp === id && !f.result), `${id} fixtures`);
  // Relegated Premier League clubs get parachute payments; promoted ones lose theirs.
  for (const id of relPL) assert.ok((g.clubs.find((c) => c.id === id)!.finance.parachute ?? 0) >= 1, 'parachute');
  // Every player is somewhere sensible.
  for (const p of Object.values(g.players)) if (p.clubId != null) assert.ok(g.clubs.some((c) => c.id === p.clubId) || g.extClubs.some((c) => c.id === p.clubId), 'player has a club');
});

test('pyramid: relegation from League Two ends the manager\'s job there, and the club is swapped for a National League side', () => {
  const g = newGame(14);
  const club = inLeague(g, 'EN4')[5];
  takeCharge(g, club.id, 'Test');
  const oldName = club.name;
  const tables: Record<string, number[]> = {};
  for (const l of LEVELS) tables[l.id] = [...g.comps.find((c) => c.id === l.id)!.clubIds];
  tables.EN4 = tables.EN4.filter((id) => id !== club.id).concat(club.id); // bottom
  const res = promoteAndRelegate(g, new Rng(5), tables);
  assert.ok(res.userOut);
  assert.equal(res.userOld!.name, oldName);
  const slot = g.clubs.find((c) => c.id === club.id)!;
  assert.notEqual(slot.name, oldName, 'the slot now belongs to the promoted club');
  assert.ok(g.pools!.ENG.some((n) => n.name === oldName), 'the old club drops into the non-league pool');
  assert.equal(slot.leagueId, 'EN4');
  assert.ok(slot.playerIds.length >= 22, 'the new occupant has a squad');
});

test('pyramid: an older save is upgraded, and gets the lower leagues at the next rollover', () => {
  const w = newGame(15);
  takeCharge(w, 1, 'Test');
  const g = JSON.parse(JSON.stringify(w)) as GameState & { version: number };
  // Make it look like a v12 world: six leagues and no pyramid.
  const keep = new Set(g.clubs.filter((c) => !isLowerLeague(c.leagueId)).map((c) => c.id));
  g.clubs = g.clubs.filter((c) => keep.has(c.id));
  g.comps = g.comps.filter((c) => !isLowerLeague(c.id));
  const known = (id: number | null | undefined) => id == null || keep.has(id) || id > 10000;
  g.fixtures = g.fixtures.filter((f) => !isLowerLeague(f.comp) && known(f.homeId) && known(f.awayId));
  for (const c of g.cups) {
    c.ties = c.ties.filter((t) => known(t.homeId) && known(t.awayId));
    if (c.phaseClubs) c.phaseClubs = c.phaseClubs.filter(known);
    for (const r of c.rounds) r.entrants = r.entrants.filter(known);
  }
  g.offers = g.offers.filter((o) => known(o.buyerId) && known(o.sellerId));
  for (const id of Object.keys(g.players)) { const p = g.players[Number(id)]; if (p.clubId != null && !keep.has(p.clubId) && p.clubId < 10000) delete g.players[Number(id)]; }
  g.cups = g.cups.filter((c) => !c.id.endsWith('PO'));
  delete g.pools;
  delete g.movements;
  g.version = 12;
  const migrated = migrateSave(g)!;
  assert.ok(migrated, 'migrated');
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.comps.length, 6);
  assert.equal(migrated.clubs.length, 114);
  // At the rollover the pyramid appears, with last season's lower tables decided on strength alone.
  while (!seasonOver(migrated)) playDay(migrated);
  startNewSeason(migrated);
  assert.equal(migrated.comps.length, 14);
  assert.equal(migrated.clubs.length, 280);
  assert.equal(migrated.pools!.ENG.length, 24);
  assert.equal(inLeague(migrated, 'ENG').length, 20);
  assert.ok(migrated.fixtures.some((f) => f.comp === 'EN3' && !f.result));
});

test('pyramid: in Flying Ants mode Millwall are gone and the Championship still has 24 clubs', () => {
  const g = newGame(16, 'Test', 'flying-ants');
  assert.equal(inLeague(g, 'EN2').length, 24);
  assert.ok(!g.clubs.some((c) => c.name === 'Millwall'));
  assert.equal(g.pools!.ENG.length, 23, 'a National League club took the place');
  assert.ok(g.fixtures.filter((f) => f.comp === 'EN2').length === 24 * 23);
});

test('pyramid: every country has two tiers and a season moves clubs between them', () => {
  const g = newGame(17);
  takeCharge(g, 1, 'Test');
  for (const py of PYRAMIDS) {
    assert.ok(py.levels.length >= 2, `${py.country} has a lower division`);
    assert.ok((g.pools![py.country]?.length ?? 0) >= 18, `${py.country} has a pool`);
  }
  while (!seasonOver(g)) playDay(g);
  const tables: Record<string, number[]> = {};
  for (const l of LEVELS) tables[l.id] = leagueTable(g, l.id).map((r) => r.clubId);
  const playoffsBefore = g.cups.filter((c) => c.id.endsWith('PO')).map((c) => c.id);
  const size = new Map(LEVELS.map((l) => [l.id, g.comps.find((c) => c.id === l.id)!.clubIds.length]));
  startNewSeason(g);
  for (const l of LEVELS) assert.equal(inLeague(g, l.id).length, size.get(l.id), `${l.id} keeps its size`);
  for (const py of PYRAMIDS.filter((p) => p.country !== 'ENG')) {
    const [top, second] = py.levels;
    for (const id of tables[second.id].slice(0, second.up)) assert.equal(g.clubs.find((c) => c.id === id)!.leagueId, top.id, `${second.id} champions go up`);
    for (const id of tables[top.id].slice(-top.down)) assert.equal(g.clubs.find((c) => c.id === id)!.leagueId, second.id, `${top.id} bottom clubs go down`);
    assert.ok(g.fixtures.some((f) => f.comp === second.id && !f.result), `${second.id} has fixtures`);
    if (second.playoff) assert.ok(playoffsBefore.includes(second.id + 'PO'), `${second.id} had a play-off`);
  }
  assert.equal(g.clubs.length, 280);
  const names = g.clubs.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, 'club names stay unique');
});

test('pyramid: a v13 save keeps its English pool under pools.ENG', () => {
  const w = newGame(18);
  const g = JSON.parse(JSON.stringify(w)) as GameState & { version: number; nonLeague?: unknown };
  g.nonLeague = g.pools!.ENG;
  delete g.pools;
  g.version = 13;
  const m = migrateSave(g)!;
  assert.equal(m.version, SAVE_VERSION);
  assert.equal(m.pools!.ENG.length, 24);
  assert.equal((m as unknown as { nonLeague?: unknown }).nonLeague, undefined);
});

test('pyramid: relegation from the Segunda sends the club to the Primera Federación pool and a pool club takes its place', () => {
  const g = newGame(19);
  const club = inLeague(g, 'ES2')[7];
  takeCharge(g, club.id, 'Test');
  const oldName = club.name;
  const tables: Record<string, number[]> = {};
  for (const l of LEVELS) tables[l.id] = [...g.comps.find((c) => c.id === l.id)!.clubIds];
  tables.ES2 = tables.ES2.filter((id) => id !== club.id).concat(club.id);
  const res = promoteAndRelegate(g, new Rng(6), tables);
  assert.ok(res.userOut, 'the manager is out of a job');
  assert.ok(g.pools!.ESP.some((n) => n.name === oldName), 'the old club drops into the Spanish pool');
  assert.equal(g.pools!.ESP.length, 24);
  const slot = g.clubs.find((c) => c.id === club.id)!;
  assert.equal(slot.leagueId, 'ES2');
  assert.notEqual(slot.name, oldName);
  assert.ok(slot.playerIds.length >= 22);
});
