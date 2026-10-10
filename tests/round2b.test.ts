/**
 * Round 2, batch B: pre-contracts for the manager (the real rules), and the assistant manager.
 * Run with:  npx tsx --test tests/round2b.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { halfTimeReport } from '../src/engine/analysis.js';
import { dayOfDate } from '../src/engine/calendar.js';
import { takeCharge, teamSetup, userClub } from '../src/engine/game.js';
import { newGame, SAVE_VERSION } from '../src/engine/generate.js';
import { leagueCountry } from '../src/engine/levels.js';
import { MatchSim } from '../src/engine/match.js';
import { migrateSave } from '../src/engine/migrate.js';
import { Rng } from '../src/engine/rng.js';
import { assistantOf, hireAssistant, sackAssistant, sackCost, searchCandidates, willJoin } from '../src/engine/staff.js';
import { autoPickXI } from '../src/engine/tactics.js';
import { approachPreContract, confirmSigning, preContractStatus, proposeTerms, summerContracts } from '../src/engine/transfers.js';
import type { GameState, Offer, Player } from '../src/engine/types.js';

const on = (g: GameState, y: number, m: number, d: number) => dayOfDate(g.season, new Date(Date.UTC(y, m, d)));

function career(seed = 5, short = 'ARS'): GameState {
  const g = newGame(seed);
  takeCharge(g, g.clubs.find((c) => c.short === short)!.id, 'Test');
  return g;
}

/** Players at other clubs whose contracts end this season, in a country (or not). */
function ending(g: GameState, country: string, same: boolean): Player[] {
  const me = userClub(g);
  return Object.values(g.players).filter((p) => {
    if (!p.clubId || p.clubId === me.id || p.loan || p.preContract || p.contractEnd !== g.season + 1 || p.clubId >= 100000) return false;
    const c = g.clubs[p.clubId - 1];
    return !!c && (leagueCountry(c.leagueId) === country) === same && p.ca >= 90;
  });
}

test('pre-contracts: clubs abroad from 1 January; English clubs only in the last month', () => {
  const g = career();
  const abroad = ending(g, 'ENG', false)[0];
  const home = ending(g, 'ENG', true)[0];
  assert.ok(abroad && home, 'found players whose contracts end this season');
  g.day = on(g, g.season, 9, 20); // October
  assert.equal(preContractStatus(g, abroad)!.open, false);
  assert.match(preContractStatus(g, abroad)!.why, /1 January/);
  g.day = on(g, g.season + 1, 0, 10); // January
  assert.equal(preContractStatus(g, abroad)!.open, true, 'a player abroad is free to talk in January');
  assert.equal(preContractStatus(g, home)!.open, false, 'an English club can\'t talk to a player at another English club in January');
  assert.match(preContractStatus(g, home)!.why, /last month/);
  g.day = on(g, g.season + 1, 5, 5); // June
  assert.equal(preContractStatus(g, home)!.open, true, 'in the last month he can talk');
  // A player with a longer contract, or the manager's own, isn't eligible at all.
  const longer = Object.values(g.players).find((p) => p.clubId && p.clubId !== g.userClubId && p.contractEnd > g.season + 1)!;
  assert.equal(preContractStatus(g, longer), null);
});

test('pre-contracts: Spanish, German, Italian, French and Portuguese clubs can sign domestic players from January', () => {
  const g = career(5, 'RMA');
  const home = ending(g, 'ESP', true)[0];
  assert.ok(home);
  g.day = on(g, g.season + 1, 0, 10);
  assert.equal(preContractStatus(g, home)!.open, true);
});

