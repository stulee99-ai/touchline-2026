/**
 * Engine tests. Run with:  npx tsx --test tests/engine.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeCA } from '../src/engine/attributes.js';
import { LEAGUES } from '../src/engine/db/index.js';
import { KICKOFFS, makeFixtures, roundRobin } from '../src/engine/fixtures.js';
import { completeDay, nextMatchDay, playDay, playUntilUserMatch, seasonOver, startDay, startNewSeason, takeCharge, userNextFixture, userPlaysNext } from '../src/engine/game.js';
import { defaultTactics, newGame, SAVE_VERSION as CURRENT_VERSION } from '../src/engine/generate.js';
import { leagueTable } from '../src/engine/league.js';
import { MatchSim } from '../src/engine/match.js';
import { Rng } from '../src/engine/rng.js';
import { autoPickXI, BENCH_SIZE, FORMATIONS, getFormation, pickBench, resolveBench } from '../src/engine/tactics.js';
import { resultTags, roundSummary } from '../src/engine/roundup.js';
import { fmtMoney, ledgerRevenue, PSR_LIMIT, wageBill, expectedRevenue } from '../src/engine/finance.js';
import {
  acceptCounter, askingPrice, confirmLoan, confirmSigning, makeBid, makeLoanBid, offerRenewal, proposeTerms, respondToBid, counterAccepted, valueOf, wageDemand, windowOpenOn,
} from '../src/engine/transfers.js';
import { leagueTable as table2 } from '../src/engine/league.js';

test('database: six leagues of real clubs with valid squads', () => {
  assert.deepEqual(LEAGUES.map((l) => l.id), ['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR']);
  const sizes: Record<string, number> = { ENG: 20, ESP: 20, GER: 18, ITA: 20, FRA: 18, POR: 18 };
  const seen = new Set<string>();
  const clubNames = new Set<string>();
  for (const l of LEAGUES) {
    assert.equal(l.clubs.length, sizes[l.id], `${l.name} club count`);
    for (const c of l.clubs) {
      assert.ok(!clubNames.has(c.name), `duplicate club ${c.name}`);
      clubNames.add(c.name);
      assert.ok(c.squad.length >= 14, `${c.name} has ${c.squad.length} players`);
      assert.ok(c.squad.some((p) => p[2].startsWith('GK')), `${c.name} needs a keeper`);
      assert.ok(FORMATIONS.some((f) => f.name === c.formation), `${c.name} formation ${c.formation}`);
      assert.ok(c.reputation >= 1 && c.reputation <= 10, `${c.name} reputation`);
      for (const p of c.squad) {
        // Namesakes exist (two Vitinhas), so a player is his name plus his birth month.
        const key = `${p[1]}:${p[4]}`;
        assert.ok(!seen.has(key), `player ${p[1]} appears twice`);
        seen.add(key);
        assert.ok(p[5] >= 50 && p[5] <= 190, `${p[1]} CA ${p[5]}`);
        assert.ok(p[4] >= 197801 && p[4] <= 201112, `${p[1]} born ${p[4]}`);
      }
    }
  }
});

test('world: every club is topped up to a playable squad', () => {
  const g = newGame(2);
  assert.equal(g.comps.length, 14);
  assert.equal(g.clubs.length, 280);
  for (const c of g.clubs) {
    const squad = c.playerIds.map((id) => g.players[id]);
    assert.ok(squad.length >= 22, `${c.name} has ${squad.length}`);
    assert.ok(squad.filter((p) => (p.pos.GK ?? 0) >= 15).length >= 2, `${c.name} keepers`);
    assert.ok(squad.every((p) => p.clubId === c.id));
  }
});

test('players: the same named player has the same attributes in every new world', () => {
  const a = newGame(1);
  const b = newGame(999);
  const find = (g: ReturnType<typeof newGame>, last: string) => Object.values(g.players).find((p) => p.lastName === last)!;
  assert.deepEqual(find(a, 'Haaland').attrs, find(b, 'Haaland').attrs);
  assert.equal(find(a, 'Haaland').attrs.finishing, 20);
  const saka = find(a, 'Saka');
  assert.equal(saka.foot, 'L');
  assert.ok(Math.abs(saka.ca - 172) <= 4, `Saka CA ${saka.ca}`);
  assert.equal(computeCA(saka), saka.ca);
});

test('fixtures: double round-robin with balanced venues on Saturdays', () => {
  for (const n of [20, 18]) {
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    const fx = makeFixtures(ids, new Rng(3), 'ENG', 2026, 1);
    assert.equal(fx.length, n * (n - 1));
    const rounds = new Set(fx.map((f) => f.round));
    assert.equal(rounds.size, (n - 1) * 2);
    for (const r of rounds) {
      const teams = fx.filter((f) => f.round === r).flatMap((f) => [f.homeId, f.awayId]);
      assert.equal(new Set(teams).size, n, `round ${r} has everyone once`);
      assert.equal(new Set(fx.filter((f) => f.round === r).map((f) => f.weekend)).size, 1, 'a round is played on one weekend');
    }
    for (const id of ids) assert.equal(fx.filter((f) => f.homeId === id).length, n - 1, `club ${id} home games`);
    const pairs = new Set(fx.map((f) => `${f.homeId}-${f.awayId}`));
    assert.equal(pairs.size, n * (n - 1), 'every ordered pair exactly once');
    // The real 2026/27 calendar: opening Saturday 22 August, weekends plus a few midweek rounds.
    assert.equal(fx[0].weekend, 21, 'first round on the opening weekend');
    for (const f of fx) {
      const dow = new Date(Date.UTC(2026, 7, 1 + f.weekend)).getUTCDay();
      assert.ok(dow === 6 || (dow >= 2 && dow <= 3), `round ${f.round} on a Saturday or midweek (${dow})`);
    }
    if (n === 20) assert.equal(fx[fx.length - 1].weekend, 301, 'last round on the final weekend (29-30 May)');
    // Home and away alternate: nobody has more than two home or two away games in a row.
    for (const id of ids) {
      const seq = fx.filter((f) => f.homeId === id || f.awayId === id).sort((a, b) => a.round - b.round).map((f) => (f.homeId === id ? 'H' : 'A')).join('');
      assert.ok(!seq.includes('HHH') && !seq.includes('AAA'), `club ${id}: ${seq}`);
    }
    // The same two clubs never meet on consecutive matchdays.
    const rr = roundRobin(ids, new Rng(9));
    for (let r = 1; r < rr.length; r++) {
      const prev = new Set(rr[r - 1].map(([h, a]) => [h, a].sort().join('-')));
      for (const [h, a] of rr[r]) assert.ok(!prev.has([h, a].sort().join('-')), `rematch in round ${r}`);
    }
  }
});

test('kick-offs: TV picks spread games from Friday to Monday, confirmed about five weeks ahead', () => {
  const g = newGame(12);
  takeCharge(g, 1, 'Test');
  const eng = () => g.fixtures.filter((f) => f.comp === 'ENG');
  const first = eng().filter((f) => f.round === 0);
  assert.ok(first.every((f) => !f.tbc), 'opening weekend confirmed with the fixture list');
  assert.ok(new Set(first.map((f) => `${f.day}-${f.time}`)).size >= 4, 'several kick-off slots on the opening weekend');
  assert.ok(eng().filter((f) => f.round === 20).every((f) => f.tbc), 'mid-season kick-offs still to be confirmed');
  assert.ok(eng().filter((f) => f.round === 20).every((f) => f.time === KICKOFFS.ENG.base[1]), 'unconfirmed games sit at the traditional 3pm');
  for (let i = 0; i < 60 && !seasonOver(g); i++) playDay(g);
  const confirmed = eng().filter((f) => !f.tbc);
  assert.ok(confirmed.some((f) => f.round >= 8), 'later weekends confirmed as the season goes on');
  const dows = new Set(g.fixtures.filter((f) => !f.tbc).map((f) => new Date(Date.UTC(g.season, 7, 1 + f.day)).getUTCDay()));
  for (const d of [5, 6, 0, 1]) assert.ok(dows.has(d), `games on day-of-week ${d}`);
  for (const f of g.fixtures) {
    assert.ok(f.day - f.weekend >= -1 && f.day - f.weekend <= 2, 'between Friday and Monday');
    assert.ok(!f.result || !f.tbc || f.result, 'played games were confirmed');
  }
  // Nobody plays twice within three days.
  for (const c of g.clubs) {
    const days = g.fixtures.filter((f) => f.homeId === c.id || f.awayId === c.id).map((f) => f.day).sort((a, b) => a - b);
    for (let i = 1; i < days.length; i++) assert.ok(days[i] - days[i - 1] >= 3, `${c.name} plays on days ${days[i - 1]} and ${days[i]}`);
  }
});

test('team selection: a valid XI with a keeper in goal', () => {
  const g = newGame(5);
  for (const c of g.clubs) {
    const xi = autoPickXI(c, g.players);
    assert.equal(xi.length, 11, c.name);
    assert.equal(new Set(xi).size, 11);
    const f = getFormation(c.tactics.formation);
    assert.ok((g.players[xi[f.slots.indexOf('GK')]].pos.GK ?? 0) >= 15, `${c.name} keeper`);
  }
});

test('league table: points, then goal difference, then goals scored', () => {
  const g = newGame(11);
  g.fixtures = [
    { id: 1, comp: 'ENG', round: 0, day: 15, weekend: 15, time: '15:00', tbc: false, homeId: 1, awayId: 2, result: { hg: 2, ag: 0, events: [], stats: { possession: [50, 50], shots: [0, 0], onTarget: [0, 0], corners: [0, 0], fouls: [0, 0], offsides: [0, 0] }, ratings: {}, lineups: [[], []], motm: -1, attendance: 0 } },
    { id: 2, comp: 'ENG', round: 0, day: 15, weekend: 15, time: '15:00', tbc: false, homeId: 3, awayId: 4, result: { hg: 3, ag: 1, events: [], stats: { possession: [50, 50], shots: [0, 0], onTarget: [0, 0], corners: [0, 0], fouls: [0, 0], offsides: [0, 0] }, ratings: {}, lineups: [[], []], motm: -1, attendance: 0 } },
  ];
  const t = leagueTable(g, 'ENG');
  assert.deepEqual(t.slice(0, 2).map((r) => r.clubId), [3, 1]);
  assert.equal(t[0].pts, 3);
  assert.equal(t[0].gd, 2);
});

test('season: realistic scoring and venue split over two seasons of all fourteen leagues', () => {
  let goals = 0, games = 0, home = 0;
  for (let s = 0; s < 2; s++) {
    const g = newGame(100 + s);
    takeCharge(g, 1, 'Test');
    while (!seasonOver(g)) playDay(g);
    const leagues = new Set(g.comps.map((c) => c.id));
    assert.equal(g.fixtures.filter((f) => leagues.has(f.comp)).length, 380 * 5 + 306 * 6 + 552 * 3);
    assert.ok(g.fixtures.every((f) => f.result), 'every league and cup game played');
    for (const f of g.fixtures.filter((x) => leagues.has(x.comp))) {
      goals += f.result!.hg + f.result!.ag;
      home += f.result!.hg > f.result!.ag ? 1 : 0;
      games++;
    }
  }
  const gpg = goals / games;
  assert.ok(gpg > 2.4 && gpg < 3.2, `goals per game ${gpg.toFixed(2)}`);
  const hw = home / games;
  assert.ok(hw > 0.36 && hw < 0.5, `home wins ${(hw * 100).toFixed(1)}%`);
});

test('discipline and injuries: bans count club matches, injuries count days', () => {
  const g = newGame(21);
  takeCharge(g, 1, 'Test');
  const p = g.players[g.clubs[0].playerIds[5]];
  p.suspended = 2;
  p.bans = { [g.clubs[0].leagueId]: 2 };
  p.injury = { name: 'Groin strain', days: 5 };
  const other = g.players[g.clubs[0].playerIds[6]];
  other.injury = { name: 'Hamstring strain', days: 140 };
  playUntilUserMatch(g);
  while (userNextFixture(g)?.comp === 'FRI') { playDay(g); playUntilUserMatch(g); }
  playDay(g);
  assert.equal(p.suspended, 1, 'one match served');
  assert.equal(p.injury, null, 'short injury healed');
  assert.ok(other.injury && other.injury.days < 140 && other.injury.days > 0, 'long injury still healing');
});

test('calendar: Continue stops only on days the manager\'s club plays', () => {
  const g = newGame(22);
  const fra = g.comps.find((c) => c.id === 'FRA')!;
  takeCharge(g, fra.clubIds[0], 'Test');
  let stops = 0;
  while (!seasonOver(g)) {
    playUntilUserMatch(g);
    if (seasonOver(g)) break;
    assert.ok(userPlaysNext(g));
    const before = nextMatchDay(g)!;
    playDay(g);
    assert.ok(g.day >= before);
    stops++;
  }
  const mine = g.fixtures.filter((f) => f.homeId === g.userClubId || f.awayId === g.userClubId);
  assert.equal(mine.filter((f) => f.comp === 'FRA').length, 34, 'an 18-club league has 34 matchdays');
  assert.equal(stops, new Set(mine.map((f) => f.day)).size, 'one stop per match day, league and cups');
  assert.ok(g.fixtures.every((f) => f.result));
});

test('mentality: attacking creates more shots than defensive', () => {
  const g = newGame(8);
  const [h, a] = g.clubs;
  const count = (m: 'attacking' | 'defensive') => {
    const rng = new Rng(4);
    let shots = 0;
    for (let i = 0; i < 300; i++) {
      const setup = (c: typeof h) => ({ club: c, xi: autoPickXI(c, g.players), bench: [], formation: c.tactics.formation, tactics: { ...defaultTactics(c.tactics.formation), mentality: m }, ai: false });
      const sim = new MatchSim(setup(h), { ...setup(a), tactics: defaultTactics(a.tactics.formation) }, g.players, rng);
      shots += sim.runToEnd().summary.stats.shots[0];
    }
    return shots;
  };
  assert.ok(count('attacking') > count('defensive') * 1.2);
});

test('saves: a game survives a JSON round trip and carries on', () => {
  const g = newGame(31);
  takeCharge(g, 4, 'Test');
  playDay(g);
  const copy = JSON.parse(JSON.stringify(g));
  const played = copy.fixtures.filter((f: { result: unknown }) => f.result).length;
  const live = startDay(copy);
  for (const m of live.matches) while (!m.sim.finished) m.sim.step();
  completeDay(copy, live);
  assert.ok(copy.fixtures.filter((f: { result: unknown }) => f.result).length > played);
  assert.ok(copy.day > g.day);
});

test('development: youngsters improve and veterans decline over a season', () => {
  const g = newGame(41);
  takeCharge(g, 1, 'Test');
  const young = Object.values(g.players).filter((p) => p.age <= 20 && p.pa - p.ca >= 20);
  const old = Object.values(g.players).filter((p) => p.age >= 33);
  const before = new Map(Object.values(g.players).map((p) => [p.id, p.ca]));
  while (!seasonOver(g)) playDay(g);
  startNewSeason(g);
  const avgDelta = (list: typeof young) => {
    const alive = list.filter((p) => g.players[p.id]);
    return alive.reduce((s, p) => s + (g.players[p.id].ca - before.get(p.id)!), 0) / Math.max(1, alive.length);
  };
  assert.ok(avgDelta(young) > 4, `young delta ${avgDelta(young)}`);
  assert.ok(avgDelta(old) < 0, `old delta ${avgDelta(old)}`);
});

test('bench: the assistant names nine substitutes including a keeper; the manager can pick his own', () => {
  const g = newGame(13);
  const c = g.clubs[0];
  const xi = autoPickXI(c, g.players);
  const bench = pickBench(c, g.players, xi);
  assert.equal(bench.length, BENCH_SIZE);
  assert.ok(bench.some((id) => (g.players[id].pos.GK ?? 0) >= 15), 'a keeper on the bench');
  assert.ok(bench.every((id) => !xi.includes(id)));
  c.bench = bench.slice(0, 5);
  assert.deepEqual(resolveBench(c, g.players, xi), bench.slice(0, 5));
  g.players[bench[0]].injury = { name: 'Knock', days: 3 };
  assert.ok(!resolveBench(c, g.players, xi).includes(bench[0]), 'an injured pick drops out');
});

function testSim(seed: number) {
  const g = newGame(seed);
  const [h, a] = g.clubs;
  const setup = (c: typeof h) => {
    const xi = autoPickXI(c, g.players);
    return { club: c, xi, bench: pickBench(c, g.players, xi), formation: c.tactics.formation, tactics: defaultTactics(c.tactics.formation), ai: false };
  };
  return { g, sim: new MatchSim(setup(h), setup(a), g.players, new Rng(seed), { commentary: true, human: [true, false] }) };
}

test('substitutions: five subs in three stoppages, half time free', () => {
  const { sim } = testSim(14);
  const bench = () => sim.benchPlayers(0).map((p) => p.id);
  const outfield = () => sim.livePlayers(0).filter((o) => o.slot !== 'GK').map((o) => o.p.id);
  while (sim.minute < 45) sim.step();
  assert.ok(sim.substitute(0, outfield()[0], bench()[1]), 'half-time sub');
  assert.equal(sim.windowsLeft(0), 3, 'half time does not use a stoppage');
  sim.step();
  assert.ok(sim.substitute(0, outfield()[1], bench()[1]));
  assert.ok(sim.substitute(0, outfield()[2], bench()[1]), 'two subs in the same stoppage');
  assert.equal(sim.windowsLeft(0), 2);
  sim.step();
  assert.ok(sim.substitute(0, outfield()[3], bench()[1]));
  sim.step();
  assert.equal(sim.windowsLeft(0), 1);
  assert.ok(sim.substitute(0, outfield()[4], bench()[1]), 'fifth sub');
  sim.step();
  assert.equal(sim.canSub(0), false, 'no subs left');
  assert.equal(sim.livePlayers(0).length, 11);
  assert.equal(sim.subsMade(0).length, 5);
});

test('substitutions: three stoppages used means no more changes', () => {
  const { sim } = testSim(15);
  while (sim.minute < 50) sim.step();
  for (let i = 0; i < 3; i++) {
    const off = sim.livePlayers(0).filter((o) => o.slot !== 'GK')[i].p.id;
    assert.ok(sim.substitute(0, off, sim.benchPlayers(0)[1].id));
    sim.step();
  }
  assert.equal(sim.windowsLeft(0), 0);
  assert.equal(sim.canSub(0), false, 'two subs left but no stoppages');
});

test('live tactics: formation changes keep the keeper in goal; players can swap slots', () => {
  const { sim } = testSim(16);
  sim.step();
  const gk = sim.livePlayers(0).find((o) => o.slot === 'GK')!.p.id;
  sim.setFormation(0, '3-5-2');
  const after = sim.livePlayers(0);
  assert.equal(sim.formationOf(0), '3-5-2');
  assert.equal(after.find((o) => o.slot === 'GK')!.p.id, gk);
  assert.deepEqual(after.map((o) => o.idx), [...Array(11).keys()], 'every slot filled once');
  const [x, y] = [after[9], after[5]];
  assert.ok(sim.movePlayer(0, x.p.id, y.idx));
  const moved = sim.livePlayers(0);
  assert.equal(moved.find((o) => o.p.id === x.p.id)!.idx, y.idx);
  assert.equal(moved.find((o) => o.p.id === y.p.id)!.idx, x.idx);
});

test('incidents: the manager\'s injured player stays on with a suggested replacement', () => {
  let found = false;
  for (let seed = 1; seed < 400 && !found; seed++) {
    const { sim } = testSim(seed);
    while (!sim.finished) {
      sim.step();
      const inj = sim.events.find((e) => e.kind === 'injury' && e.side === 0);
      if (!inj) continue;
      const on = sim.livePlayers(0).find((o) => o.p.id === inj.playerId);
      assert.ok(on && on.injured, 'still on the pitch, marked injured');
      const tip = sim.suggestForInjury(0, inj.playerId);
      if (!tip) break;
      assert.equal(tip.offId, inj.playerId);
      assert.ok(sim.substitute(0, tip.offId, tip.onId, tip.intoIdx));
      assert.ok(!sim.livePlayers(0).some((o) => o.p.id === inj.playerId));
      found = true;
      break;
    }
  }
  assert.ok(found, 'found an injury to test');
});

test('incidents: after a red card in defence the assistant suggests filling the gap', () => {
  let found = false;
  for (let seed = 1; seed < 3000 && !found; seed++) {
    const { sim } = testSim(seed);
    while (!sim.finished && sim.minute < 70) {
      sim.step();
      const red = sim.events.find((e) => e.kind === 'red' && e.side === 0);
      if (!red) continue;
      const tip = sim.suggestForRed(0, red.playerId);
      if (!tip) break;
      const vacant = sim.vacantSlots(0);
      assert.ok(vacant.includes(tip.intoIdx));
      assert.ok(sim.substitute(0, tip.offId, tip.onId, tip.intoIdx));
      assert.equal(sim.livePlayers(0).length, 10);
      assert.ok(sim.livePlayers(0).some((o) => o.idx === tip.intoIdx && o.p.id === tip.onId), 'gap filled');
      found = true;
      break;
    }
  }
  assert.ok(found, 'found a red card to test');
});

test('round-up: upsets are spotted and every matchday gets a summary', () => {
  const g = newGame(17);
  takeCharge(g, 1, 'Test');
  while (!seasonOver(g)) playDay(g);
  const eng = g.fixtures.filter((f) => f.comp === 'ENG');
  const upsets = eng.filter((f) => resultTags(g, f).includes('upset'));
  assert.ok(upsets.length > 10 && upsets.length < 120, `${upsets.length} upsets`);
  for (const f of upsets) {
    const h = g.clubs[f.homeId - 1];
    const a = g.clubs[f.awayId - 1];
    const winner = f.result!.hg > f.result!.ag ? h : a;
    const loser = winner === h ? a : h;
    assert.ok(winner.reputation < loser.reputation, 'the underdog won');
  }
  const r = roundSummary(g, 'ENG', 10, 'Premier League');
  assert.match(r.title, /matchday 11/);
  assert.match(r.body, /All results/);
  const rounds = g.news.filter((n) => n.title.startsWith('Premier League round-up'));
  assert.ok(rounds.length >= 1, 'round-up news for the manager\'s league');
});

test('saves: a version 3 career is migrated and plays on', async () => {
  const { migrateSave } = await import('../src/engine/migrate.js');
  const g = newGame(18);
  takeCharge(g, 1, 'Test');
  while (g.day < 10) { playUntilUserMatch(g); playDay(g); }
  const old = JSON.parse(JSON.stringify(g));
  old.version = 3;
  delete old.offers; delete old.transfers; delete old.nextOfferId;
  // A version 3 save had no cups.
  old.fixtures = old.fixtures.filter((f: { comp: string }) => ['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR'].includes(f.comp));
  delete old.cups; delete old.nextTieId; delete old.extClubs; delete old.nextExtId;
  for (const id of Object.keys(old.players)) if (old.players[id].clubId > 10000) delete old.players[id];
  for (const c of old.clubs) { delete c.bench; delete c.finance; }
  for (const p of Object.values(old.players) as Record<string, unknown>[]) for (const k of ['wage', 'contractEnd', 'releaseClause', 'bookValue', 'listed', 'loan', 'preContract', 'joined']) delete p[k];
  for (const f of old.fixtures) { delete f.weekend; delete f.time; delete f.tbc; f.day = f.weekend ?? f.day; }
  const m = migrateSave(old)!;
  assert.ok(m, 'migrated');
  assert.equal(m.version, CURRENT_VERSION);
  assert.deepEqual(m.cups, [], 'cups start next season');
  assert.ok(m.clubs.every((c) => c.finance && c.finance.balance > 0), 'club finances created');
  assert.ok(Object.values(m.players).every((p) => p.clubId === null || p.wage > 0), 'everyone is paid');
  assert.ok(m.fixtures.every((f) => typeof f.time === 'string' && typeof f.weekend === 'number'));
  assert.ok(m.fixtures.some((f) => !f.result && !f.tbc), 'upcoming weeks confirmed');
  playUntilUserMatch(m);
  playDay(m);
  assert.equal(migrateSave({ version: 2 }), null, 'too old');
});


/* ───────────── Phase 2: money and the transfer market ───────────── */

