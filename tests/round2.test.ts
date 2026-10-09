/**
 * Round 2: rounded regens, minutes played, and (as they arrive) the other round 2 features.
 * Run with:  npx tsx --test tests/round2.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attributeSpread, computeCA, roundOut, shiftAbility } from '../src/engine/attributes.js';
import { playDay, takeCharge } from '../src/engine/game.js';
import { createPlayer, newGame } from '../src/engine/generate.js';
import { migrateSave } from '../src/engine/migrate.js';
import { Rng } from '../src/engine/rng.js';
import type { Pos } from '../src/engine/types.js';

test('regens grow into rounded players, like the real ones', () => {
  const rng = new Rng(11);
  const state = { nextPlayerId: 700000 };
  const POS: Pos[] = ['DC', 'DR', 'DM', 'MC', 'MR', 'AMC', 'AML', 'ST'];
  const top = [];
  for (let i = 0; i < 160; i++) {
    const p = createPlayer(rng, state, { pos: POS[i % POS.length], ca: 65 + rng.int(0, 25), pa: 160 + rng.int(0, 30), age: 16, clubId: 1, nation: 'ENG' });
    for (let age = 16; age < 26; age++) {
      for (let m = 0; m < 10; m++) {
        const raw = ((p.pa - p.ca) * (age <= 20 ? 0.39 : 0.3)) / 10;
        const d = Math.trunc(raw) + (rng.chance(raw - Math.trunc(raw)) ? 1 : 0);
        if (d) shiftAbility(rng, p, d);
      }
      p.age++;
    }
    if (p.ca >= 150) top.push(p);
  }
  assert.ok(top.length > 60, `enough regens reach the top (${top.length})`);
  const spread = top.reduce((s, p) => s + attributeSpread(p), 0) / top.length;
  assert.ok(spread < 3.6, `spread like real players (${spread.toFixed(2)})`);
  const slow = top.filter((p) => Math.min(p.attrs.pace, p.attrs.acceleration) <= 6).length;
  assert.ok(slow / top.length < 0.05, `hardly any top regen has single-figure pace and acceleration (${slow})`);
  const real = Object.values(newGame(7).players).filter((p) => p.ca >= 150 && (p.pos.GK ?? 0) < 15);
  const realSpread = real.reduce((s, p) => s + attributeSpread(p), 0) / real.length;
  assert.ok(Math.abs(spread - realSpread) < 0.6, `close to real players (${spread.toFixed(2)} v ${realSpread.toFixed(2)})`);
});

test('lopsided players from old saves are rounded out at the same ability; normal players are left alone', () => {
  const rng = new Rng(5);
  const p = createPlayer(rng, { nextPlayerId: 9 }, { pos: 'DC', ca: 150, pa: 160, age: 25, clubId: 1, nation: 'ENG' });
  const normal = { ...p.attrs };
  assert.equal(roundOut(rng, p), false, 'a normally generated player is untouched');
  assert.deepEqual(p.attrs, normal);
  Object.assign(p.attrs, { acceleration: 8, agility: 4, technique: 3, setPieces: 2, longShots: 4, offTheBall: 5, pace: 20, positioning: 20, tackling: 20, heading: 19, marking: 19, creativity: 7, teamwork: 7, dribbling: 7, finishing: 7 });
  p.ca = computeCA(p);
  const ca = p.ca;
  assert.ok(attributeSpread(p) > 4.2);
  assert.equal(roundOut(rng, p), true);
  assert.equal(p.ca, ca, 'same overall ability');
  assert.ok(attributeSpread(p) < 4, `rounded (${attributeSpread(p).toFixed(2)})`);
  assert.ok(p.attrs.tackling >= 16 && p.attrs.technique >= 8, 'still a defender, no longer a one-trick one');
});

test('minutes played are counted, and old saves get an estimate', () => {
  const g = newGame(3);
  takeCharge(g, g.clubs[0].id, 'Test');
  for (let i = 0; i < 40 && !Object.values(g.players).some((p) => p.stats.apps > 2); i++) playDay(g);
  const played = Object.values(g.players).filter((p) => p.stats.apps + p.stats.subApps > 0);
  assert.ok(played.length > 100);
  for (const p of played) {
    assert.ok((p.stats.mins ?? 0) >= p.stats.apps + p.stats.subApps, `${p.lastName} has minutes`);
    assert.ok((p.stats.mins ?? 0) <= (p.stats.apps + p.stats.subApps) * 120, `${p.lastName} no more than a full game each`);
  }
  const old = JSON.parse(JSON.stringify(g));
  old.version = 14;
  for (const p of Object.values(old.players) as { stats: { mins?: number } }[]) delete p.stats.mins;
  const m = migrateSave(old)!;
  const someone = Object.values(m.players).find((p) => p.stats.apps > 0)!;
  assert.ok((someone.stats.mins ?? 0) > 0, 'estimated');
});
