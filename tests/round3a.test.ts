/**
 * Round 3, batch A: contract talks, world transfer news, free agents.
 * Run with:  npx tsx --test tests/round3a.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { takeCharge } from '../src/engine/game.js';
import { newGame } from '../src/engine/generate.js';
import { approachFreeAgent, confirmSigning, offerRenewal, proposeTerms, renewalBlocked, talksFor } from '../src/engine/transfers.js';
import type { GameState, Offer } from '../src/engine/types.js';

function freeAgentTalks(seed = 3): { g: GameState; o: Offer } {
  const g = newGame(seed);
  takeCharge(g, g.clubs.find((c) => c.short === 'ARS')!.id, 'Test');
  const me = g.clubs[g.userClubId - 1];
  me.finance.transferBudget = 200e6;
  me.finance.balance = 300e6;
  me.finance.wageBudget = 1e9;
  const p = Object.values(g.players).filter((x) => x.clubId === null && x.ca >= 120).sort((a, b) => b.ca - a.ca)[0];
  const o = approachFreeAgent(g, p.id) as Offer;
  return { g, o };
}

test('talks: below his ask he comes back with a counter-offer between the two, and meets a fair one', () => {
  const { g, o } = freeAgentTalks();
  const t = talksFor(g, o);
  assert.ok(t.signOn > 0 && t.agentFee > 0, 'a free agent asks for a signing-on fee; his agent for a fee');
  const low = Math.round(t.askWage * 0.85);
  const r1 = proposeTerms(g, o.id, low, t.years, 'none', t.signOn, t.agentFee) as Offer;
  assert.equal(r1.status, 'accepted');
  assert.ok(!r1.agreed, 'not yet');
  const counter = r1.demand!.wage;
  assert.ok(counter > low && counter < t.askWage, `counter ${counter} between ${low} and ${t.askWage}`);
  assert.match(r1.note!, /wants/);
  const r2 = proposeTerms(g, o.id, counter, t.years, 'none', t.signOn, t.agentFee) as Offer;
  assert.ok(r2.agreed, r2.note);
});

test('talks: insulting offers use up his patience and he walks away', () => {
  const { g, o } = freeAgentTalks(4);
  const t = talksFor(g, o);
  let r = o;
  let rounds = 0;
  while (r.status === 'accepted' && rounds < 10) {
    r = proposeTerms(g, o.id, Math.round(t.askWage * 0.3), t.years, 'none', 0, 0) as Offer;
    rounds++;
  }
  assert.equal(r.status, 'collapsed');
  assert.ok(rounds <= 2, `gone after ${rounds} insults`);
  assert.match(r.note!, /walked away/);
});

test('talks: a signing-on fee and the agent\'s fee can stand in for wages, and are paid on signing', () => {
  const { g, o } = freeAgentTalks(5);
  const t = talksFor(g, o);
  const me = g.clubs[g.userClubId - 1];
  // A lower wage with a bigger signing-on fee to make up the difference over the contract.
  const cut = Math.round(t.askWage * 0.1);
  const signOn = t.signOn + cut * 52 * t.years;
  const r = proposeTerms(g, o.id, t.askWage - cut, t.years, 'none', signOn, t.agentFee) as Offer;
  assert.ok(r.agreed, r.note);
  // Without the agent's fee, the same wage isn't enough.
  const { g: g2, o: o2 } = freeAgentTalks(5);
  const t2 = talksFor(g2, o2);
  const r2 = proposeTerms(g2, o2.id, t2.askWage, t2.years, 'none', t2.signOn, 0) as Offer;
  assert.ok(!r2.agreed && r2.demand!.wage > t2.askWage, 'an unpaid agent costs more in wages');
  const before = { budget: me.finance.transferBudget, signing: me.finance.ledger.signing ?? 0 };
  confirmSigning(g, o.id);
  assert.equal(r.status, 'done');
  const paid = signOn + t.agentFee;
  assert.ok(Math.abs(before.budget - me.finance.transferBudget - paid) < 1, 'fees come out of the transfer budget');
  assert.ok(Math.abs((me.finance.ledger.signing ?? 0) - before.signing - paid) < 1, 'and show in the accounts');
});

test('renewals: a player who walks out won\'t talk again for a month', () => {
  const g = newGame(6);
  takeCharge(g, g.clubs.find((c) => c.short === 'ARS')!.id, 'Test');
  const me = g.clubs[g.userClubId - 1];
  me.finance.wageBudget = 1e9;
  const p = me.playerIds.map((id) => g.players[id]).filter((x) => !x.loan).sort((a, b) => b.ca - a.ca)[2];
  let r = offerRenewal(g, p.id, 1000, 3, 'keep');
  for (let i = 0; i < 6 && !r.walked; i++) r = offerRenewal(g, p.id, 1000, 3, 'keep');
  assert.ok(r.walked, r.message);
  assert.ok(renewalBlocked(g, p));
  assert.match(offerRenewal(g, p.id, p.wage * 3, 3, 'keep').message, /won't discuss/);
});

test('world news: a record fee and moves by the biggest names make the news; the window ends with a round-up', async () => {
  const { completeTransfer, makeFreeAgent } = await import('../src/engine/transfers.js');
  const { playDay } = await import('../src/engine/game.js');
  const g = newGame(7);
  takeCharge(g, g.clubs.find((c) => c.short === 'ARS')!.id, 'Test');
  assert.equal(g.worldRecord?.fee ?? 198e6, 198e6);
  const rm = g.clubs.find((c) => c.name === 'Real Madrid')!;
  const city = g.clubs.find((c) => c.name === 'Manchester City')!;
  const star = rm.playerIds.map((id) => g.players[id]).sort((a, b) => b.ca - a.ca)[0];
  completeTransfer(g, star, city, 230e6, star.wage, 5);
  assert.equal(g.worldRecord!.fee, 230e6);
  assert.ok(g.news.some((n) => n.title.startsWith('World record:') && n.body.includes('Neymar')), 'a new world record, and the old one');
  const big = g.clubs.find((c) => c.name === 'Bayern Munich')!.playerIds.map((id) => g.players[id]).sort((a, b) => b.ca - a.ca)[0];
  completeTransfer(g, big, g.clubs.find((c) => c.name === 'Juventus')!, 12e6, big.wage, 3);
  assert.ok(g.news.some((n) => n.title === `${big.lastName} joins Juventus for £12m`), 'a top name moving for any fee');
  const minor = g.clubs.find((c) => c.name === 'Brentford')!.playerIds.map((id) => g.players[id]).sort((a, b) => a.ca - b.ca)[0];
  const before = g.news.length;
  makeFreeAgent(g, minor);
  completeTransfer(g, minor, g.clubs.find((c) => c.name === 'Fulham')!, 0, minor.wage, 1);
  assert.equal(g.news.length, before, 'small moves are not news');
  while (g.day <= 33) playDay(g);
  const sum = g.news.find((n) => /Summer window: Premier League round-up/.test(n.title));
  assert.ok(sum && /Spent/.test(sum.body) && /Arsenal:/.test(sum.body), sum?.body);
});

test('free agents: good players find clubs once the season starts; stars hold out for a big club', async () => {
  const { makeFreeAgent } = await import('../src/engine/transfers.js');
  const { playDay } = await import('../src/engine/game.js');
  const g = newGame(8);
  takeCharge(g, g.clubs.find((c) => c.short === 'ARS')!.id, 'Test');
  while (g.day < 0) playDay(g);
  const pick = (name: string, i: number) => g.clubs.find((c) => c.name.includes(name))!.playerIds.map((id) => g.players[id]).filter((p) => !p.away).sort((a, b) => b.ca - a.ca)[i];
  const star = pick('Barcelona', 0);
  const good = [pick('Aston Villa', 4), pick('Sevilla', 3), pick('Wolfsburg', 2), pick('Lens', 3)];
  for (const p of [star, ...good]) makeFreeAgent(g, p);
  const wage = star.wage;
  while (g.day < 45) playDay(g);
  const signed = good.filter((p) => p.clubId !== null).length;
  assert.ok(signed >= 3, `most good players have a club by mid-September (${signed}/4)`);
  while (g.day < 150 && star.clubId === null) playDay(g);
  assert.ok(star.clubId !== null, 'the star has a club by the new year');
  const club = g.clubs.find((c) => c.id === star.clubId)!;
  assert.ok(club.reputation >= 7, `a big club (${club.name}, ${club.reputation})`);
  assert.ok(star.wage <= wage, 'on no more than he earned');
});

test('Squad Cost Ratio: the board budget to the green line, the manager can go to the red line, not past it', async () => {
  const F = await import('../src/engine/finance.js');
  const g = newGame(9);
  takeCharge(g, g.clubs.find((c) => c.short === 'ARS')!.id, 'Test');
  const me = g.clubs[g.userClubId - 1];
  const rule = F.spendingRule(g, me);
  assert.equal(rule.name, 'Squad Cost Ratio (SCR)');
  assert.ok(rule.ok && !rule.amber, rule.text);
  me.finance.transferBudget = 2e9;
  const green = F.scrWageAt(g, me, F.SCR_GREEN);
  const red = F.scrWageAt(g, me, F.scrRed(me));
  assert.ok(red > green && Math.abs(F.wageCap(g, me) - green) < 1);
  // Up to the red line is allowed (a levy is due above green); past it, no.
  assert.equal(F.shiftTransferToWages(g, me, Math.round((red - me.finance.wageBudget) * 0.98)), null);
  assert.match(F.shiftTransferToWages(g, me, 500_000) ?? '', /red line/);
});

test('Squad Cost Ratio: finishing over the green line costs a levy and allowance; the wage budget carries over', async () => {
  const F = await import('../src/engine/finance.js');
  const { playDay, seasonOver, startNewSeason } = await import('../src/engine/game.js');
  const g = newGame(10);
  takeCharge(g, g.clubs.find((c) => c.short === 'ARS')!.id, 'Test');
  const me = g.clubs[g.userClubId - 1];
  // The June test, on a season's accounts: 100% of revenue on the squad, in 2027/28 (levies start then).
  const rival = g.clubs.find((c) => c.name === 'Chelsea')!;
  const l = rival.finance.ledger;
  Object.assign(l, { gate: 0, tv: 400e6, prize: 0, sponsorship: 0, merchandise: 0, wages: 300e6, amortisation: 100e6, saleProfit: 0, signing: 0 });
  const cash = rival.finance.balance;
  g.season = 2027;
  const end = F.scrSeasonEnd(g, rival)!;
  assert.ok(Math.abs(end.ratio - 1) < 0.01, `ratio ${end.ratio}`);
  assert.equal(end.levy, 30e6, 'half of the £60m over the green line');
  assert.equal(rival.finance.balance, cash - 30e6);
  assert.ok(Math.abs(end.allowance - 0.15) < 0.001, 'allowance cut by the 15% overspend');
  // Within the line next time: 10% back.
  Object.assign(l, { wages: 200e6, amortisation: 50e6 });
  assert.ok(Math.abs(F.scrSeasonEnd(g, rival)!.allowance - 0.25) < 0.001);
  g.season = 2026;
  // The manager's wage budget carries over into the new season.
  while (!seasonOver(g)) playDay(g);
  const budget = me.finance.wageBudget;
  startNewSeason(g);
  assert.ok(me.finance.wageBudget >= Math.min(budget, F.wageCap(g, me)) - 5000, `the budget carries over (${budget} -> ${me.finance.wageBudget})`);
});

test('AI spending: Premier League clubs budget about half their revenue for transfers; the manager\'s board use cash', async () => {
  const F = await import('../src/engine/finance.js');
  const g = newGame(12);
  takeCharge(g, g.clubs.find((c) => c.short === 'ARS')!.id, 'Test');
  const pl = g.clubs.filter((c) => c.leagueId === 'ENG' && c.id !== g.userClubId);
  const share = pl.reduce((s, c) => s + c.finance.transferBudget, 0) / pl.reduce((s, c) => s + F.expectedRevenue(g, c), 0);
  assert.ok(share > 0.35 && share < 0.75, `AI Premier League budgets ${Math.round(share * 100)}% of revenue`);
  const me = g.clubs[g.userClubId - 1];
  assert.ok(me.finance.transferBudget <= Math.max(0, me.finance.balance), 'the manager\'s budget stays within the cash in the bank');
});