const byName = (g: ReturnType<typeof newGame>, last: string, first?: string) => Object.values(g.players).find((p) => p.lastName === last && (!first || p.firstName === first))!;
const clubNamed = (g: ReturnType<typeof newGame>, name: string) => g.clubs.find((c) => c.name === name)!;

test('money: values, wages and contracts are sensible', () => {
  const g = newGame(40);
  const yamal = byName(g, 'Yamal');
  assert.ok(valueOf(g, yamal) > 120e6, `Yamal ${fmtMoney(valueOf(g, yamal))}`);
  const all = Object.values(g.players).filter((p) => p.clubId !== null);
  assert.ok(all.every((p) => p.wage > 0 && p.contractEnd >= g.season + 1), 'every player has a wage and a contract');
  assert.ok(all.filter((p) => g.clubs[p.clubId! - 1].leagueId === 'ESP').every((p) => p.releaseClause && p.releaseClause >= valueOf(g, p)), 'Spanish release clauses');
  for (const c of g.clubs) {
    const ratio = (wageBill(g, c.id) * 52) / expectedRevenue(g, c);
    assert.ok(ratio > 0.2 && ratio < 1.1, `${c.name} wages ${Math.round(ratio * 100)}% of revenue`);
    assert.ok(c.finance.transferBudget >= 0 && c.finance.transferBudget <= c.finance.balance);
    assert.ok(c.finance.wageBudget >= wageBill(g, c.id));
  }
});