test('pre-contracts: agreed in January, he joins on 1 July on the terms agreed', () => {
  const g = career();
  g.day = on(g, g.season + 1, 0, 12);
  const me = userClub(g);
  let signed: Player | null = null;
  for (const p of ending(g, 'ENG', false).sort((a, b) => b.ca - a.ca)) {
    const o = approachPreContract(g, p.id);
    if (typeof o === 'string') continue;
    // First offer: what does he want? Then meet it.
    let r = proposeTerms(g, o.id, 1000, 3, 'none') as Offer;
    if (typeof r === 'string' || r.status !== 'accepted') continue;
    r = proposeTerms(g, o.id, r.demand!.wage * 1.13, r.demand!.years, 'none') as Offer;
    if (typeof r === 'string' || !r.agreed) continue;
    const done = confirmSigning(g, o.id) as Offer;
    assert.equal(typeof done, 'object');
    assert.equal(done.status, 'done');
    signed = p;
    break;
  }
  assert.ok(signed, 'signed a pre-contract');
  const p = signed!;
  assert.equal(p.preContract, me.id);
  const terms = { ...p.preTerms! };
  const from = p.clubId;
  assert.ok(g.news.some((n) => /agrees to join you in the summer/.test(n.title)), 'the manager is told');
  assert.equal(preContractStatus(g, p)!.open, false, 'nobody else can sign him now');
  const news: string[] = [];
  summerContracts(g, new Rng(9), news);
  assert.equal(p.clubId, me.id, 'he has joined');
  assert.notEqual(p.clubId, from);
  assert.equal(p.wage, terms.wage);
  assert.equal(p.preTerms, undefined);
  assert.equal(p.preContract, null);
  assert.ok(news.some((x) => x.includes('as agreed in his pre-contract')));
});

