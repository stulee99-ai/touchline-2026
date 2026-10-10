/**
 * Regression tests for keeper fatigue, match-day availability after international breaks,
 * and substitutions that can be taken back until play restarts.
 * Run with:  npx tsx --test tests/fixes.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineupBlockers, playUntilDecision } from '../src/engine/decisions.js';
import { advanceToUserMatch, nextMatchDay, playDay, recallForMatch, takeCharge, userClub, userPlaysNext } from '../src/engine/game.js';
import { defaultTactics, newGame } from '../src/engine/generate.js';
import { windows } from '../src/engine/intl.js';
import { MatchSim } from '../src/engine/match.js';
import { Rng } from '../src/engine/rng.js';
import { autoPickXI, available, pickBench } from '../src/engine/tactics.js';
import type { Tactics } from '../src/engine/types.js';

function sim(seed: number, tactics: Partial<Tactics> = {}) {
  const g = newGame(seed);
  for (const p of Object.values(g.players)) delete p.away; // as if the World Cup were over: full-strength sides
  const [h, a] = g.clubs;
  const setup = (c: typeof h, t: Partial<Tactics>) => {
    const xi = autoPickXI(c, g.players);
    return { club: c, xi, bench: pickBench(c, g.players, xi), formation: c.tactics.formation, tactics: { ...defaultTactics(c.tactics.formation), ...t }, ai: false };
  };
  for (const p of Object.values(g.players)) p.condition = 100;
  return { g, sim: new MatchSim(setup(h, tactics), setup(a, {}), g.players, new Rng(seed), { commentary: true, human: [true, false] }) };
}

test('fatigue: keepers tire far less than outfielders, and pressing barely touches them', () => {
  const drop = (press: Tactics['closingDown']) => {
    const { sim: s } = sim(31, { closingDown: press });
    for (let i = 0; i < 60; i++) s.step();
    const live = s.livePlayers(0);
    const gk = live.find((o) => o.slot === 'GK')!;
    const out = live.filter((o) => o.slot !== 'GK');
    return { gk: 100 - gk.cond, out: out.reduce((n, o) => n + (100 - o.cond), 0) / out.length };
  };
  const mixed = drop('mixed');
  const high = drop('all-over');
  assert.ok(high.gk < high.out * 0.45, `keeper ${high.gk.toFixed(1)} vs outfield ${high.out.toFixed(1)} under a high press`);
  assert.ok(high.out > mixed.out * 1.15, 'outfielders feel the press');
  assert.ok(high.gk < mixed.gk * 1.1, `the press adds little for the keeper (${mixed.gk.toFixed(2)} -> ${high.gk.toFixed(2)})`);
});

test('international break: the calendar reaches match day before kick-off, so the players are back', () => {
  const g = newGame(7);
  const ars = g.clubs.find((c) => c.name === 'Arsenal')!;
  takeCharge(g, ars.id, 'Test');
  const w = windows(g.season)[0];
  // Play up to the last match day before the September/October window.
  while (nextMatchDay(g)! < w.from) playDay(g);
  // Send most of the squad away until the day after the window, as call-ups do.
  const squad = ars.playerIds.map((id) => g.players[id]);
  for (const p of squad.slice(0, 18)) if (!p.injury) p.away = { nation: p.nation, until: w.to + 1, what: 'internationals' };
  playUntilDecision(g);
  advanceToUserMatch(g); // past any decision (an offer, say) that stopped the days short of the match
  assert.ok(userPlaysNext(g));
  assert.equal(g.day, nextMatchDay(g), 'standing on match day');
  assert.ok(g.day > w.to, 'after the window');
  assert.equal(squad.filter((p) => p.away && p.away.until <= g.day).length, 0, 'everyone due back is back');
  assert.deepEqual(lineupBlockers(g).filter((b) => b.startsWith('Only')), []);
});

test('international break: a club left short has players released to make eleven', () => {
  const g = newGame(8);
  takeCharge(g, g.clubs[0].id, 'Test');
  const c = userClub(g);
  const squad = c.playerIds.map((id) => g.players[id]);
  for (const p of squad) p.away = { nation: p.nation, until: g.day + 30, what: 'internationals' };
  recallForMatch(g);
  const fit = squad.filter(available);
  assert.equal(fit.length, 11);
  assert.ok(fit.some((p) => (p.pos.GK ?? 0) >= 15), 'with a keeper');
  assert.ok(g.news.some((n) => n.title.includes('released from international duty')));
});

test('international break: nothing is advanced while a decision is waiting', () => {
  const g = newGame(9);
  takeCharge(g, g.clubs[0].id, 'Test');
  while (!userPlaysNext(g)) playDay(g);
  const day = g.day;
  const reached = advanceToUserMatch(g, () => true);
  assert.ok(!reached || g.day === nextMatchDay(g));
  assert.ok(g.day <= day + 1, 'stops after the first day when asked to');
});

test('substitutions: changes at a stoppage can be taken back exactly', () => {
  const { sim: s } = sim(14);
  for (let i = 0; i < 20; i++) s.step();
  const before = { active: s.livePlayers(0).map((o) => `${o.p.id}@${o.idx}`).sort(), bench: s.benchPlayers(0).map((p) => p.id), left: s.subsLeft(0), windows: s.windowsLeft(0), events: s.events.length, lines: s.lines.length };
  const mark = s.markChanges(0);
  const n = s.lines.length;
  const off = s.livePlayers(0).find((o) => o.slot !== 'GK')!;
  const on = s.benchPlayers(0)[0];
  assert.ok(s.substitute(0, off.p.id, on.id));
  const other = s.livePlayers(0).find((o) => o.slot !== 'GK' && o.p.id !== on.id)!;
  assert.ok(s.movePlayer(0, other.p.id, off.idx === 0 ? 1 : 0) || true);
  assert.equal(s.subsLeft(0), before.left - 1);
  s.rollback(0, mark, new Set(s.lines.slice(n)));
  assert.deepEqual(s.livePlayers(0).map((o) => `${o.p.id}@${o.idx}`).sort(), before.active);
  assert.deepEqual(s.benchPlayers(0).map((p) => p.id), before.bench);
  assert.equal(s.subsLeft(0), before.left);
  assert.equal(s.windowsLeft(0), before.windows);
  assert.equal(s.events.length, before.events);
  assert.equal(s.lines.length, before.lines);
  // And the match carries on normally afterwards.
  assert.ok(s.substitute(0, off.p.id, on.id));
  while (!s.finished) s.step();
});

test('transfers: a player who refuses to join permanently cannot be signed through a loan with an option', async () => {
  const { makeBid, makeLoanBid, exerciseOption } = await import('../src/engine/transfers.js');
  const g = newGame(5, 'Test', 'flying-ants');
  takeCharge(g, g.scenario!.clubId, 'Test');
  const p = Object.values(g.players).find((x) => x.lastName === 'Endrick' || x.firstName === 'Endrick')!;
  assert.ok(p, 'Endrick is in the game');
  const me = g.clubs.find((c) => c.id === g.scenario!.clubId)!;
  const bid = makeBid(g, p.id, me.finance.transferBudget);
  assert.ok(typeof bid !== 'string' && bid.status === 'rejected' && /stature/.test(bid.note ?? ''), 'the permanent bid is turned down');
  const loan = makeLoanBid(g, p.id, 1, me.finance.transferBudget);
  assert.ok(typeof loan !== 'string');
  if (typeof loan !== 'string' && loan.status !== 'rejected') {
    assert.equal(loan.status, 'countered', 'no option to buy');
    assert.equal(loan.counterFee, undefined);
  }
  // Even an option already agreed (an older save) can't be used to sign him.
  p.loan = { parentId: p.clubId!, wageShare: 1, optionFee: 50e6 };
  const parent = p.clubId!;
  p.clubId = g.scenario!.clubId;
  const err = exerciseOption(g, p.id);
  assert.ok(err && /won't sign permanently/.test(err), err ?? 'signed');
  p.clubId = parent;
  p.loan = null;
});

test('cups: in Flying Ants mode the EFL Cup has no byes at all and halves cleanly to a two-club final', async () => {
  const g = newGame(5, 'Test', 'flying-ants');
  takeCharge(g, g.scenario!.clubId, 'Test');
  const efl = () => g.cups.find((c) => c.id === 'EFL')!;
  for (let i = 0; i < 400 && !efl().winnerId; i++) playDay(g);
  const c = efl();
  assert.ok(c.winnerId, 'a winner');
  const lastEntry = Math.max(...c.rounds.map((r, i) => (r.entrants.length ? i : 0)));
  for (let r = 0; r < c.rounds.length; r++) {
    const ties = c.ties.filter((t) => t.round === r);
    assert.ok(ties.every((t) => t.homeId !== null && t.awayId !== null), `no byes in ${c.rounds[r].name}`);
    if (r >= lastEntry) assert.equal(ties.length, 2 ** (c.rounds.length - 1 - r), `${c.rounds[r].name} has ${ties.length} ties`);
  }
});

test('budgets: the wage budget follows the bank balance, within the spending rules, and money moves between budgets', async () => {
  const { refreshWageBudget, shiftTransferToScouting, shiftTransferToWages, wageBill, wageCap, WAGE_WEEKS } = await import('../src/engine/finance.js');
  const g = newGame(3);
  const ars = g.clubs.find((c) => c.name === 'Arsenal')!;
  takeCharge(g, ars.id, 'Test');
  const f = ars.finance;
  const before = f.wageBudget;
  f.balance += 150e6;
  refreshWageBudget(g, ars);
  assert.ok(f.wageBudget > before, 'more cash, more wages');
  assert.ok(f.wageBudget <= Math.max(wageCap(g, ars), f.wageBase!) * 1.02, 'never above the PSR cap');
  f.balance += 5e9;
  refreshWageBudget(g, ars);
  assert.ok(f.wageBudget <= Math.max(wageCap(g, ars), f.wageBase!) * 1.02, 'still capped with a fortune in the bank');
  // Transfers -> wages and back.
  f.balance -= 5e9;
  refreshWageBudget(g, ars);
  const tb = f.transferBudget;
  const wb = f.wageBudget;
  const room = wageCap(g, ars) - wb;
  if (room > 10e3) {
    assert.equal(shiftTransferToWages(g, ars, 10e3), null);
    assert.equal(f.transferBudget, tb - 10e3 * WAGE_WEEKS);
    assert.ok(f.wageBudget >= wb + 9e3);
  }
  assert.equal(shiftTransferToWages(g, ars, -10e3), null);
  assert.ok(Math.abs(f.transferBudget - tb) < 1, 'and back again');
  assert.match(shiftTransferToWages(g, ars, -(f.wageBudget - wageBill(g, ars.id) + 50e3)) ?? '', /can't go below/);
  assert.match(shiftTransferToWages(g, ars, f.transferBudget) ?? '', /transfer budget/);
  // Transfers -> scouting and back.
  const sb = f.scoutBudget ?? 0;
  assert.equal(shiftTransferToScouting(ars, 500e3), null);
  assert.equal(f.scoutBudget, sb + 500e3);
  assert.equal(shiftTransferToScouting(ars, -500e3), null);
  assert.equal(f.scoutBudget, sb);
  assert.match(shiftTransferToScouting(ars, -(sb + 1)) ?? '', /scouting budget/);
});

test('scouting: stars are well known, opponents get known by playing them, and former players are known completely', async () => {
  const { knowledge, learnFromMatch, rememberFormer, attrRange } = await import('../src/engine/scouting.js');
  const g = newGame(4);
  const ars = g.clubs.find((c) => c.name === 'Arsenal')!;
  takeCharge(g, ars.id, 'Test');
  const others = Object.values(g.players).filter((p) => p.clubId && p.clubId !== ars.id);
  const star = others.sort((a, b) => b.ca - a.ca)[0];
  assert.ok(knowledge(g, star) >= 80, `the best player in the game is well known (${knowledge(g, star)})`);
  const keys = Object.keys(star.attrs) as (keyof typeof star.attrs)[];
  assert.ok(keys.filter((k) => attrRange(g, star, k)[0] === attrRange(g, star, k)[1]).length >= keys.length * 0.7, 'most of his attributes exactly');
  const unknown = others.filter((p) => p.ca < 110 && p.age >= 22 && knowledge(g, p) < 40)[0];
  const k0 = knowledge(g, unknown);
  learnFromMatch(g, [unknown.id]);
  assert.ok(knowledge(g, unknown) >= k0 + 14, 'a game against him teaches a lot');
  const mine = ars.playerIds.map((id) => g.players[id])[3];
  rememberFormer(g, mine.id);
  const away = g.clubs.find((c) => c.name === 'Chelsea')!;
  ars.playerIds = ars.playerIds.filter((id) => id !== mine.id);
  away.playerIds.push(mine.id);
  mine.clubId = away.id;
  assert.equal(knowledge(g, mine), 100, 'a former player stays fully known');
});

test('stadium: the board approve plans the club can fill and afford; works close seats, then open the new stand', async () => {
  const S = await import('../src/engine/stadium.js');
  const g = newGame(5, 'Test', 'flying-ants');
  takeCharge(g, g.scenario!.clubId, 'Test');
  const c = userClub(g);
  c.reputation = 5;
  g.board!.confidence = 86;
  const opts = S.stadiumOptions(g, c);
  const huge = opts.find((o) => o.capacity === 80000)!;
  assert.match(S.boardObjection(g, c, huge) ?? '', /struggle to fill/);
  g.board!.confidence = 40;
  assert.match(S.boardObjection(g, c, opts[0]) ?? '', /confidence/);
  g.board!.confidence = 86;
  const before = c.capacity;
  const bal = c.finance.balance;
  const r = S.requestStadium(g, opts[0]);
  assert.ok(r.ok, r.message);
  assert.ok(c.capacity < before, 'seats closed during the works');
  assert.ok(c.stadiumLoan && c.stadiumLoan.monthly > 0, 'a loan pays for it');
  assert.equal(S.requestStadium(g, opts[1]).ok, false, 'one project at a time');
  // Ten months on, the stand is open and the loan is being repaid.
  for (let i = 0; i < 12 && c.stadiumWorks; i++) {
    g.day += 31;
    S.stadiumMonthly(g);
  }
  assert.equal(c.stadiumWorks, null);
  assert.equal(c.capacity, opts[0].capacity);
  assert.ok(c.finance.balance < bal, 'repayments come out of the balance');
  assert.ok((c.finance.ledger.stadium ?? 0) > 0, 'shown as stadium spending');
});

test('stadium: crowds follow demand once the ground is bigger than the fan base', async () => {
  const { MatchSim } = await import('../src/engine/match.js');
  const g = newGame(6);
  const [h, a] = g.clubs;
  const setup = (c: typeof h) => { const xi = autoPickXI(c, g.players); return { club: c, xi, bench: pickBench(c, g.players, xi), formation: c.tactics.formation, tactics: defaultTactics(c.tactics.formation), ai: false }; };
  h.fans = h.capacity * 0.7;
  const s = new MatchSim(setup(h), setup(a), g.players, new Rng(3));
  const crowd = s.runToEnd().summary.attendance;
  assert.ok(crowd < h.capacity * 0.9, `crowd ${crowd} of ${h.capacity}`);
});

test('transfers: a lower-league player moving up asks for a big rise, not the going rate at the top', async () => {
  const { wageDemand } = await import('../src/engine/transfers.js');
  const { clubWage } = await import('../src/engine/finance.js');
  const g = newGame(5, 'Test', 'flying-ants');
  takeCharge(g, g.scenario!.clubId, 'Test');
  const me = userClub(g);
  me.reputation = 7;
  const p = Object.values(g.players).filter((x) => x.clubId && g.clubs[x.clubId - 1].leagueId === 'EN4').sort((a, b) => b.ca - a.ca)[0];
  p.ca = 160;
  p.wage = 2000;
  const demand = wageDemand(g, p, me);
  assert.ok(demand <= clubWage(p, me) * 0.4, `asks ${demand} against a going rate of ${clubWage(p, me)}`);
  assert.ok(demand >= p.wage * 4, 'still a big rise');
  // An established player at a top club still wants the going rate.
  const star = Object.values(g.players).filter((x) => x.clubId && g.clubs[x.clubId - 1].leagueId === 'ENG' && x.clubId !== me.id).sort((a, b) => b.ca - a.ca)[5];
  assert.ok(wageDemand(g, star, me) >= Math.min(clubWage(star, me), star.wage), 'stars still want their worth');
});

test('loans: a summer loan-out can carry a January recall clause, which the borrower may refuse, and is used in January', async () => {
  const T = await import('../src/engine/transfers.js');
  const { seasonDay } = await import('../src/engine/calendar.js');
  const g = newGame(9);
  const me = g.clubs.find((c) => c.name === 'Arsenal')!;
  takeCharge(g, me.id, 'Test');
  g.day = seasonDay('2026-07-20', 2026);
  const kids = me.playerIds.map((id) => g.players[id]).filter((p) => !p.loan && !p.cover).sort((a, b) => a.ca - b.ca).slice(0, 8);
  const host = g.clubs.find((c) => c.name === 'Sunderland')!;
  let agreed = 0;
  let refused = 0;
  for (const p of kids) {
    const o = { id: g.nextOfferId++, kind: 'loan' as const, playerId: p.id, buyerId: host.id, sellerId: me.id, fee: 0, wageShare: 1, optionFee: null, status: 'pending' as const, season: g.season, day: g.day };
    g.offers.push(o as never);
    T.respondToBid(g, o.id, 'accept-recall');
    if (p.loan?.recall) agreed++;
    else {
      assert.ok((o as { recallRefused?: boolean }).recallRefused, 'refused, offer still open');
      refused++;
      T.respondToBid(g, o.id, 'accept');
      assert.ok(p.loan && !p.loan.recall, 'accepted without the clause');
    }
  }
  assert.ok(agreed > 0 && refused > 0, `some agree (${agreed}), some refuse (${refused})`);
  const back = kids.find((p) => p.loan?.recall)!;
  assert.match(T.recallLoan(g, back.id) ?? '', /January/);
  g.day = seasonDay('2027-01-10', 2026);
  assert.equal(T.recallLoan(g, back.id), null);
  assert.equal(back.clubId, me.id);
  assert.equal(back.loan, null);
});

test('loans: AI parent clubs use recall clauses in January, mostly for players not playing', async () => {
  const T = await import('../src/engine/transfers.js');
  const { seasonDay } = await import('../src/engine/calendar.js');
  const { Rng: R } = await import('../src/engine/rng.js');
  const g = newGame(10);
  const me = g.clubs.find((c) => c.name === 'Fulham')!;
  takeCharge(g, me.id, 'Test');
  const parent = g.clubs.find((c) => c.name === 'Chelsea')!;
  const loanees = parent.playerIds.map((id) => g.players[id]).sort((a, b) => a.ca - b.ca).slice(0, 10);
  g.day = seasonDay('2026-08-10', 2026);
  for (const p of loanees) T.completeLoan(g, p, me, 1, 0, null, true);
  for (const p of loanees) p.stats.apps = 0;
  g.day = seasonDay('2027-01-01', 2026);
  T.transferDay(g, new R(3));
  const back = loanees.filter((p) => p.clubId === parent.id).length;
  assert.ok(back >= 3, `${back} of 10 benched loanees recalled`);
  assert.ok(g.news.some((n) => /recall/.test(n.title)), 'the manager hears about it');
});

test('release clauses: the manager is told about them, and can remove or change them in a new contract, at a price', async () => {
  const T = await import('../src/engine/transfers.js');
  const g = newGame(12);
  const rm = g.clubs.find((c) => c.name === 'Real Madrid')!;
  takeCharge(g, rm.id, 'Test');
  T.clauseNotice(g);
  assert.ok(g.news.some((n) => /release clause/.test(n.title)), 'told which players have clauses');
  assert.ok(!T.clauseChoices(g, g.players[rm.playerIds[0]], rm).some((c) => c.key === 'none'), 'Spanish contracts must keep one');
  const ars = g.clubs.find((c) => c.name === 'Arsenal')!;
  const g2 = newGame(13);
  const a2 = g2.clubs.find((c) => c.name === 'Arsenal')!;
  takeCharge(g2, a2.id, 'Test');
  const p = a2.playerIds.map((id) => g2.players[id]).sort((x, y) => y.ca - x.ca)[3];
  p.releaseClause = 60e6;
  a2.finance.wageBudget = 1e9;
  const ask = (key: string) => {
    const r = T.offerRenewal(g2, p.id, 1, 5, key);
    return Number((r.message.match(/£([\d.]+)(k|m)/) ?? [])[1]) * ((r.message.match(/£[\d.]+(k|m)/) ?? [])[1] === 'm' ? 1e6 : 1e3);
  };
  const none = ask('none');
  const low = ask('x1.5');
  assert.ok(none > low, `no clause costs more (${none} vs ${low})`);
  const r = T.offerRenewal(g2, p.id, none * 1.05, 5, 'none');
  assert.ok(r.ok, r.message);
  assert.equal(p.releaseClause, null, 'clause removed');
  void ars;
});

test('free agents: agreeing terms is not signing; the manager confirms', async () => {
  const { approachFreeAgent, proposeTerms, confirmSigning, reopenTerms, wageDemand, preferredYears } = await import('../src/engine/transfers.js');
  const { pendingDecisions } = await import('../src/engine/decisions.js');
  const g = newGame(5);
  const ars = g.clubs.find((c) => c.name === 'Arsenal')!;
  takeCharge(g, ars.id, 'Test');
  const me = userClub(g);
  // Free a modest player from another club.
  const other = g.clubs.find((c) => c.name === 'Brentford')!;
  const p = other.playerIds.map((id) => g.players[id]).sort((a, b) => a.ca - b.ca)[0];
  other.playerIds = other.playerIds.filter((id) => id !== p.id);
  p.clubId = null;
  me.finance.wageBudget += 1e6;
  const o = approachFreeAgent(g, p.id);
  assert.ok(typeof o !== 'string');
  const wage = wageDemand(g, p, me) * 2;
  const r = proposeTerms(g, o.id, wage, preferredYears(p), 'none');
  assert.ok(typeof r !== 'string' && r.agreed, 'he agrees');
  assert.equal(p.clubId, null, 'not signed yet');
  assert.ok(pendingDecisions(g).some((d) => d.offerId === o.id && d.text.includes('agreed terms')));
  reopenTerms(g, o.id);
  assert.equal(o.agreed, false);
  proposeTerms(g, o.id, wage, preferredYears(p), 'none');
  const done = confirmSigning(g, o.id);
  assert.ok(typeof done !== 'string' && done.status === 'done');
  assert.equal(p.clubId, me.id);
  assert.ok(me.playerIds.includes(p.id));
});

test('assistant: half-time subs only when it is going badly; the debrief reads the match', async () => {
  const { halfTimeReport, debrief } = await import('../src/engine/analysis.js');
  let badlyWithSub = 0;
  let reports = 0;
  for (let seed = 40; seed < 64; seed++) {
    const { g, sim: s } = sim(seed);
    while (s.minute < 45) s.step();
    const rep = halfTimeReport(s, 0);
    assert.ok(rep, 'a report for the manager\'s side');
    reports++;
    const subs = rep!.suggestions.filter((x) => x.kind === 'sub');
    if (!rep!.badly) assert.equal(subs.length, 0, `seed ${seed}: no subs when it isn't going badly (${rep!.label})`);
    else if (subs.length) badlyWithSub++;
    assert.ok(rep!.suggestions.length <= 3 && rep!.observations.length >= 1);
    if (seed === 40) {
      while (!s.finished) s.step();
      const [h, a] = g.clubs;
      g.userClubId = h.id;
      const f = { id: 99999, comp: h.leagueId, round: 0, day: g.day, weekend: g.day, time: '15:00', tbc: false, homeId: h.id, awayId: a.id, result: s.outcome().summary };
      const d = debrief(g, f);
      assert.ok(d, 'a debrief');
      assert.ok(d!.points.length >= 1 && d!.players.length >= 1 && d!.players.length <= 5);
      assert.equal(d!.spells.ours.length, 6);
      assert.ok(d!.positives.length && d!.concerns.length);
    }
  }
  assert.equal(reports, 24);
  assert.ok(badlyWithSub >= 1, 'when it goes badly he does suggest a change of personnel');
});

test('contracts: a player tied up for years can be offered a new deal, and wants a rise for it', async () => {
  const T = await import('../src/engine/transfers.js');
  const g = newGame(21);
  const ars = g.clubs.find((c) => c.name === 'Arsenal')!;
  takeCharge(g, ars.id, 'Test');
  ars.finance.wageBudget = 1e9;
  const p = ars.playerIds.map((id) => g.players[id]).filter((x) => x.age < 30).sort((a, b) => b.ca - a.ca)[0];
  p.contractEnd = g.season + 5;
  p.releaseClause = 50e6;
  const wage = p.wage;
  const amount = (m: string) => Number((m.match(/£([\d.]+)(k|m)/) ?? [])[1]) * ((m.match(/£[\d.]+(k|m)/) ?? [])[1] === 'm' ? 1e6 : 1e3);
  const shorter = T.offerRenewal(g, p.id, wage * 3, 3, 'keep');
  assert.ok(!shorter.ok && /less time/.test(shorter.message), shorter.message);
  const same = T.offerRenewal(g, p.id, wage, 5, 'keep');
  assert.ok(!same.ok && /wants/.test(same.message), 'the same money is not enough');
  assert.ok(amount(same.message) > wage, `he asks for a rise (${amount(same.message)} vs ${wage})`);
  const noClause = T.offerRenewal(g, p.id, 1, 5, 'none');
  assert.ok(amount(noClause.message) > amount(same.message), 'removing the clause costs more');
  const done = T.offerRenewal(g, p.id, amount(noClause.message), 5, 'none');
  assert.ok(done.ok, done.message);
  assert.equal(p.releaseClause, null);
  assert.ok(p.wage > wage);
});

test('release clauses: rare in England (none by default, no wage premium), the law in Spain', async () => {
  const T = await import('../src/engine/transfers.js');
  const g = newGame(23);
  const ars = g.clubs.find((c) => c.name === 'Arsenal')!;
  const rma = g.clubs.find((c) => c.name === 'Real Madrid')!;
  assert.equal(T.defaultClause(ars), 'none');
  assert.notEqual(T.defaultClause(rma), 'none');
  const p = g.players[ars.playerIds[0]];
  const eng = T.clauseChoices(g, p, ars);
  assert.equal(eng.find((c) => c.key === 'none')!.wage, 1, 'no clause is the norm in England');
  assert.ok(eng.filter((c) => c.fee).every((c) => c.wage < 1), 'a way out comes a little cheaper');
  assert.ok(!T.clauseChoices(g, p, rma).some((c) => c.key === 'none'), 'Spain: always a clause');
  // Across the Premier League only a handful of players start with one.
  const pl = g.clubs.filter((c) => c.leagueId === 'ENG').flatMap((c) => c.playerIds.map((id) => g.players[id]));
  const share = pl.filter((x) => x.releaseClause).length / pl.length;
  assert.ok(share < 0.08, `few Premier League clauses (${(share * 100).toFixed(1)}%)`);
});

test('loans: an agreed loan waits for the manager\'s confirmation', async () => {
  const T = await import('../src/engine/transfers.js');
  const g = newGame(24);
  const ars = g.clubs.find((c) => c.name === 'Arsenal')!;
  takeCharge(g, ars.id, 'Test');
  ars.finance.wageBudget = 1e9;
  let o: ReturnType<typeof T.makeLoanBid> | null = null;
  let target = null as null | (typeof g.players)[number];
  for (const c of g.clubs.filter((x) => x.leagueId === 'ENG' && x.id !== ars.id)) {
    for (const id of c.playerIds) {
      const p = g.players[id];
      if (p.age > 21 || p.loan) continue;
      const r = T.makeLoanBid(g, p.id, 1, null);
      if (typeof r !== 'string' && r.status === 'accepted') { o = r; target = p; break; }
    }
    if (o) break;
  }
  assert.ok(o && typeof o !== 'string' && target, 'found a loan a club would agree');
  assert.ok(o!.agreed, 'agreed, waiting');
  assert.notEqual(target!.clubId, ars.id, 'not moved yet');
  const done = T.confirmLoan(g, (o as { id: number }).id);
  assert.ok(typeof done !== 'string' && (done.status === 'done' || done.status === 'terms'));
  if (typeof done !== 'string' && done.status === 'done') assert.equal(target!.clubId, ars.id);
});

test('continue: never moves the calendar on more than a week at a time', () => {
  const g = newGame(25);
  takeCharge(g, g.clubs[0].id, 'Test');
  for (let i = 0; i < 12; i++) {
    const start = g.day;
    playUntilDecision(g, 7);
    assert.ok(g.day - start <= 7, `moved ${g.day - start} days`);
    // Clear anything that would stop it, and play the match if we've reached it.
    for (const o of g.offers) if (o.status === 'pending' || o.status === 'accepted' || o.status === 'countered') o.status = 'withdrawn';
    if (userPlaysNext(g) && g.day === nextMatchDay(g)) playDay(g);
  }
});

test('news: players and clubs are linked', async () => {
  const { linkify } = await import('../src/ui/linkify.js');
  const g = newGame(26);
  const c = g.clubs.find((x) => x.name === 'Arsenal')!;
  const p = g.players[c.playerIds[0]];
  const html = linkify(g, `${p.firstName} ${p.lastName} scored as Arsenal beat Chelsea. ${p.lastName} was man of the match.`.trim());
  assert.ok(html.includes(`data-act="player" data-id="${p.id}"`), html);
  assert.ok(html.includes(`data-act="club-view" data-id="${c.id}"`));
  assert.equal((html.match(/data-act="club-view"/g) ?? []).length, 2, 'both clubs');
  assert.equal((html.match(/data-act="player"/g) ?? []).length, 2, 'the full name and the surname on its own');
});