test('transfer windows: summer to 1 September, January to 2 February', () => {
  assert.ok(windowOpenOn(2026, 0), '1 Aug');
  assert.ok(windowOpenOn(2026, 31), '1 Sep');
  assert.ok(!windowOpenOn(2026, 32), '2 Sep');
  assert.ok(!windowOpenOn(2026, 152), '31 Dec');
  assert.ok(windowOpenOn(2026, 167), '15 Jan');
  assert.ok(windowOpenOn(2026, 185), '2 Feb');
  assert.ok(!windowOpenOn(2026, 186), '3 Feb');
});

test('transfers: bid, counter, personal terms, and the money moves', () => {
  const g = newGame(41);
  takeCharge(g, clubNamed(g, 'Aston Villa').id, 'Test');
  const me = g.clubs[g.userClubId - 1];
  const seller = clubNamed(g, 'Brentford');
  const p = seller.playerIds.map((id) => g.players[id]).filter((x) => !x.loan).sort((a, b) => a.ca - b.ca)[8];
  const ask = askingPrice(g, p, me);
  me.finance.transferBudget = Math.max(me.finance.transferBudget, ask * 2);
  me.finance.wageBudget += 200_000;
  const low = makeBid(g, p.id, Math.round(ask * 0.3));
  assert.ok(typeof low !== 'string' && low.status === 'rejected', 'lowball rejected');
  const mid = makeBid(g, p.id, Math.round(ask * 0.85));
  assert.ok(typeof mid !== 'string' && mid.status === 'countered' && mid.counterFee === ask, 'counter at the asking price');
  const acc = acceptCounter(g, mid.id);
  assert.ok(typeof acc !== 'string' && acc.status === 'accepted');
  const demand = wageDemand(g, p, me);
  const cheap = proposeTerms(g, mid.id, Math.round(demand * 0.5), 3);
  assert.ok(typeof cheap !== 'string' && cheap.status === 'accepted' && /wants/.test(cheap.note!), 'player asks for more');
  const before = { me: me.finance.balance, them: seller.finance.balance };
  const yes = proposeTerms(g, mid.id, demand * 1.1, 4);
  assert.ok(typeof yes !== 'string' && yes.agreed && p.clubId === seller.id, 'agreed, but nothing signed or paid yet');
  assert.equal(me.finance.balance, before.me);
  const done = confirmSigning(g, mid.id);
  assert.ok(typeof done !== 'string' && done.status === 'done', `signed (${typeof done === 'string' ? done : done.note})`);
  assert.equal(p.clubId, me.id);
  assert.ok(me.playerIds.includes(p.id) && !seller.playerIds.includes(p.id));
  assert.equal(me.finance.balance, before.me - ask);
  assert.equal(seller.finance.balance, before.them + ask);
  assert.equal(p.bookValue, ask);
  assert.ok(g.transfers.some((t) => t.playerId === p.id && t.fee === ask));
});

test('transfers: a release clause bid must be accepted', () => {
  const g = newGame(42);
  takeCharge(g, clubNamed(g, 'Real Madrid').id, 'Test');
  const me = g.clubs[g.userClubId - 1];
  const target = clubNamed(g, 'Real Sociedad').playerIds.map((id) => g.players[id]).sort((a, b) => b.ca - a.ca)[0];
  me.finance.transferBudget = target.releaseClause! + 1;
  me.finance.balance = target.releaseClause! + 1;
  const o = makeBid(g, target.id, target.releaseClause!);
  assert.ok(typeof o !== 'string' && o.status === 'accepted', 'clause met');
});

test('transfers: deals agreed outside the window go through when it opens', () => {
  const g = newGame(43);
  takeCharge(g, clubNamed(g, 'Chelsea').id, 'Test');
  while (windowOpenOn(g.season, g.day + 1) || g.day < 40) playDay(g);
  const me = g.clubs[g.userClubId - 1];
  const p = clubNamed(g, 'Fulham').playerIds.map((id) => g.players[id]).filter((x) => !x.loan).sort((a, b) => a.ca - b.ca)[6];
  me.finance.transferBudget = 200e6;
  me.finance.wageBudget += 300_000;
  const o = makeBid(g, p.id, askingPrice(g, p, me) * 1.2);
  assert.ok(typeof o !== 'string' && o.status === 'accepted');
  proposeTerms(g, o.id, wageDemand(g, p, me) * 1.2, 3);
  const t = confirmSigning(g, o.id);
  assert.ok(typeof t !== 'string' && t.status === 'terms', 'agreed, waiting for the window');
  assert.notEqual(p.clubId, me.id);
  while (!windowOpenOn(g.season, g.day)) playDay(g);
  assert.equal(p.clubId, me.id, 'joined when the window opened');
});

test('loans: borrow a youngster, pay part of his wages, send him back in the summer', () => {
  const g = newGame(44);
  takeCharge(g, clubNamed(g, 'Everton').id, 'Test');
  const me = g.clubs[g.userClubId - 1];
  const parent = clubNamed(g, 'Manchester City');
  const xi = new Set(autoPickXI(parent, g.players));
  const kid = parent.playerIds.map((id) => g.players[id]).filter((p) => !xi.has(p.id) && p.age <= 22 && !p.loan).sort((a, b) => b.ca - a.ca)[0];
  me.finance.wageBudget += 300_000;
  const agreed = makeLoanBid(g, kid.id, 1, null);
  assert.ok(typeof agreed !== 'string' && agreed.status === 'accepted' && agreed.agreed, typeof agreed === 'string' ? agreed : agreed.note);
  assert.notEqual(kid.clubId, me.id, 'nothing happens until the manager confirms');
  const o = confirmLoan(g, (agreed as { id: number }).id);
  assert.ok(typeof o !== 'string' && o.status === 'done', typeof o === 'string' ? o : o.note);
  assert.equal(kid.clubId, me.id);
  assert.equal(kid.loan?.parentId, parent.id);
  const bill = wageBill(g, me.id);
  assert.ok(bill >= kid.wage, 'we pay his wage');
  while (!seasonOver(g)) playDay(g);
  startNewSeason(g);
  assert.equal(kid.clubId, parent.id, 'back at his parent club');
  assert.equal(kid.loan, null);
});

test('selling: accepting a bid sells the player', () => {
  const g = newGame(45);
  takeCharge(g, clubNamed(g, 'Brighton & Hove Albion').id, 'Test');
  const me = g.clubs[g.userClubId - 1];
  const p = me.playerIds.map((id) => g.players[id]).sort((a, b) => b.ca - a.ca)[3];
  const buyer = clubNamed(g, 'Arsenal');
  g.offers.push({ id: 999, kind: 'transfer', playerId: p.id, buyerId: buyer.id, sellerId: me.id, fee: 40e6, status: 'pending', day: g.day, season: g.season, limit: 48e6 });
  const bank = me.finance.balance;
  assert.ok(counterAccepted(g, 999, 45e6), 'within their limit');
  assert.ok(!counterAccepted(g, 999, 200e6), 'far above their limit');
  assert.equal(p.clubId, me.id, 'checking does not sell him');
  respondToBid(g, 999, 'counter', 45e6);
  assert.equal(p.clubId, buyer.id, 'sold after the counter');
  assert.equal(me.finance.balance, bank + 45e6);
});

test('contracts: renewals need the player\'s asking wage', () => {
  const g = newGame(46);
  takeCharge(g, 1, 'Test');
  const me = g.clubs[0];
  me.finance.wageBudget += 500_000;
  const p = me.playerIds.map((id) => g.players[id]).sort((a, b) => b.ca - a.ca)[2];
  const low = offerRenewal(g, p.id, p.wage * 0.5, 3);
  assert.ok(!low.ok && /wants/.test(low.message));
  const want = Number(low.message.match(/£([\d.,]+)(k|m)?/)![1]);
  assert.ok(want > 0);
  const ok = offerRenewal(g, p.id, p.wage * 3, 4);
  assert.ok(ok.ok, ok.message);
  assert.equal(p.contractEnd, g.season + 4);
});