test('assistant manager: ratings, candidates, sack and hire', () => {
  const g = career(5, 'BRE');
  const a = assistantOf(g);
  assert.ok(!a.caretaker && a.read >= 3 && a.read <= 20 && a.judge >= 3 && a.judge <= 20 && a.wage > 0);
  assert.equal(g.staffMarket!.pool.length, 10);
  const before = userClub(g).finance.balance;
  const cost = sackCost(a);
  assert.equal(sackAssistant(g), null);
  assert.ok(Math.abs(userClub(g).finance.balance - (before - cost)) < 1, 'sacking him costs six months\' wages');
  assert.ok(assistantOf(g).caretaker, 'the youth coach stands in');
  const pick = g.staffMarket!.pool.find((x) => willJoin(x, userClub(g)))!;
  const refuse = g.staffMarket!.pool.find((x) => !willJoin(x, userClub(g)));
  if (refuse) assert.match(hireAssistant(g, refuse.id)!, /isn't interested/);
  assert.equal(hireAssistant(g, pick.id), null);
  assert.equal(assistantOf(g).id, pick.id);
  assert.ok(!assistantOf(g).caretaker);
  assert.match(searchCandidates(g) ?? '', /new list of candidates on/i, 'only once a week');
  g.day += 8;
  assert.equal(searchCandidates(g), null);
});

test('assistant manager: a perfect judge picks the same XI as before; a poor one has his favourites', () => {
  const g = career(5, 'ARS');
  let diff = 0;
  for (const c of g.clubs.slice(0, 40)) {
    const own = c.assistant;
    delete c.assistant;
    const plain = autoPickXI(c, g.players);
    c.assistant = { id: 77, name: 'X', nation: 'ENG', age: 50, read: 20, judge: 20, wage: 1, joined: 2026 };
    assert.deepEqual(autoPickXI(c, g.players), plain, `${c.name}: perfect judge, same XI`);
    c.assistant = { ...c.assistant, judge: 4 };
    const poor = autoPickXI(c, g.players);
    diff += poor.filter((id, i) => plain[i] !== id).length;
    // Steady: the same picks every time he is asked.
    assert.deepEqual(autoPickXI(c, g.players), poor);
    if (own) c.assistant = own;
    else delete c.assistant;
  }
  assert.ok(diff > 20, `a poor judge makes different choices (${diff} slots across 40 clubs)`);
});

test('assistant manager: with a perfect assistant, skipping to full time plays out exactly as before', () => {
  const g = career(5, 'ARS');
  const me = userClub(g);
  const opp = g.clubs.find((c) => c.short === 'HUL')!;
  const run = (asst: boolean) => {
    const hs = teamSetup(g, me, opp, true);
    const as = teamSetup(g, opp, me, false);
    if (asst) hs.assistant = { id: 1, read: 20, judge: 20 };
    else delete hs.assistant;
    const sim = new MatchSim(hs, as, g.players, new Rng(4242), { commentary: true, human: [true, false] });
    sim.setHuman(0, false);
    let ht = '';
    while (!sim.finished) { sim.step(); if (sim.minute === 45 && !ht) ht = JSON.stringify(halfTimeReport(sim, 0)); }
    const r = sim.outcome().summary;
    return JSON.stringify([r.hg, r.ag, r.events.map((e) => [e.kind, e.minute, e.playerId, e.otherId])]) + ht;
  };
  assert.equal(run(true), run(false));
});

test('assistant manager: a poor reader writes a thinner half-time card', () => {
  const g = career(5, 'ARS');
  const me = userClub(g);
  const opp = g.clubs.find((c) => c.short === 'LIV')!;
  let good = 0;
  let poor = 0;
  let evidence = 0;
  for (let i = 0; i < 12; i++) {
    for (const read of [20, 5]) {
      const hs = { ...teamSetup(g, me, opp, true), assistant: { id: 3, read, judge: 15 } };
      const sim = new MatchSim(hs, teamSetup(g, opp, me, false), g.players, new Rng(300 + i), { commentary: true, human: [true, false] });
      while (sim.minute < 45) sim.step();
      const rep = halfTimeReport(sim, 0)!;
      if (read === 20) good += rep.observations.length;
      else { poor += rep.observations.length; evidence += rep.observations.filter((o) => o.evidence).length; }
    }
  }
  assert.ok(poor < good, `fewer observations (${poor} v ${good})`);
  assert.equal(evidence, 0, 'and no numbers to back them up');
});

test('migration: an older save gets a rated assistant with the name he always had', () => {
  const g = career(5, 'ARS');
  const me = userClub(g);
  delete me.assistant;
  delete g.staffMarket;
  (g as { version: number }).version = 15;
  const m = migrateSave(JSON.parse(JSON.stringify(g)))!;
  assert.equal(m.version, SAVE_VERSION);
  const a = m.clubs[m.userClubId - 1].assistant!;
  assert.ok(a && a.read >= 3 && a.judge >= 3);
  assert.ok(m.staffMarket && m.staffMarket.pool.length === 10);
});

test('fatigue: centre backs tire least of the outfield positions, wide players and strikers most', async () => {
  const { POS_ROLE } = await import('../src/engine/attributes.js');
  const g = newGame(7);
  const eng = g.clubs.filter((c) => c.leagueId === 'ENG');
  const end: Record<string, number[]> = {};
  for (let i = 0; i < 40; i++) {
    const h = eng[i % eng.length];
    const a = eng[(i * 7 + 3) % eng.length];
    if (h === a) continue;
    for (const id of [...h.playerIds, ...a.playerIds]) g.players[id].condition = 100;
    const hs = { ...teamSetup(g, h, a, true), ai: false };
    const as = { ...teamSetup(g, a, h, false), ai: false };
    hs.tactics = { ...hs.tactics, closingDown: 'midfield', mentality: 'balanced' };
    as.tactics = { ...as.tactics, closingDown: 'midfield', mentality: 'balanced' };
    const sim = new MatchSim(hs, as, g.players, new Rng(500 + i), { human: [true, true] });
    while (sim.minute < 90) sim.step();
    for (const side of [0, 1] as const) for (const o of sim.livePlayers(side)) (end[POS_ROLE[o.slot]] ??= []).push(o.cond);
  }
  const avg = (r: string) => end[r].reduce((x, y) => x + y, 0) / end[r].length;
  for (const r of ['FB', 'CM', 'WM', 'ST', 'AW']) if (end[r]) assert.ok(avg('CB') > avg(r) + 1.5, `centre backs (${avg('CB').toFixed(1)}) fresher than ${r} (${avg(r).toFixed(1)})`);
});
