import { roundOut } from './attributes.js';
import { assistantName } from './analysis.js';
import { initAssistant } from './staff.js';
import { initClubFinance, initContract } from './finance.js';
import { KICKOFFS } from './fixtures.js';
import { SAVE_VERSION } from './generate.js';
import { CONFIRM_AHEAD, confirmKickoffs } from './kickoffs.js';
import { Rng } from './rng.js';
import { initScouting } from './scouting.js';
import { EXT_BASE } from './ext.js';
import { initIntl } from './intl.js';
import type { GameState } from './types.js';

/**
 * Bring an older save up to date, or return null if it's too old to use.
 * v3 → v4: benches, kick-off times and TV picks.
 * v4 → v5: contracts, wages and club finances (accounts start from the day of the upgrade).
 * v5 → v6: scouting. v6 → v7: cups and European competitions (from the next season).
 * v7 → v8: internationals (the rest of this season's calendar).
 * v8 → v9: bans and yellow cards per competition. v11 → v12: training. v12 → v13: the lower leagues (built at the next season rollover).
 * v14 → v15: minutes played, rounded regens. v15 → v16: the assistant manager's ratings.
 */
export function migrateSave(raw: unknown): GameState | null {
  const g = raw as GameState & { version: number };
  if (!g || typeof g !== 'object') return null;
  if (g.version === 3) {
    for (const c of g.clubs) c.bench ??= null;
    for (const f of g.fixtures) {
      const base = KICKOFFS[f.comp]?.base ?? [0, '15:00'];
      f.weekend ??= f.day;
      f.time ??= base[1];
      // Played games keep their date; the rest are confirmed by the TV picks as the season goes on.
      f.tbc ??= !f.result;
    }
    const rng = new Rng(g.rngState);
    confirmKickoffs(g, rng, g.day + CONFIRM_AHEAD);
    g.rngState = rng.state;
    g.version = 4;
  }
  if (g.version === 4) {
    const rng = new Rng(g.rngState ^ 0x5eed);
    g.offers ??= [];
    g.transfers ??= [];
    g.nextOfferId ??= 1;
    for (const c of g.clubs) {
      for (const id of c.playerIds) initContract(rng, g.players[id], g.season, c.leagueId);
      initClubFinance(rng, g, c);
    }
    for (const p of Object.values(g.players)) if (p.wage === undefined) delete g.players[p.id];
    g.version = 5;
  }
  if (g.version === 5) {
    for (const c of g.clubs) {
      c.finance.ledger.scouting ??= 0;
      if (c.finance.lastLedger) c.finance.lastLedger.scouting ??= 0;
    }
    const rng = new Rng(g.rngState ^ 0x5c0);
    initScouting(g, rng);
    g.version = 6;
  }
  if (g.version === 6) {
    // Cups start from next season for games already under way.
    g.cups ??= [];
    g.nextTieId ??= 1;
    g.extClubs ??= [];
    g.nextExtId ??= EXT_BASE + 1;
    g.version = 7;
  }
  if (g.version === 7) {
    // Internationals: the rest of this season's calendar.
    const rng = new Rng(g.rngState ^ 0x1a7);
    initIntl(g, rng);
    g.intl.matches = g.intl.matches.filter((m) => m.day > g.day + 6);
    g.version = 8;
  }
  if (g.version === 8) {
    // Bans and bookings per competition: what a player carried over counts towards the league.
    const leagueOf = new Map(g.clubs.map((c) => [c.id, c.leagueId]));
    for (const p of Object.values(g.players)) {
      const lg = (p.clubId != null ? leagueOf.get(p.clubId) : undefined) ?? 'ENG';
      p.bans = p.suspended > 0 ? { [lg]: p.suspended } : {};
      p.ycs = p.stats.yellow > 0 ? { [lg]: p.stats.yellow } : {};
    }
    g.version = 9;
  }
  if (g.version === 9) {
    g.board = { confidence: 60, warnings: 0, lastWarnDay: -999, sacked: null };
    g.version = 10;
  }
  if (g.version === 10) {
    // Injuries already on the list don't suddenly demand an answer.
    for (const p of Object.values(g.players)) if (p.injury) p.injury.seen = true;
    g.version = 11;
  }
  if (g.version === 11) {
    // Training: the current season's pre-season is behind you.
    for (const c of g.clubs) if (c.id === g.userClubId) c.training = { workload: 'normal', focus: 'balanced', camp: 'home', confirmed: g.season, fam: { [c.tactics.formation]: 75 }, drills: { passing: 50, pressing: 50, counter: 50, offside: 50, tackling: 50 } };
    g.version = 12;
  }
  if (g.version === 12) {
    // The lower leagues: an old world has only the six top divisions. The English pyramid is
    // built when this season ends (see startNewSeason), so all that is needed now is a home for it.
    g.movements ??= [];
    g.version = 13;
  }
  if (g.version === 13) {
    // One non-league pool per country: the English one moves from `nonLeague` to `pools.ENG`.
    const old = g as unknown as { nonLeague?: NonNullable<GameState['pools']>[string] };
    g.pools ??= {};
    if (old.nonLeague) g.pools.ENG = old.nonLeague;
    delete old.nonLeague;
    g.version = 14;
  }
  if (g.version === 14) {
    // Minutes played weren't counted before: estimate this season's so far, so per-90 figures make sense at once.
    // Regens grown under the old development rules could be all 20s and 2s: round them out, same ability.
    const rr = new Rng((g.rngState ?? 1) ^ 0x7e9e);
    for (const p of Object.values(g.players)) {
      for (const st of [p.stats, p.lstats]) if (st && st.mins === undefined) st.mins = st.apps * 86 + st.subApps * 22;
      roundOut(rr, p);
    }
    g.version = 15;
  }
  if (g.version === 15) {
    // Assistant managers with ratings: the manager's assistant keeps the name he has always had.
    const me = g.clubs[g.userClubId - 1];
    if (me && !me.assistant) initAssistant(g, new Rng((g.rngState ?? 1) ^ 0xa551), assistantName(g, me));
    g.version = 16;
  }
  return g.version === SAVE_VERSION ? g : null;
}