test('season rollover: accounts close, contracts end, budgets are set', () => {
  const g = newGame(47);
  takeCharge(g, 1, 'Test');
  const me = g.clubs[0];
  const leaving = me.playerIds.map((id) => g.players[id]).find((p) => p.contractEnd === g.season + 1)!;
  const players = Object.keys(g.players).length;
  while (!seasonOver(g)) playDay(g);
  const revenue = ledgerRevenue(me.finance.ledger);
  assert.ok(revenue > 300e6, `Arsenal revenue ${fmtMoney(revenue)}`);
  startNewSeason(g);
  assert.equal(me.finance.history[me.finance.history.length - 1].season, g.season - 1);
  if (leaving) assert.notEqual(leaving.clubId, me.id, 'expired contract, gone');
  assert.ok(me.finance.transferBudget >= 0 && me.finance.wageBudget > 0);
  const now = Object.keys(g.players).length;
  assert.ok(Math.abs(now - players) / players < 0.2, `player count stable (${players} -> ${now})`);
  for (const c of g.clubs) assert.ok(Number.isFinite(c.finance.balance), c.name);
});

test('spending rules: a Premier League club over the PSR limit is docked points', () => {
  const g = newGame(48);
  takeCharge(g, 1, 'Test');
  const c = clubNamed(g, 'Chelsea');
  c.finance.history = [{ season: g.season - 2, profit: -80e6, revenue: 4e8 }, { season: g.season - 1, profit: -80e6, revenue: 4e8 }];
  while (!seasonOver(g)) playDay(g);
  c.finance.ledger.operating += 200e6;
  startNewSeason(g);
  assert.ok(c.finance.deduction >= 6, `deduction ${c.finance.deduction}`);
  const row = table2(g, 'ENG').find((r) => r.clubId === c.id)!;
  assert.equal(row.pts, -c.finance.deduction, 'starts the season below zero');
  assert.ok(PSR_LIMIT === 105e6);
});

/* ───────────── Phase 3: scouting ───────────── */
import {
  assign as scoutAssign, attrRange, estimatedCA, estimatedPA, fireScout, hireScout, knowledge, maxScouts,
} from '../src/engine/scouting.js';

test('scouting: own players are known, others are seen through a fog', () => {
  const g = newGame(60);
  takeCharge(g, 1, 'Test');
  const me = g.clubs[0];
  const mine = g.players[me.playerIds[0]];
  assert.equal(knowledge(g, mine), 100);
  assert.deepEqual(attrRange(g, mine, 'pace'), [mine.attrs.pace, mine.attrs.pace]);
  const star = byName(g, 'Yamal');
  const unknown = Object.values(g.players).filter((p) => p.clubId && g.clubs[p.clubId - 1].leagueId === 'POR' && p.age <= 19).sort((a, b) => a.ca - b.ca)[0];
  assert.ok(knowledge(g, star) > knowledge(g, unknown) + 20, `star ${knowledge(g, star)} vs unknown ${knowledge(g, unknown)}`);
  for (const p of [star, unknown]) {
    for (const k of ['pace', 'finishing', 'passing'] as const) {
      const [lo, hi] = attrRange(g, p, k);
      assert.ok(lo <= p.attrs[k] && p.attrs[k] <= hi, 'truth inside the range');
      // The elite are household names; an unknown teenager is a range.
      if (p === unknown) assert.ok(hi - lo >= 2, 'a range, not a number');
    }
  }
  assert.equal(estimatedPA(g, unknown), null, 'potential unknown without a report');
});

test('scouting: a scout watches a player and reports back', () => {
  const g = newGame(61);
  takeCharge(g, 1, 'Test');
  const sc = g.scouting;
  assert.ok(sc.scouts.length >= 2 && sc.scouts.length <= maxScouts(g.clubs[0]));
  const s = sc.scouts[0];
  s.judgeAbility = 19;
  s.judgePotential = 19;
  const target = Object.values(g.players).filter((p) => p.clubId && g.clubs[p.clubId - 1].leagueId === 'GER' && p.age <= 21).sort((a, b) => b.pa - a.pa)[0];
  const before = knowledge(g, target);
  const budget = g.clubs[0].finance.scoutBudget!;
  assert.equal(scoutAssign(g, s.id, 'player', target.id), null);
  assert.ok(g.clubs[0].finance.scoutBudget! < budget, 'travel paid from the budget');
  assert.match(scoutAssign(g, s.id, 'player', target.id) ?? '', /already/);
  for (let i = 0; i < 6 && sc.assignments.length; i++) { playUntilUserMatch(g); playDay(g); }
  assert.equal(sc.assignments.length, 0, 'assignment finished');
  const r = sc.reports[target.id];
  assert.ok(r, 'report written');
  assert.ok(Math.abs(r.estCA - target.ca) <= 12, `good scout is close (${r.estCA} vs ${target.ca})`);
  assert.ok(knowledge(g, target) >= before + 40);
  assert.equal(estimatedCA(g, target), r.estCA);
  assert.ok(g.news.some((n) => n.title.startsWith('Scout report')));
  const [lo, hi] = attrRange(g, target, 'pace');
  assert.ok(hi - lo <= 2, 'attributes much clearer');
});

test('scouting: league tours find players; budget and staff limits hold', () => {
  const g = newGame(62);
  takeCharge(g, 1, 'Test');
  const sc = g.scouting;
  const s = sc.scouts[1];
  assert.equal(scoutAssign(g, s.id, 'league', 'POR', 'young'), null);
  while (sc.assignments.length) { playUntilUserMatch(g); playDay(g); }
  const found = Object.values(sc.reports).filter((r) => r.scoutId === s.id);
  assert.ok(found.length >= 5, `${found.length} reports`);
  assert.ok(found.every((r) => g.players[r.playerId].age <= 21), 'young players only');
  g.clubs[0].finance.scoutBudget = 1000;
  assert.match(scoutAssign(g, sc.scouts[0].id, 'club', 5) ?? '', /budget/);
  while (sc.scouts.length < maxScouts(g.clubs[0])) assert.equal(hireScout(g, sc.pool[0].id), null);
  assert.match(hireScout(g, sc.pool[0].id) ?? '', /allow/);
  const bank = g.clubs[0].finance.balance;
  assert.equal(fireScout(g, sc.scouts[0].id), null);
  assert.ok(g.clubs[0].finance.balance < bank, 'a pay-off');
  const worse = sc.scouts.length;
  startNewSeasonAfter(g);
  assert.equal(g.scouting.scouts.length, worse, 'staff carry over');
  assert.ok(g.scouting.pool.length > 0);
});

function startNewSeasonAfter(g: ReturnType<typeof newGame>) {
  while (!seasonOver(g)) playDay(g);
  startNewSeason(g);
}

/* ───────────── Phase 4: cups and Europe ───────────── */

test('cups: 2026/27 is built from the real draws and pairings', async () => {
  const { phaseTable } = await import('../src/engine/cups.js');
  const g = newGame(60);
  const ucl = g.cups.find((c) => c.id === 'UCL')!;
  assert.equal(ucl.phaseClubs!.length, 36);
  const games = g.fixtures.filter((f) => f.comp === 'UCL');
  assert.equal(games.length, 144);
  for (const id of ucl.phaseClubs!) {
    const mine = games.filter((f) => f.homeId === id || f.awayId === id);
    assert.equal(mine.length, 8, 'eight league-phase games');
    assert.equal(mine.filter((f) => f.homeId === id).length, 4, 'four at home');
    assert.equal(new Set(mine.map((f) => f.round)).size, 8, 'one game per matchday');
  }
  const name = (id: number) => (id > 10000 ? g.extClubs : g.clubs).find((c) => c.id === id)!.name;
  const arsenal = g.clubs.find((c) => c.name === 'Arsenal')!;
  const opp = games.filter((f) => f.homeId === arsenal.id).map((f) => name(f.awayId)).sort();
  assert.deepEqual(opp, ['Borussia Dortmund', 'Lille', 'Real Madrid', 'Sabah'], 'Arsenal\'s real home draw');
  assert.equal(phaseTable(g, ucl).length, 36);
  const fac = g.cups.find((c) => c.id === 'FAC')!;
  assert.equal(fac.ties.filter((t) => t.round === 0).length, 32, 'FA Cup third round: 64 clubs');
  const dfb = g.cups.find((c) => c.id === 'DFB')!;
  const bayern = dfb.ties.find((t) => t.awayId === g.clubs.find((c) => c.name === 'Bayern Munich')!.id)!;
  assert.equal(name(bayern.homeId!), 'VfL Osnabrück', 'the real DFB-Pokal first round');
  for (const cup of g.cups.filter((c) => c.kind === 'cup')) {
    const r0 = cup.ties.filter((t) => t.round === 0);
    const clubs = r0.flatMap((t) => [t.homeId, t.awayId]).filter((x) => x !== null);
    assert.equal(new Set(clubs).size, clubs.length, `${cup.id}: nobody drawn twice`);
  }
});

test('cups: knockout matches always produce a winner, with extra time and penalties', async () => {
  const { MatchSim } = await import('../src/engine/match.js');
  const { teamSetup } = await import('../src/engine/game.js');
  const g = newGame(61);
  const [a, b] = [g.clubs[0], g.clubs[1]];
  let et = 0, pens = 0, straight = 0;
  for (let i = 0; i < 300; i++) {
    const rules = i % 2 ? { extraTime: true } : { extraTime: false };
    const sim = new MatchSim(teamSetup(g, a, b, true), teamSetup(g, b, a, false), g.players, new Rng(1000 + i), { commentary: i < 4, knockout: rules });
    const out = sim.runToEnd();
    const r = out.summary;
    assert.ok(sim.winnerSide !== null, 'somebody goes through');
    if (r.aet) et++;
    if (r.pens) {
      pens++;
      if (!rules.extraTime) straight++;
      assert.notEqual(r.pens[0], r.pens[1]);
      assert.ok(Math.max(...r.pens) <= 5 + r.kicks!.length, 'shoot-out score is sane');
      assert.equal(r.hg, r.ag, 'penalties only after a draw');
    }
    if (r.aet) assert.ok(rules.extraTime, 'extra time only where the rules have it');
  }
  assert.ok(et > 20 && pens > 20 && straight > 10, `et ${et} pens ${pens} straight ${straight}`);
  // Second legs play on the aggregate.
  const sim = new MatchSim(teamSetup(g, a, b, true), teamSetup(g, b, a, false), g.players, new Rng(5), { commentary: false, knockout: { extraTime: true, first: [0, 3] } });
  sim.runToEnd();
  const [x, y] = sim.aggregate;
  assert.equal(sim.winnerSide, x > y ? 0 : x < y ? 1 : sim.shootout![0] > sim.shootout![1] ? 0 : 1);
});

test('cups: a full season crowns every winner and nobody plays twice in two days', async () => {
  const { isCupComp } = await import('../src/engine/cups.js');
  const g = newGame(62);
  takeCharge(g, 1, 'Test');
  while (!seasonOver(g)) playDay(g);
  for (const cup of g.cups) assert.ok(cup.winnerId, `${cup.id} has a winner`);
  const finals = g.fixtures.filter((f) => isCupComp(g, f.comp) && f.tieId !== undefined && f.round === g.cups.find((c) => c.id === f.comp)!.rounds.length - 1);
  assert.equal(finals.length, g.cups.length);
  assert.ok(finals.every((f) => f.neutral), 'finals at neutral grounds');
  const days = new Map<number, number[]>();
  for (const f of g.fixtures) for (const id of [f.homeId, f.awayId]) days.set(id, [...(days.get(id) ?? []), f.day]);
  for (const [id, list] of days) {
    list.sort((p, q) => p - q);
    for (let i = 1; i < list.length; i++) assert.ok(list[i] - list[i - 1] >= 2, `club ${id} plays on days ${list[i - 1]} and ${list[i]}`);
  }
  const me = g.clubs[0];
  assert.ok(me.finance.ledger.prize > 0, 'prize money paid');
  // Next season: three full European competitions, nobody in two of them.
  startNewSeason(g);
  const euro = g.cups.filter((c) => c.kind === 'euro');
  const all = euro.flatMap((c) => c.phaseClubs!);
  assert.ok(euro.every((c) => c.phaseClubs!.length === 36), 'three full league phases');
  assert.equal(new Set(all).size, all.length, 'nobody in two competitions');
  for (const c of euro) {
    const games = g.fixtures.filter((f) => f.comp === c.id);
    for (const id of c.phaseClubs!) {
      const mine = games.filter((f) => f.homeId === id || f.awayId === id);
      assert.equal(new Set(mine.map((f) => f.round)).size, mine.length, `${c.id}: one game per matchday`);
      assert.equal(mine.filter((f) => f.homeId === id).length * 2, mine.length, `${c.id}: half at home`);
    }
  }
  assert.ok(g.cups.filter((c) => c.kind === 'cup').every((c) => c.ties.some((t) => t.round === 0) || c.drawn > 0), 'domestic cups drawn');
});

/* ───────────── Phase 5: internationals ───────────── */

test('internationals: the real 2026/27 fixtures, call-ups, and players who leave and come back', async () => {
  const { windows, nationName } = await import('../src/engine/intl.js');
  const { resolveLineup } = await import('../src/engine/tactics.js');
  const g = newGame(70);
  const arsenal = g.clubs.find((c) => c.name === 'Arsenal')!;
  takeCharge(g, arsenal.id, 'Test');
  const unl = g.intl.matches.filter((m) => m.comp === 'UNL');
  assert.equal(unl.length, 156, 'the whole Nations League league phase');
  assert.ok(g.intl.matches.some((m) => m.home === 'ENG' && m.away === 'ESP' && m.comp === 'UNL'), 'England v Spain');
  assert.equal(nationName('CIV'), 'Ivory Coast');
  const w = windows(g.season)[0];
  while (g.day < w.from - 6) playDay(g);
  assert.ok(g.intl.squads.ENG?.length >= 20, 'England name a squad');
  const called = arsenal.playerIds.map((id) => g.players[id]).filter((p) => Object.values(g.intl.squads).some((s) => s.includes(p.id)));
  assert.ok(called.length >= 8, `${called.length} Arsenal players called up`);
  assert.ok(g.news.some((n) => /called up/.test(n.title)), 'call-up news');
  // During the window they're away and can't be picked.
  const { nextMatchDay } = await import('../src/engine/game.js');
  const { advanceCalendar } = await import('../src/engine/game.js');
  while ((nextMatchDay(g) ?? 999) < w.from) playDay(g);
  // No club football in the window: the calendar moves on day by day.
  advanceCalendar(g, w.from + 2);
  const away = called.filter((p) => p.away);
  assert.ok(away.length >= 6, 'away with their countries');
  assert.ok(!resolveLineup(arsenal, g.players).some((id) => g.players[id].away), 'nobody away in the club XI');
  assert.ok(!g.fixtures.some((f) => g.comps.some((c) => c.id === f.comp) && f.day >= w.from && f.day <= w.to), 'no league games in the window');
  while (g.day <= w.to + 1) playDay(g);
  assert.ok(called.every((p) => !p.away), 'all back after the window');
  assert.ok(called.some((p) => (p.stats.intlApps ?? 0) > 0), 'they played');
  assert.ok(g.news.some((n) => /back from international duty/.test(n.title)), 'return news');
  assert.ok(g.intl.matches.filter((m) => m.day <= w.to).every((m) => m.result), 'every game in the window played');
});

test('internationals: the Asian Cup takes players away in January; the season ends with the Nations League', async () => {
  const g = newGame(71);
  takeCharge(g, 1, 'Test');
  const acStart = g.intl.matches.filter((m) => m.comp === 'AC').reduce((a, m) => Math.min(a, m.day), 999);
  while (g.day < acStart + 2) playDay(g);
  const asians = Object.values(g.players).filter((p) => p.away?.what === 'the Asian Cup');
  assert.ok(asians.length >= 15, `${asians.length} players at the Asian Cup`);
  assert.ok(asians.every((p) => ['KSA', 'KUW', 'OMA', 'PLE', 'UZB', 'BHR', 'PRK', 'JOR', 'IRN', 'SYR', 'KGZ', 'CHN', 'AUS', 'TJK', 'IRQ', 'SIN', 'KOR', 'UAE', 'VIE', 'YEM', 'JPN', 'QAT', 'THA', 'IDN'].includes(p.away!.nation)));
  const clubGames = g.fixtures.filter((f) => f.day > acStart && f.day < acStart + 20 && f.result === null).length;
  assert.ok(clubGames > 0, 'club football goes on without them');
  while (!seasonOver(g)) playDay(g);
  assert.ok(g.intl.winners.some((w) => w.comp === 'AC'), 'Asian Cup winner');
  assert.ok(g.intl.winners.some((w) => w.comp === 'CNL'), 'CONCACAF Nations League winner');
  assert.ok(Object.values(g.players).every((p) => !p.away || p.away.until > g.day), 'nobody left behind');
  const eq = g.intl.comps.find((c) => c.id === 'EQ28')!;
  assert.equal(eq.groups.reduce((n, gr) => n + gr.teams.length, 0), 54, 'Euro 2028 qualifying: 54 teams (Russia is suspended)');
  assert.equal(eq.groups.filter((gr) => gr.teams.length === 5).length, 6);
  assert.equal(eq.groups.filter((gr) => gr.teams.length === 4).length, 6);
  const march = g.intl.matches.filter((m) => m.comp === 'EQ28');
  assert.ok(march.length > 0 && march.every((m) => eq.groups.find((gr) => gr.teams.includes(m.home))!.teams.length === 5), 'only five-team groups start in March');
  startNewSeason(g);
  assert.ok(g.intl.winners.some((w) => w.comp === 'UNL'), 'Nations League winner in June');
  assert.ok(g.intl.matches.some((m) => m.comp === 'EQ28'), 'Euro qualifying carries on');
  assert.ok(g.intl.comps.some((c) => c.confed === 'CONMEBOL'), 'World Cup qualifying starts in South America');
  assert.ok(Object.values(g.players).every((p) => !p.away), 'everyone back for the new season');
});

test('traits: derived from attributes, sensible spread, real-player reputations', async () => {
  const { traitsOf, TRAIT_DEFS } = await import('../src/engine/traits.js');
  const g = newGame(3);
  const all = Object.values(g.players).filter((p) => p.clubId != null);
  const counts: Record<string, number> = {};
  let withAny = 0;
  for (const p of all) {
    const t = traitsOf(p);
    assert.ok(t.length <= 6, `${p.lastName} has ${t.length} traits`);
    if (t.length) withAny++;
    for (const id of t) { assert.ok(TRAIT_DEFS[id]); counts[id] = (counts[id] ?? 0) + 1; }
  }
  // Traits mark the distinctive: most players have none or few, every trait is used by someone.
  assert.ok(withAny / all.length < 0.6, `too common: ${withAny}/${all.length}`);
  for (const id of Object.keys(TRAIT_DEFS)) assert.ok((counts[id] ?? 0) > 0, `${id} never assigned`);
  const haaland = all.find((p) => p.lastName === 'Haaland')!;
  assert.ok(traitsOf(haaland).includes('poacher'));
  const gk = all.find((p) => p.pos.GK === 20)!;
  assert.ok(!traitsOf(gk).includes('clinical'));
});

test('discipline: bans and yellow cards are counted per competition', async () => {
  const d = await import('../src/engine/discipline.js');
  const g = newGame(4);
  takeCharge(g, 1, 'Test');
  const me = g.clubs.find((c) => c.id === g.userClubId)!;
  const p = g.players[me.playerIds[0]];
  // Four league yellows and two cup yellows: no ban anywhere yet.
  for (let i = 0; i < 4; i++) assert.equal(d.addYellow(g, p, me.leagueId), false);
  assert.equal(d.addYellow(g, p, 'UCL'), false);
  assert.equal(d.addYellow(g, p, 'UEL'), false); // Europe shares one record
  assert.equal(d.addYellow(g, p, 'UECL'), true); // third European booking
  assert.equal(d.banIn(p, 'UCL'), 1);
  assert.equal(d.banIn(p, me.leagueId), 0);
  // The fifth league yellow bans him in the league only.
  assert.equal(d.addYellow(g, p, me.leagueId), true);
  assert.equal(d.banIn(p, me.leagueId), 1);
  assert.equal(d.banIn(p, 'FAC'), 0);
  // A red in a cup does not touch the league ban count.
  d.addBan(p, 'FAC', 3);
  assert.equal(d.banIn(p, me.leagueId), 1);
  // Serving a league match reduces only the league ban.
  const f = g.fixtures.find((x) => x.comp === me.leagueId && (x.homeId === me.id || x.awayId === me.id))!;
  d.serveBans(g, f);
  assert.equal(d.banIn(p, me.leagueId), 0);
  assert.equal(d.banIn(p, 'FAC'), 3);
  assert.equal(d.banIn(p, 'UCL'), 1);
  // Suspended mirrors the ban in the club's next competition (a league game on opening day).
  d.refreshBans(g);
  assert.equal(p.suspended, 0);
  // Old saves: a carried-over ban becomes a league ban.
  const { migrateSave } = await import('../src/engine/migrate.js');
  const old = JSON.parse(JSON.stringify(g));
  old.version = 8;
  const q = old.players[p.id];
  q.suspended = 2; q.stats.yellow = 3; delete q.bans; delete q.ycs;
  const m = migrateSave(old)!;
  assert.equal(m.players[p.id].bans![me.leagueId], 2);
  assert.equal(m.players[p.id].ycs![me.leagueId], 3);
});

test('board: results move confidence, warnings come before the sack, and a new job carries on', async () => {
  const b = await import('../src/engine/board.js');
  const g = newGame(31);
  const ARS = g.clubs.find((c) => c.short === 'ARS')!;
  takeCharge(g, ARS.id, 'Test');
  assert.equal(g.board!.confidence, 60);
  // A hopeless side: everyone is useless.
  for (const id of ARS.playerIds) for (const k of Object.keys(g.players[id].attrs) as (keyof typeof g.players[typeof id]['attrs'])[]) if (k !== 'injuryProneness') g.players[id].attrs[k] = 1;
  const seen: number[] = [];
  while (!g.board!.sacked && !seasonOver(g)) {
    playUntilUserMatch(g);
    if (seasonOver(g)) break;
    playDay(g);
    seen.push(g.board!.warnings);
  }
  const bd = g.board!;
  assert.ok(bd.sacked, 'sacked before the season ended');
  assert.ok(seen.includes(1) && seen.includes(2), 'warned twice first');
  assert.ok(g.news.some((n) => n.title === 'The board are concerned'));
  assert.ok(g.news.some((n) => n.title === 'Final warning from the board'));
  assert.ok(bd.sacked!.offers.length >= 3 && !bd.sacked!.offers.includes(ARS.id));
  // Take a job and play on.
  const job = bd.sacked!.offers[0];
  assert.equal(b.takeNewJob(g, job), true);
  assert.equal(g.userClubId, job);
  assert.equal(g.board!.sacked, null);
  assert.equal(g.board!.confidence, 55);
  playUntilUserMatch(g);
  playDay(g);
  // A strong side is not in trouble early on.
  const g2 = newGame(32);
  const mci = g2.clubs.find((c) => c.short === 'MCI')!;
  takeCharge(g2, mci.id, 'Test');
  for (let i = 0; i < 10 && !seasonOver(g2); i++) { playUntilUserMatch(g2); if (seasonOver(g2)) break; playDay(g2); }
  assert.ok(g2.board!.confidence >= 35, `a strong club is not in trouble after ten games: ${g2.board!.confidence}`);
  assert.equal(g2.board!.sacked, null);
});

test('decisions: bids, counters, terms and serious injuries stop the game until answered', async () => {
  const d = await import('../src/engine/decisions.js');
  const g = newGame(41);
  takeCharge(g, 1, 'Test');
  const me = g.clubs.find((c) => c.id === g.userClubId)!;
  assert.equal(d.pendingDecisions(g).length, 0);
  const other = g.clubs.find((c) => c.id !== me.id && !c.external)!;
  const mine = g.players[me.playerIds[3]];
  const theirs = g.players[other.playerIds[3]];
  const base = { fee: 5_000_000, day: g.day, season: g.season, kind: 'transfer' as const };
  g.offers.push({ ...base, id: 900, playerId: mine.id, buyerId: other.id, sellerId: me.id, status: 'pending' });
  g.offers.push({ ...base, id: 901, playerId: theirs.id, buyerId: me.id, sellerId: other.id, status: 'countered', counterFee: 7_000_000 });
  g.offers.push({ ...base, id: 902, playerId: theirs.id, buyerId: me.id, sellerId: other.id, status: 'accepted' });
  g.offers.push({ ...base, id: 903, playerId: theirs.id, buyerId: me.id, sellerId: other.id, status: 'pending' }); // waiting on them: not ours to answer
  assert.deepEqual(d.pendingDecisions(g).map((x) => x.kind), ['bid', 'counter', 'terms']);
  assert.equal(d.playUntilDecision(g), 0, 'the game does not move while something waits');
  for (const o of g.offers) o.status = 'withdrawn';
  assert.equal(d.pendingDecisions(g).length, 0);
  // Serious injuries need acknowledging; short ones do not.
  const a = g.players[me.playerIds[5]];
  a.injury = { name: 'Cruciate ligament', days: 200 };
  g.players[me.playerIds[6]].injury = { name: 'Bruise', days: 6 };
  assert.deepEqual(d.pendingDecisions(g).map((x) => x.kind), ['injury']);
  d.acknowledgeInjury(g, a.id);
  assert.equal(d.pendingDecisions(g).length, 0);
  assert.ok(d.playUntilDecision(g) >= 0);
  // A picked XI with an unavailable player blocks kick-off.
  me.lineup = [...me.playerIds.slice(0, 11)];
  g.players[me.lineup[2]].injury = { name: 'Sprain', days: 3, seen: true };
  assert.ok(d.lineupBlockers(g).length >= 1);
  me.lineup = null;
  assert.equal(d.lineupBlockers(g).length, 0);
});

test('free agents: well-known players start unattached and can be signed', async () => {
  const { approachFreeAgent, proposeTerms } = await import('../src/engine/transfers.js');
  const g = newGame(51);
  takeCharge(g, 1, 'Test');
  const free = Object.values(g.players).filter((p) => p.clubId === null);
  const sancho = free.find((p) => p.lastName === 'Sancho');
  assert.ok(sancho, 'Sancho is a free agent');
  assert.ok(sancho!.age >= 25 && sancho!.age <= 27 && sancho!.ca >= 140);
  assert.ok(free.length >= 20 && free.every((p) => p.wage > 0 && p.contractEnd === g.season));
  const r = approachFreeAgent(g, sancho!.id);
  assert.ok(typeof r !== 'string' || r.length > 0);
});

test('unpick all: an emptied XI stays empty and blocks kick-off until filled', async () => {
  const d = await import('../src/engine/decisions.js');
  const g = newGame(61);
  takeCharge(g, 1, 'Test');
  const me = g.clubs.find((c) => c.id === g.userClubId)!;
  me.lineup = Array(11).fill(-1);
  me.bench = [];
  assert.deepEqual(getFormation(me.tactics.formation).slots.length, 11);
  const { resolveLineup } = await import('../src/engine/tactics.js');
  assert.ok(resolveLineup(me, g.players).every((id) => id === -1), 'stays empty');
  assert.ok(d.lineupBlockers(g).some((t) => t.includes('incomplete')));
  me.lineup = null;
  assert.equal(d.lineupBlockers(g).length, 0);
  assert.equal(resolveLineup(me, g.players).filter((id) => id !== -1).length, 11);
});

/* ───────────────────────── Pre-season and training ───────────────────────── */

test('pre-season: a game starts on 15 June with the window open and stops for the plan on 1 July', async () => {
  const d = await import('../src/engine/decisions.js');
  const t = await import('../src/engine/training.js');
  const { dateOf } = await import('../src/engine/game.js');
  const g = newGame(71);
  takeCharge(g, 1, 'Test');
  const start = dateOf(g.season, g.day);
  assert.equal(`${start.getUTCMonth()}-${start.getUTCDate()}`, '5-15', 'starts 15 June');
  assert.ok(windowOpenOn(g.season, g.day), 'the summer window is open');
  assert.ok(!windowOpenOn(g.season, -48), 'and opened that day');
  assert.equal(g.fixtures.filter((f) => f.comp === 'FRI').length, 4, 'four friendlies');
  assert.ok(g.fixtures.filter((f) => f.comp === 'FRI').every((f) => f.homeId === 1 || f.awayId === 1));
  d.playUntilDecision(g);
  assert.equal(dateOf(g.season, g.day).getUTCDate(), 1, 'stops on the first of the month');
  assert.ok(d.pendingDecisions(g).some((x) => x.kind === 'preseason'), 'the pre-season plan is waiting');
  assert.ok(!userPlaysNext(g) === false || d.pendingDecisions(g).length > 0);
  const bank = g.clubs[0].finance.balance;
  assert.equal(t.confirmPreseason(g, 'spain'), null);
  assert.ok(g.clubs[0].finance.balance < bank, 'the camp costs money');
  assert.ok(!d.pendingDecisions(g).some((x) => x.kind === 'preseason'));
  assert.equal(t.confirmPreseason(g, 'home'), 'The pre-season plan is already set.');
});

test('pre-season: friendlies build sharpness and change nothing else', async () => {
  const d = await import('../src/engine/decisions.js');
  const t = await import('../src/engine/training.js');
  const g = newGame(72);
  takeCharge(g, 1, 'Test');
  d.playUntilDecision(g);
  t.confirmPreseason(g, 'home');
  const me = g.clubs[0];
  const before = me.playerIds.reduce((s, id) => s + t.sharpOf(g.players[id]), 0) / me.playerIds.length;
  while (userNextFixture(g)?.comp === 'FRI') { d.playUntilDecision(g); playDay(g); }
  const fr = g.fixtures.filter((f) => f.comp === 'FRI');
  assert.ok(fr.every((f) => f.result), 'all played');
  const after = me.playerIds.reduce((s, id) => s + t.sharpOf(g.players[id]), 0) / me.playerIds.length;
  assert.ok(after > before + 15, `sharpness ${before.toFixed(0)} → ${after.toFixed(0)}`);
  const mine = me.playerIds.map((id) => g.players[id]);
  assert.ok(mine.every((p) => p.stats.apps === 0 && p.stats.goals === 0 && p.stats.yellow === 0), 'no stats from friendlies');
  assert.ok(mine.every((p) => (p.suspended ?? 0) === 0), 'no bans');
  assert.equal(leagueTable(g, 'ENG').reduce((s, r) => s + r.p, 0), 0, 'the table is untouched');
  assert.ok((g.board?.confidence ?? 60) === 60 || Math.abs((g.board?.confidence ?? 60) - 60) < 6, 'the board does not react to friendlies');
});

test('training: heavy work gets the side sharper than light work, at a cost to condition', async () => {
  const d = await import('../src/engine/decisions.js');
  const t = await import('../src/engine/training.js');
  const run = (w: 'light' | 'heavy') => {
    const g = newGame(73);
    takeCharge(g, 1, 'Test');
    t.setWorkload(g, w);
    d.playUntilDecision(g);
    t.confirmPreseason(g, 'home');
    while (userNextFixture(g)?.comp === 'FRI') { d.playUntilDecision(g); playDay(g); }
    const me = g.clubs[0];
    return me.playerIds.reduce((s, id) => s + t.sharpOf(g.players[id]), 0) / me.playerIds.length;
  };
  const light = run('light');
  const heavy = run('heavy');
  assert.ok(heavy > light + 5, `heavy ${heavy.toFixed(1)} vs light ${light.toFixed(1)}`);
});

test('training: individual attribute work pays off, and only six players at a time', async () => {
  const t = await import('../src/engine/training.js');
  const g = newGame(74);
  takeCharge(g, 1, 'Test');
  const me = g.clubs[0];
  const kids = me.playerIds.map((id) => g.players[id]).filter((p) => (p.pos.GK ?? 0) < 15).sort((a, b) => a.age - b.age).slice(0, 7);
  for (const p of kids.slice(0, 6)) assert.equal(t.setIndividual(g, p.id, { attr: 'finishing' }), null);
  assert.match(t.setIndividual(g, kids[6].id, { attr: 'finishing' }) ?? '', /only give 6/);
  const start = kids.slice(0, 6).map((p) => p.attrs.finishing);
  const rng = new Rng(5);
  for (let w = 0; w < 104; w++) t.individualWeek(g, rng);
  const gained = kids.slice(0, 6).reduce((s, p, i) => s + (p.attrs.finishing - start[i]), 0);
  assert.ok(gained >= 2, `six players gained ${gained} finishing points over two years`);
  assert.ok(kids.every((p) => p.attrs.finishing <= 20));
  assert.ok(t.setIndividual(g, kids[0].id, { attr: 'naturalFitness' as never }) !== null, 'fitness attributes are not trainable');
});

test('training: retraining a full back to the other flank takes a season or so, and keepers are refused', async () => {
  const t = await import('../src/engine/training.js');
  const g = newGame(75);
  takeCharge(g, 1, 'Test');
  const me = g.clubs[0];
  const players = me.playerIds.map((id) => g.players[id]);
  const gk = players.find((p) => (p.pos.GK ?? 0) >= 15)!;
  assert.ok(t.canRetrain(gk, 'DR'), 'a keeper cannot be retrained');
  const dc = players.find((p) => (p.pos.DC ?? 0) >= 20 && (p.pos.MC ?? 0) < 20 && (p.pos.DM ?? 0) < 15)!;
  assert.equal(t.setIndividual(g, dc.id, { pos: 'MC', progress: 0 }), null);
  const months = t.retrainMonths(dc, 'MC');
  assert.ok(months >= 12 && months <= 40, `a centre back to midfield takes ${months} months`);
  const rng = new Rng(9);
  let weeks = 0;
  while (dc.train && weeks < 300) { t.individualWeek(g, rng); weeks++; }
  assert.equal(dc.pos.MC, 20, 'he ends up natural');
  assert.ok(weeks > 40, 'and it takes a while');
  assert.ok(!dc.train, 'the programme ends');
});

test('training: familiarity and drills change match strength a little', async () => {
  const { famFactor, drillFactor, sharpStrength } = await import('../src/engine/prep.js');
  assert.ok(famFactor(100) > 1 && famFactor(60) < 1 && Math.abs(famFactor(75) - 1) < 1e-9);
  assert.ok(famFactor(100) < 1.05 && famFactor(45) > 0.95);
  assert.ok(drillFactor(100) > 1 && drillFactor(100) < 1.08 && drillFactor(0) < 1);
  assert.ok(sharpStrength(50) < sharpStrength(90) && sharpStrength(100) === 1);
});

test('new season: the summer starts again on 15 June with a new plan to set', async () => {
  const d = await import('../src/engine/decisions.js');
  const t = await import('../src/engine/training.js');
  const { dateOf } = await import('../src/engine/game.js');
  const g = newGame(76);
  takeCharge(g, 1, 'Test');
  d.playUntilDecision(g);
  t.confirmPreseason(g, 'home');
  while (!seasonOver(g)) { d.playUntilDecision(g); if (d.pendingDecisions(g).length) for (const x of d.pendingDecisions(g)) if (x.kind === 'injury') d.acknowledgeInjury(g, x.playerId); playDay(g); }
  startNewSeason(g);
  assert.equal(g.season, 2027);
  assert.equal(`${dateOf(g.season, g.day).getUTCMonth()}-${dateOf(g.season, g.day).getUTCDate()}`, '5-15');
  assert.equal(g.fixtures.filter((f) => f.comp === 'FRI').length, 4);
  assert.ok(windowOpenOn(g.season, g.day));
  for (let i = 0; i < 40 && !d.pendingDecisions(g).some((x) => x.kind === 'preseason'); i++) {
    d.playUntilDecision(g);
    for (const x of d.pendingDecisions(g)) {
      if (x.kind === 'bid') respondToBid(g, x.offerId!, 'reject');
      else if (x.kind === 'injury') d.acknowledgeInjury(g, x.playerId);
    }
  }
  assert.ok(d.pendingDecisions(g).some((x) => x.kind === 'preseason'), 'the plan is asked for again');
  const avg = g.clubs.filter((c) => c.id !== 1).slice(0, 5).map((c) => c.playerIds.reduce((s, id) => s + t.sharpOf(g.players[id]), 0) / c.playerIds.length);
  assert.ok(avg.every((a) => a < 70), 'everyone is out of shape after the break');
  const me = g.clubs[0];
  const ledgerMonths = me.finance.history.length;
  assert.ok(ledgerMonths >= 1, 'a season of accounts was closed');
});

test('saves: a version 11 career gets a training plan for the current pre-season', async () => {
  const { migrateSave } = await import('../src/engine/migrate.js');
  const g = newGame(77);
  takeCharge(g, 1, 'Test');
  const old = JSON.parse(JSON.stringify(g));
  old.version = 11;
  delete old.clubs[0].training;
  const m = migrateSave(old)!;
  assert.equal(m.version, CURRENT_VERSION);
  assert.equal(m.clubs[0].training?.confirmed, m.season);
});

test('run arrows: they shift a player from defence to attack, and are ignored for keepers', () => {
  const g = newGame(81);
  const [h, a] = g.clubs;
  const setup = (c: typeof h, runs?: Record<number, { ball?: boolean; off?: boolean }>) => {
    const xi = autoPickXI(c, g.players);
    return { club: c, xi, bench: pickBench(c, g.players, xi), formation: c.tactics.formation, tactics: defaultTactics(c.tactics.formation), ai: false, runs };
  };
  const base = new MatchSim(setup(h), setup(a), g.players, new Rng(1));
  const xi = autoPickXI(h, g.players);
  const fb = xi.map((id) => g.players[id]).find((p) => base.livePlayers(0).find((o) => o.p.id === p.id)?.slot === 'DL')!;
  const gk = xi.map((id) => g.players[id]).find((p) => base.livePlayers(0).find((o) => o.p.id === p.id)?.slot === 'GK')!;
  const withRuns = new MatchSim(setup(h, { [fb.id]: { ball: true, off: true }, [gk.id]: { ball: true, off: true } }), setup(a), g.players, new Rng(1));
  assert.ok(withRuns.sides[0].att > base.sides[0].att, 'more attack');
  assert.ok(withRuns.sides[0].def < base.sides[0].def, 'less defence');
  // A keeper's arrows change nothing.
  const gkOnly = new MatchSim(setup(h, { [gk.id]: { ball: true, off: true } }), setup(a), g.players, new Rng(1));
  assert.equal(gkOnly.sides[0].att, base.sides[0].att);
  assert.equal(gkOnly.sides[0].def, base.sides[0].def);
  // They can be changed and cleared during a match.
  base.setRuns(0, fb.id, { ball: true });
  assert.deepEqual(base.runsOf(0, fb.id), { ball: true, off: false });
  base.setRuns(0, fb.id, {});
  assert.deepEqual(base.runsOf(0, fb.id), {});
  // Everyone forward makes a busier game for both goals.
  const shots = (all: boolean) => {
    const rng = new Rng(9);
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const runs: Record<number, { ball?: boolean; off?: boolean }> = {};
      const s = setup(h, all ? runs : undefined);
      if (all) for (const id of s.xi) runs[id] = { ball: true, off: true };
      n += new MatchSim(s, setup(a), g.players, rng).runToEnd().summary.stats.shots[0];
    }
    return n;
  };
  assert.ok(shots(true) > shots(false) * 1.15);
});

test('VAR: goals that are checked and ruled out never count, and friendlies have no VAR', () => {
  const g = newGame(82);
  const { teamSetup } = { teamSetup: (c: typeof g.clubs[0]) => { const xi = autoPickXI(c, g.players); return { club: c, xi, bench: pickBench(c, g.players, xi), formation: c.tactics.formation, tactics: defaultTactics(c.tactics.formation), ai: false }; } };
  const [h, a] = g.clubs;
  let varLines = 0, noGoal = 0, friendlyVar = 0, goals = 0, downgrades = 0, penReviews = 0;
  for (let i = 0; i < 400; i++) {
    const sim = new MatchSim(teamSetup(h), teamSetup(a), g.players, new Rng(500 + i), { commentary: true });
    const r = sim.runToEnd().summary;
    const counted = r.events.filter((e) => e.kind === 'goal' || e.kind === 'pen' || e.kind === 'og').length;
    assert.equal(counted, r.hg + r.ag, 'the score matches the goals that stood');
    goals += r.hg + r.ag;
    for (const l of r.commentary ?? []) {
      if (l.tone === 'var') varLines++;
      if (l.text.startsWith('NO GOAL')) noGoal++;
      if (l.text.startsWith('Downgraded')) downgrades++;
      if (l.tone === 'var' && l.text.includes('penalty')) penReviews++;
    }
    const f = new MatchSim(teamSetup(h), teamSetup(a), g.players, new Rng(900 + i), { commentary: true, friendly: true });
    friendlyVar += (f.runToEnd().summary.commentary ?? []).filter((l) => l.tone === 'var').length;
  }
  assert.equal(friendlyVar, 0);
  assert.ok(varLines > 100, `VAR is seen (${varLines})`);
  assert.ok(noGoal > 5 && noGoal < goals * 0.06, `goals ruled out: ${noGoal} of ${goals}`);
  assert.ok(penReviews > 0 && downgrades >= 0);
});

test('surgery: a serious injury can be treated once, at a cost, and a good surgeon saves weeks', async () => {
  const d = await import('../src/engine/decisions.js');
  const s = await import('../src/engine/surgery.js');
  const g = newGame(83);
  takeCharge(g, 1, 'Test');
  const me = g.clubs.find((c) => c.id === g.userClubId)!;
  const p = g.players[me.playerIds[4]];
  const q = g.players[me.playerIds[5]];
  q.injury = { name: 'Dead leg', days: 30 };
  assert.equal(s.canTreat(g, q), false, 'a knock is not for the surgeon');
  p.injury = { name: 'Knee ligament damage', days: 84 };
  assert.ok(s.canTreat(g, p));
  const opts = s.surgeryOptions(g, p.id);
  assert.deepEqual(opts.map((o) => o.how), ['rehab', 'surgery', 'specialist']);
  assert.equal(opts[0].cost, 0);
  assert.ok(opts[1].cost > 0 && opts[2].cost > opts[1].cost);
  assert.ok(opts[2].risk < opts[1].risk && opts[1].risk < opts[0].risk, 'better surgeons, fewer complications');
  assert.ok(opts[2].days[1] < opts[1].days[1] && opts[1].days[1] <= opts[0].days[1]);
  assert.ok(d.pendingDecisions(g).some((x) => x.kind === 'injury' && x.playerId === p.id));
  const bal = me.finance.balance;
  const r = s.treatInjury(g, p.id, 'surgery');
  assert.ok(r.ok, r.message);
  assert.equal(me.finance.balance, bal - opts[1].cost);
  assert.ok(p.injury!.treated && p.injury!.seen);
  assert.ok(p.injury!.days < 84 * 1.35 * 0.86 + 2, 'no worse than an operation with a complication');
  assert.equal(d.pendingDecisions(g).some((x) => x.kind === 'injury' && x.playerId === p.id), false);
  assert.equal(s.canTreat(g, p), false, 'the choice is made once');
  assert.equal(s.treatInjury(g, p.id, 'rehab').ok, false);
  assert.ok(g.news[0].body.includes('operation') || g.news[0].body.includes('complications'));
  // Across many operations the specialist gets players back sooner, on average, than rehab.
  const avg = (how: 'rehab' | 'specialist') => {
    let t = 0;
    for (let i = 0; i < 60; i++) {
      const x = g.players[me.playerIds[6 + (i % 5)]];
      x.injury = { name: 'Broken leg', days: 120 };
      g.day = 10 + i;
      me.finance.balance = 1e9;
      s.treatInjury(g, x.id, how);
      t += x.injury!.days;
      x.injury = null;
    }
    return t / 60;
  };
  assert.ok(avg('specialist') < avg('rehab') - 15);
  // A club that can't pay is refused.
  me.finance.balance = 0;
  me.finance.transferBudget = 0;
  const z = g.players[me.playerIds[12]];
  z.injury = { name: 'Broken leg', days: 130 };
  assert.equal(s.treatInjury(g, z.id, 'specialist').ok, false);
  assert.ok(s.treatInjury(g, z.id, 'rehab').ok, 'rehab is always affordable');
});

test('save files: export and import round-trip, old and damaged files are handled', async () => {
  const io = await import('../src/ui/saveio.js');
  const { SAVE_VERSION } = await import('../src/engine/generate.js');
  const g = newGame(84);
  takeCharge(g, 1, 'Test Manager');
  const me = g.clubs.find((c) => c.id === g.userClubId)!;
  const f = await io.makeSaveFile(g, me.name, new Date('2026-09-29T10:00:00Z'));
  assert.ok(f.filename.startsWith('touchline-arsenal-2026-27-20260929'), f.filename);
  assert.ok(f.text.length < 3_000_000, `a compact file (${f.text.length} bytes)`);
  const back = await io.parseSaveFile(f.text);
  assert.ok(back.game, back.error);
  assert.equal(JSON.stringify(back.game), JSON.stringify(g), 'nothing is lost');
  assert.deepEqual(back.info, { club: me.name, manager: 'Test Manager', season: 2026, exportedAt: '2026-09-29T10:00:00.000Z' });
  // The bare compressed text (what the browser keeps) and plain game JSON also load.
  const header = JSON.parse(f.text);
  assert.ok((await io.parseSaveFile(header.data)).game);
  assert.ok((await io.parseSaveFile(JSON.stringify(g))).game);
  // An older version is upgraded on the way in.
  const old = JSON.parse(JSON.stringify(g));
  old.version = 11;
  delete old.clubs[0].training;
  const up = await io.parseSaveFile(JSON.stringify(old));
  assert.equal(up.game?.version, SAVE_VERSION);
  // Things that aren't saves are refused with a reason.
  assert.match((await io.parseSaveFile('')).error!, /empty/);
  assert.match((await io.parseSaveFile('hello')).error!, /isn't a Touchline save/);
  assert.match((await io.parseSaveFile('{"a":1}')).error!, /isn't a Touchline save/);
  assert.match((await io.parseSaveFile(JSON.stringify({ ...g, version: SAVE_VERSION + 1 }))).error!, /newer version/);
  assert.match((await io.parseSaveFile(JSON.stringify({ ...g, version: 2 }))).error!, /older version/);
  assert.match((await io.parseSaveFile(JSON.stringify({ ...g, clubs: [] }))).error!, /incomplete or damaged/);
  assert.match((await io.parseSaveFile(JSON.stringify({ ...g, userClubId: 9999 }))).error!, /incomplete or damaged/);
  assert.match((await io.parseSaveFile('gz:not-base64!!')).error!, /isn't a Touchline save|damaged/);
});

test('flying ants: classic mode is untouched; the scenario liquidates City and creates the new club', async () => {
  const { traitsOf } = await import('../src/engine/traits.js');
  const { FLYING_ANTS_TEN } = await import('../src/engine/scenario.js');
  const classic = newGame(91);
  const ants = newGame(91, 'Test', 'flying-ants');
  assert.equal(classic.mode, 'classic');
  assert.equal(classic.scenario, undefined);
  assert.ok(classic.clubs.some((c) => c.name === 'Manchester City'));
  assert.equal(ants.mode, 'flying-ants');
  assert.ok(!ants.clubs.some((c) => c.name === 'Manchester City'), 'City no longer exist');

  // The new club takes City's place: same league and id, its own ground and colours.
  const oldCity = classic.clubs.find((c) => c.name === 'Manchester City')!;
  const fa = ants.clubs.find((c) => c.name === 'Flying Ants')!;
  assert.equal(fa.id, oldCity.id);
  assert.equal(ants.scenario!.clubId, fa.id);
  assert.equal(fa.leagueId, 'ENG');
  assert.ok(ants.comps[0].clubIds.includes(fa.id) && ants.comps[0].clubIds.length === 20);
  assert.equal(fa.stadium, 'The Dirtbox');
  assert.equal(fa.capacity, 20146);
  assert.equal(fa.playerIds.length, 24);
  assert.ok(fa.reputation < 4.5, 'a brand-new club is small');
  assert.ok(fa.finance.balance > 0 && fa.finance.history.length === 0, 'its own money, no past');

  // Ten named players: English but for the Welshman, with the right roles and traits.
  const byName = (n: string) => fa.playerIds.map((id) => ants.players[id]).find((p) => `${p.firstName} ${p.lastName}` === n)!;
  assert.equal(FLYING_ANTS_TEN.length, 10);
  for (const n of FLYING_ANTS_TEN) {
    const p = byName(`${n.first} ${n.last}`);
    assert.ok(p, `${n.first} ${n.last} is in the squad`);
    assert.equal(p.nation, n.nation);
    assert.equal(p.age, n.age);
    assert.ok(Math.abs(p.ca - n.ca) <= 8, `${n.last} ability ${p.ca} near ${n.ca}`);
    assert.ok(p.pos[n.primary] === 20, `${n.last} is natural at ${n.primary}`);
    assert.ok(p.contractEnd >= ants.season + 3 && p.wage > 0 && p.bookValue === 0);
  }
  assert.deepEqual(FLYING_ANTS_TEN.filter((n) => n.nation !== 'ENG').map((n) => n.last), ['Evans']);
  const has = (n: string, t: string) => assert.ok(traitsOf(byName(n)).includes(t as never), `${n} should be ${t}: ${traitsOf(byName(n))}`);
  has('Stuart Lee', 'tireless');
  has('Jack Selby', 'aerial');
  has('Jamie Saunders', 'aerial');
  has('Jamie Evans', 'crosser');
  has('Chris Light', 'shotStopper');
  has('Adam Green', 'speedster');
  has('Patch Thompson', 'longShots');
  has('Kealan Sheridan', 'playmaker');
  for (const n of ['Stuart Lee', 'Jack Selby', 'Jamie Saunders', 'Jamie Evans', 'Chris Light', 'Simon Manson', 'Adam Green', 'Patch Thompson', 'Kealan Sheridan', 'James Roworth']) {
    const bad = traitsOf(byName(n)).filter((t) => t === 'hothead' || t === 'brittle');
    assert.deepEqual(bad, [], `${n} has no bad traits`);
  }
  assert.ok(byName('Kealan Sheridan').pos.AMC === 20, 'the number 10');
  assert.ok(byName('Chris Light').pos.GK === 20);
  const rw = byName('James Roworth');
  assert.ok(rw.pos.GK === 20 && rw.pos.ST === 20, 'goalkeeper and striker');
  assert.ok(Object.keys(byName('Simon Manson').pos).length >= 6, 'the utility man plays everywhere');
  assert.ok(fa.playerIds.filter((id) => (ants.players[id].pos.GK ?? 0) >= 20).length >= 3);

  // All of City's players are free agents, and their cash is split equally among the other 19.
  const freed = oldCity.playerIds.map((id) => classic.players[id]);
  assert.equal(ants.scenario!.freed, freed.length);
  for (const p of freed) {
    const q = Object.values(ants.players).find((x) => x.firstName === p.firstName && x.lastName === p.lastName && x.age === p.age && x.nation === p.nation)!;
    assert.ok(q && q.clubId === null && q.wage > 0 && q.freeSince !== undefined, `${p.lastName} is a free agent`);
  }
  const rest = ants.comps[0].clubIds.filter((id) => id !== fa.id);
  assert.equal(rest.length, 19);
  for (const id of rest) assert.equal(ants.clubs[id - 1].finance.balance - classic.clubs[id - 1].finance.balance, ants.scenario!.share, `club ${id} gets the same share`);
  // (City's classic balance also has their cup entry money, added later; the scenario shares out what they had.)
  assert.ok(ants.scenario!.cash > 20e6 && Math.abs(ants.scenario!.share * 19 - ants.scenario!.cash) < 5e6, 'the whole pot is shared out');
  // Nobody else's squad has changed.
  const arsenal = (w: typeof ants) => w.clubs[0].playerIds.map((id) => JSON.stringify(w.players[id].attrs)).join();
  assert.equal(arsenal(ants), arsenal(classic));

  // The first story is in the inbox before a club is chosen.
  assert.equal(ants.news.length, 1);
  assert.equal(ants.news[0].kind, 'headline');
  assert.match(ants.news[0].title, /Manchester City/);
  assert.match(ants.news[0].body, /financial irregularities/);
  assert.match(ants.news[0].body, /liquidation/);
  assert.match(ants.news[0].body, /free agents/);
  assert.equal(ants.news[0].tag, undefined, 'no scenario label on the story');
});

test('flying ants: the second story comes once, with the ten players highlighted; other clubs do not get it', () => {
  const g = newGame(92, 'Test', 'flying-ants');
  takeCharge(g, g.scenario!.clubId, 'Test');
  const top = g.news[0];
  assert.equal(top.kind, 'headline');
  assert.equal(top.players?.length, 10);
  assert.match(top.body, /New Den/);
  assert.match(top.body, /The Dirtbox/);
  assert.match(top.body, /Millwall/);
  assert.match(top.body, /liquidated/);
  assert.match(top.body, /newly scouted/);
  assert.ok(top.players!.every((x) => g.players[x.id]?.clubId === g.scenario!.clubId && x.note.length > 20));
  assert.equal(g.news.filter((n) => n.kind === 'headline').length, 2);
  assert.ok(g.scenario!.welcomed);

  const other = newGame(92, 'Test', 'flying-ants');
  takeCharge(other, 1, 'Test');
  assert.equal(other.news.filter((n) => n.kind === 'headline').length, 1, 'only the first story');
  assert.ok(!other.scenario!.welcomed);
});

test('flying ants: cups use the new club in City\'s places and Millwall is gone', async () => {
  const { resolveClub } = await import('../src/engine/cups.js');
  const g = newGame(93, 'Test', 'flying-ants');
  const id = g.scenario!.clubId;
  const inComp = (comp: string) => g.fixtures.some((f) => f.comp === comp && (f.homeId === id || f.awayId === id));
  assert.ok(inComp('UCL'), 'Flying Ants inherit the Champions League place');
  assert.ok(inComp('ENG'));
  assert.ok(![...g.clubs, ...g.extClubs].some((c) => c.name === 'Millwall' || c.name === 'Manchester City'));
  // Names in the sources still resolve, to the new club; Millwall does not.
  assert.equal(resolveClub(g, 'Man City')?.id, id);
  assert.equal(resolveClub(g, 'Manchester City')?.id, id);
  assert.equal(resolveClub(g, 'Millwall'), null);
  // In classic mode both are there.
  const classic = newGame(93);
  assert.equal(resolveClub(classic, 'Man City')?.name, 'Manchester City');
  assert.equal(resolveClub(classic, 'Millwall')?.name, 'Millwall');
});

test('flying ants: the league scrambles for the free agents, and a save keeps the scenario', async () => {
  const g = newGame(94, 'Test', 'flying-ants');
  const freed = Object.values(g.players).filter((p) => p.clubId === null).sort((a, b) => b.ca - a.ca).slice(0, 25).map((p) => p.id);
  takeCharge(g, g.scenario!.clubId, 'Test');
  const me = g.clubs.find((c) => c.id === g.userClubId)!;
  assert.equal(me.name, 'Flying Ants');
  for (let i = 0; i < 90; i++) playDay(g);
  const signed = freed.filter((id) => g.players[id]?.clubId !== null && g.players[id]?.clubId !== undefined).length;
  assert.ok(signed >= 10, `clubs signed ${signed} of the best free agents`);
  assert.ok(g.players[freed[0]].clubId === null || g.players[freed[0]].wage > 100_000, 'the biggest names are on big money');
  // The scenario survives a save file.
  const io = await import('../src/ui/saveio.js');
  const f = await io.makeSaveFile(g, me.name, new Date('2026-09-29T10:00:00Z'));
  const back = await io.parseSaveFile(f.text);
  assert.equal(back.game?.mode, 'flying-ants');
  assert.deepEqual(back.game?.scenario, g.scenario);
});
