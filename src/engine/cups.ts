/**
 * Domestic cups and the three UEFA competitions.
 *
 * A Cup is a list of rounds (dates, extra-time rule, who hosts) and the ties drawn so far.
 * Ties become fixtures once both clubs are known: straight away for a draw, or when the
 * earlier ties of a fixed bracket (Coppa Italia, UEFA knockouts) are decided. The UEFA
 * competitions start with a 36-club league phase; the table then sends the top eight to the
 * round of 16 and 9th to 24th into the knockout play-offs.
 *
 * 2026/27 uses the real draws and pairings; later seasons draw their own from the tables.
 */
import { seasonDay, weekday } from './calendar.js';
import { ALIASES, DOMESTIC_2026, EURO_2026, LOWER, type DomCupDef, type DomRoundDef, type Draw, type EuroDef } from './db/cups-2026.js';
import { clubLevel, extRows, findClubByName, isExtId, makeExtClub, strength } from './ext.js';
import { leagueCountry, tierOf } from './pyramid.js';
import { MIDWEEK } from './fixtures.js';
import { windows } from './intl.js';
import { Rng } from './rng.js';
import type { Club, Cup, CupRound, Fixture, GameState, MatchSummary, Tie } from './types.js';

/** Prize money in the data is in euros except the English cups. */
const EUR = 0.86;

/** Capacities of the neutral venues, for attendances. */
export const VENUES: Record<string, number> = {
  'Wembley Stadium': 90_000, 'Estadio de La Cartuja, Seville': 70_000, 'Olympiastadion, Berlin': 74_475, 'Stadio Olimpico, Rome': 70_634,
  'Stade de France, Saint-Denis': 80_698, 'Estádio Municipal de Coimbra': 29_622, 'Estádio Nacional, Oeiras': 37_593,
  'Estádio Dr. Magalhães Pessoa, Leiria': 23_888, 'Estadio Metropolitano, Madrid': 70_460, 'Stadion Frankfurt': 51_500,
  'Beşiktaş Stadium, Istanbul': 42_590,
};

/** Places in next season's UEFA competitions from each league's table (UCL, UEL, UECL). */
export const EURO_PLACES: Record<string, { ucl: number; uel: number; uecl: number; cup: string }> = {
  ENG: { ucl: 4, uel: 1, uecl: 2, cup: 'FAC' },
  ESP: { ucl: 4, uel: 1, uecl: 2, cup: 'CDR' },
  GER: { ucl: 4, uel: 1, uecl: 1, cup: 'DFB' },
  ITA: { ucl: 4, uel: 1, uecl: 2, cup: 'CIT' },
  FRA: { ucl: 3, uel: 1, uecl: 1, cup: 'CDF' },
  POR: { ucl: 2, uel: 1, uecl: 1, cup: 'TDP' },
};

const canonical = (name: string, state?: GameState) => {
  const n = ALIASES[name] ?? name;
  return state?.scenario?.replaced[n] ?? n;
};

/** Find a club by its name in the sources, bringing in an outside club if needed. */
export function resolveClub(state: GameState, name: string): Club | null {
  const n = canonical(name, state);
  if (state.scenario?.gone.includes(n)) return null;
  const c = findClubByName(state, n);
  if (c) return c;
  const row = extRows().get(n);
  return row ? makeExtClub(state, row) : null;
}

export const cupById = (state: GameState, id: string): Cup | undefined => state.cups.find((c) => c.id === id);

export const isCupComp = (state: GameState, compId: string): boolean => state.cups.some((c) => c.id === compId);

/** Display name of any competition (league or cup). */
export function compName(state: GameState, compId: string): string {
  if (compId === 'FRI') return 'Friendly';
  return state.comps.find((c) => c.id === compId)?.name ?? cupById(state, compId)?.name ?? compId;
}

function tieOf(state: GameState, f: Fixture): { cup: Cup; tie: Tie } | null {
  if (f.tieId === undefined) return null;
  const cup = cupById(state, f.comp);
  const tie = cup?.ties.find((t) => t.id === f.tieId);
  return cup && tie ? { cup, tie } : null;
}

/** "FA Cup third round", "Champions League league phase, matchday 3", "Europa League semi-final, first leg". */
export function stageLabel(state: GameState, f: Fixture): string {
  const cup = cupById(state, f.comp);
  if (!cup) return `${compName(state, f.comp)} matchday ${f.round + 1}`;
  if (f.tieId === undefined) return `${cup.name} league phase, matchday ${f.round + 1}`;
  const r = cup.rounds[f.round];
  const round = r.name.replace(/s$/, '').replace(/-finals?$/, '-final').replace('Round of', 'round of');
  const rn = /^(Final|Semi|Quarter)/.test(r.name) ? round.toLowerCase() : round.charAt(0).toLowerCase() + round.slice(1);
  return `${cup.name} ${rn}${r.days.length > 1 ? `, ${f.leg === 2 ? 'second' : 'first'} leg` : ''}`;
}

/* ───────────────────────── Money ───────────────────────── */

function pay(state: GameState, clubId: number, amount: number): void {
  if (isExtId(clubId) || amount <= 0) return;
  const c = state.clubs.find((x) => x.id === clubId);
  if (!c) return;
  c.finance.ledger.prize += amount;
  c.finance.balance += amount;
}

/* ───────────────────────── Fixtures ───────────────────────── */

function nextFixtureId(state: GameState): number {
  let max = 0;
  for (const f of state.fixtures) if (f.id > max) max = f.id;
  return max + 1;
}

/** Order a tie's clubs by the round's hosting rule before its fixtures are made. */
function applyHost(rng: Rng, round: CupRound, tie: Tie, byId: (id: number) => Club): void {
  if (tie.homeId === null || tie.awayId === null) return;
  const h = byId(tie.homeId);
  const a = byId(tie.awayId);
  let swap = false;
  if (round.host === 'lower') swap = clubLevel(a) > clubLevel(h);
  else if (round.host === 'seed') swap = strength(a) > strength(h) + 0.3;
  else if (round.host === 'drawn' && tie.fromHome !== undefined) swap = rng.chance(0.5);
  if (swap) [tie.homeId, tie.awayId] = [tie.awayId, tie.homeId];
}

/** Make a tie's fixtures (one match, or two legs). Returns them. */
export function makeTieFixtures(state: GameState, cup: Cup, r: number, tie: Tie): Fixture[] {
  if (tie.homeId === null || tie.awayId === null || tie.fixtureIds.length) return [];
  const round = cup.rounds[r];
  const out: Fixture[] = [];
  let id = nextFixtureId(state);
  round.days.forEach((day, i) => {
    const leg = round.days.length > 1 ? ((i + 1) as 1 | 2) : undefined;
    const [homeId, awayId] = i === 0 ? [tie.homeId!, tie.awayId!] : [tie.awayId!, tie.homeId!];
    const times = round.time.split('/');
    const f: Fixture = {
      id: id++, comp: cup.id, round: r, weekend: day, day, time: times[i % times.length], tbc: false, homeId, awayId, result: null, tieId: tie.id, leg,
    };
    if (round.host === 'neutral' && round.venue) f.neutral = round.venue;
    out.push(f);
  });
  state.fixtures.push(...out);
  tie.fixtureIds = out.map((f) => f.id);
  if (cup.kind === 'euro' && round.prize) {
    pay(state, tie.homeId, round.prize);
    pay(state, tie.awayId, round.prize);
  }
  return out;
}

/* ───────────────────────── Entrants ───────────────────────── */

interface BuildCtx {
  rng: Rng;
  /** Clubs in this season's UEFA competitions. */
  europe: Set<number>;
  /** Clubs already in this cup, and names kept for a later round. */
  used: Set<number>;
  reserved: Set<string>;
}

function leagueOrder(state: GameState, leagueId: string): Club[] {
  const ids = state.lastRanks?.[leagueId];
  const comp = state.comps.find((c) => c.id === leagueId);
  if (!comp) return [];
  const clubs = comp.clubIds.map((id) => state.clubs.find((c) => c.id === id)!);
  if (ids?.length) {
    const pos = new Map(ids.map((id, i) => [id, i]));
    return clubs.sort((a, b) => (pos.get(a.id) ?? 99) - (pos.get(b.id) ?? 99) || b.reputation - a.reputation);
  }
  return clubs.sort((a, b) => b.reputation - a.reputation);
}

/** Pick `n` lower-division clubs: the strongest mostly, the rest by luck of the earlier rounds. */
function pickLower(state: GameState, rng: Rng, country: string, n: number, used: Set<number>, reserved: Set<string>): Club[] {
  // Candidates: the country's played lower divisions (real clubs, by their current standing) and the
  // clubs of its lower database rows that aren't in a played division (outside clubs, by listed level).
  const real = state.comps
    .filter((c) => leagueCountry(c.id) === country && tierOf(c.id) > 1)
    .flatMap((c) => c.clubIds.map((id) => state.clubs.find((x) => x.id === id)!))
    .filter((c) => !used.has(c.id) && !reserved.has(c.name) && !state.scenario?.gone.includes(c.name));
  const seen = new Set(real.map((c) => c.name));
  const outside = (LOWER[country] ?? []).filter((r) => {
    if (seen.has(r[0]) || reserved.has(r[0]) || state.scenario?.gone.includes(r[0])) return false;
    const c = findClubByName(state, r[0]);
    // A club that has since moved up to a top flight is not a lower-division side any more.
    return !c || (!used.has(c.id) && tierOf(c.leagueId) > 1);
  });
  const cands: { name: string; rep: number; club?: Club }[] = [
    ...real.map((c) => ({ name: c.name, rep: c.reputation, club: c })),
    ...outside.map((r) => ({ name: r[0], rep: findClubByName(state, r[0])?.reputation ?? r[3] })),
  ];
  const sorted = cands.sort((a, b) => b.rep - a.rep);
  const sure = Math.round(n * 0.6);
  const chosen = sorted.slice(0, sure);
  const rest = rng.shuffle(sorted.slice(sure));
  chosen.push(...rest.slice(0, n - chosen.length));
  return chosen.map((x) => x.club ?? resolveClub(state, x.name)!).filter(Boolean);
}

function entrantsFor(state: GameState, def: DomCupDef, rd: DomRoundDef, ctx: BuildCtx): Club[] {
  const out: Club[] = [];
  const add = (c: Club | null | undefined) => {
    if (c && !ctx.used.has(c.id)) {
      ctx.used.add(c.id);
      out.push(c);
    }
  };
  const order = leagueOrder(state, def.country);
  const e = rd.enter;
  if (Array.isArray(e)) for (const n of e) add(resolveClub(state, n));
  else if (e === 'top') order.forEach(add);
  else if (e === 'top+c') {
    order.forEach(add);
    (state.comps.find((c) => c.id === 'EN2')?.clubIds ?? []).forEach((id) => add(state.clubs.find((c) => c.id === id)));
  } else if (e === 'efl') {
    for (const id of ['EN2', 'EN3', 'EN4']) (state.comps.find((c) => c.id === id)?.clubIds ?? []).forEach((cid) => add(state.clubs.find((c) => c.id === cid)));
  }
  else if (e === 'top-home') order.filter((c) => !ctx.europe.has(c.id)).forEach(add);
  else if (e === 'top-euro') order.filter((c) => ctx.europe.has(c.id)).forEach(add);
  else if (typeof e === 'string' && e.startsWith('rank:')) {
    const [a, b] = e.slice(5).split('-').map(Number);
    order.slice(a - 1, b).forEach(add);
  } else if (e === 'super' || e === 'top-nosuper') {
    const sup = supercopa(state, order);
    if (e === 'super') sup.forEach(add);
    else order.filter((c) => !sup.includes(c)).forEach(add);
  }
  if (rd.lower) pickLower(state, ctx.rng, def.country, rd.lower, ctx.used, ctx.reserved).forEach(add);
  return out;
}

/** The four clubs that skip the early Copa del Rey rounds: last season's top two and the cup finalists. */
function supercopa(state: GameState, order: Club[]): Club[] {
  const fin = (state.lastRanks?.['CDR-final'] ?? []).map((id) => order.find((c) => c.id === id)).filter((c): c is Club => !!c);
  const out = [...fin];
  for (const c of order) {
    if (out.length >= 4) break;
    if (!out.includes(c)) out.push(c);
  }
  return out.slice(0, 4);
}

/** Later seasons: the same cups, drawn from the tables instead of the real 2026/27 pairings. */
function domesticDef(def: DomCupDef, season: number): DomCupDef {
  if (season === 2026) return def;
  const r = def.rounds.map((x) => ({ ...x, pairs: undefined, bracket: undefined }));
  switch (def.id) {
    case 'CDR':
      r[0].enter = 'top-nosuper';
      r[1].enter = 'super';
      break;
    case 'DFB':
      r[0].enter = 'top';
      r[0].lower = 46;
      break;
    case 'CIT':
      r[0].enter = [];
      r[0].lower = 8;
      r[1].enter = 'rank:9-20';
      r[1].lower = 16;
      r[3].enter = 'rank:1-8';
      break;
    case 'TDP':
      r[1].enter = 'top-euro';
      break;
    case 'TDL':
      r[0].enter = 'rank:1-8';
      break;
  }
  return { ...def, rounds: r };
}

/* ───────────────────────── Building a season's cups ───────────────────────── */

export function newTie(state: GameState, cup: Cup, round: number, homeId: number | null, awayId: number | null): Tie {
  const t: Tie = { id: state.nextTieId++, round, homeId, awayId, fixtureIds: [], winnerId: null };
  cup.ties.push(t);
  return t;
}

function buildDomestic(state: GameState, defIn: DomCupDef, ctx: BuildCtx): Cup {
  const def = domesticDef(defIn, state.season);
  const cur = def.country === 'ENG' ? 1 : EUR;
  const cup: Cup = {
    id: def.id, name: def.name, short: def.short, kind: 'cup', country: def.country, rounds: [], ties: [], drawn: 0, winnerId: null,
    winnerPrize: def.winner * cur, runnerUpPrize: def.runnerUp * cur,
  };
  ctx.used = new Set();
  ctx.reserved = new Set();
  for (const rd of def.rounds) {
    if (Array.isArray(rd.enter)) for (const n of rd.enter) ctx.reserved.add(canonical(n));
    for (const p of rd.pairs ?? []) for (const n of p) ctx.reserved.add(canonical(n));
  }
  // Clubs joining by name or table first; then the lower-division clubs. When clubs also join
  // at the second round, the first round takes enough lower clubs to make the numbers work.
  const direct = def.rounds.map((rd) => (rd.pairs ? [] : entrantsFor(state, def, { ...rd, lower: 0 }, ctx)));
  const lowerCount = def.rounds.map((rd) => rd.lower ?? 0);
  if (lowerCount[0] && direct[1]?.length && !def.rounds[1].pairs && !def.rounds[1].bracket) {
    const target = 2 ** (def.rounds.length - 1);
    lowerCount[0] = Math.max(0, 2 * (target - direct[1].length) - direct[0].length);
  }
  def.rounds.forEach((rd, r) => {
    const days = rd.dates.map((d) => seasonDay(d, state.season));
    const entrants = rd.pairs ? [] : [...direct[r], ...(lowerCount[r] ? pickLower(state, ctx.rng, def.country, lowerCount[r], ctx.used, ctx.reserved) : [])];
    for (const c of entrants) ctx.used.add(c.id);
    cup.rounds.push({
      name: rd.name, days, time: rd.time, extraTime: rd.et, entrants: entrants.map((c) => c.id), host: rd.host, venue: rd.venue, prize: rd.prize * cur,
    });
    const prev = cup.ties.filter((t) => t.round === r - 1);
    if (rd.pairs) {
      for (const [h, a] of rd.pairs) {
        const ref = (n: string) => (n.startsWith('#') ? { from: prev[Number(n.slice(1))].id } : { club: resolveClub(state, n) });
        const H = ref(h);
        const A = ref(a);
        const t = newTie(state, cup, r, H.club?.id ?? null, A.club?.id ?? null);
        if (H.from !== undefined) t.fromHome = H.from;
        if (A.from !== undefined) t.fromAway = A.from;
        for (const x of [H.club, A.club]) if (x) ctx.used.add(x.id);
        if ((H.club === null && H.from === undefined) || (A.club === null && A.from === undefined)) console.warn(`cups: unknown club in ${def.id} ${h} v ${a}`);
      }
    } else if (rd.bracket) {
      for (const [x, y] of rd.bracket) {
        const home = typeof x === 'string' ? resolveClub(state, x) : null;
        const t = newTie(state, cup, r, home?.id ?? null, null);
        if (typeof x === 'number') t.fromHome = prev[x].id;
        t.fromAway = prev[y].id;
        if (home) ctx.used.add(home.id);
      }
    }
  });
  if (!def.rounds.some((rd) => rd.pairs || rd.bracket)) balanceEntries(state, cup);
  // Rounds with ties ready (real pairings) count as drawn; the first open round is drawn now.
  while (cup.drawn < cup.rounds.length && cup.ties.some((t) => t.round === cup.drawn)) cup.drawn++;
  // Real pairings keep their home sides.
  for (const t of cup.ties) if (t.homeId !== null && t.awayId !== null) makeTieFixtures(state, cup, t.round, t);
  if (cup.drawn === 0) drawRound(state, ctx.rng, cup, 0);
  return cup;
}

function clubById(state: GameState, id: number): Club {
  return (isExtId(id) ? state.extClubs.find((c) => c.id === id) : state.clubs.find((c) => c.id === id))!;
}

/** Draw a round: last round's winners plus the clubs joining now, paired at random. */
/**
 * How many clubs should be left after each round so that, once the last clubs have joined,
 * every round halves the field exactly down to two finalists: need[r] is the field the
 * draw of round r should leave for round r + 1 (survivors plus clubs joining then).
 */
function fieldTargets(cup: Cup): number[] {
  const n = cup.rounds.length;
  const field = new Array<number>(n).fill(0);
  field[n - 1] = 2;
  for (let r = n - 2; r >= 0; r--) field[r] = 2 * Math.max(1, field[r + 1] - cup.rounds[r + 1].entrants.length);
  return field;
}

/**
 * Make the entry numbers work before anything is drawn, so that no round ever needs a bye:
 * every round's field is even and halves exactly into the next. With E[r] clubs joining at
 * round r of n, that needs sum(E[r] * 2^r) = 2^n. Too many, and the weakest clubs due to join
 * a round start one round earlier; too few, and the strongest clubs of a round join one round
 * later instead (as the real cups exempt their bigger clubs from the early rounds).
 */
function balanceEntries(state: GameState, cup: Cup): void {
  const n = cup.rounds.length;
  const rep = (id: number) => clubById(state, id)?.reputation ?? 0;
  const E = () => cup.rounds.map((r) => r.entrants);
  const weight = () => E().reduce((s, e, r) => s + e.length * 2 ** r, 0);
  const moveDown = (r: number): boolean => { // weakest of round r + 1 into round r: -2^r
    const next = cup.rounds[r + 1]?.entrants;
    if (!next?.length) return false;
    const id = [...next].sort((a, b) => rep(a) - rep(b))[0];
    cup.rounds[r + 1].entrants = next.filter((x) => x !== id);
    cup.rounds[r].entrants.push(id);
    return true;
  };
  const moveUp = (r: number): boolean => { // strongest of round r into round r + 1: +2^r
    const cur = cup.rounds[r].entrants;
    if (r + 1 >= n - 1 || !cur.length) return false;
    const id = [...cur].sort((a, b) => rep(b) - rep(a))[0];
    cup.rounds[r].entrants = cur.filter((x) => x !== id);
    cup.rounds[r + 1].entrants.push(id);
    return true;
  };
  for (let guard = 0; guard < 400; guard++) {
    const diff = weight() - 2 ** n;
    if (!diff) break;
    const b = Math.log2(Math.abs(diff) & -Math.abs(diff)); // lowest set bit
    const ok = diff > 0
      ? moveDown(b) || (b > 0 && cup.rounds[b].entrants.length > 0 && moveDown(b - 1))
      : moveUp(b) || (b > 0 && moveUp(b - 1));
    if (!ok) break;
  }
}

function drawRound(state: GameState, rng: Rng, cup: Cup, r: number): Tie[] {
  const round = cup.rounds[r];
  const winners = cup.ties.filter((t) => t.round === r - 1 && t.winnerId !== null).map((t) => t.winnerId!);
  const joining = round.entrants.filter((id) => !winners.includes(id));
  const ties: Tie[] = [];
  if (round.host === 'seed' && joining.length && joining.length === winners.length) {
    // Seeds at home to the winners of the earlier rounds.
    const w = rng.shuffle([...winners]);
    joining.forEach((id, i) => ties.push(newTie(state, cup, r, id, w[i])));
  } else {
    const all = [...winners, ...joining];
    // Byes only where the numbers need them (so the rounds after the last clubs join are
    // exact halvings, and the final always has two clubs), given to the strongest clubs.
    const last = r === cup.rounds.length - 1;
    const survivors = last ? 1 : fieldTargets(cup)[r + 1] - cup.rounds[r + 1].entrants.length;
    let byes = last ? 0 : Math.max(0, Math.min(all.length, 2 * survivors - all.length));
    if ((all.length - byes) % 2) byes++;
    const rep = (id: number) => clubById(state, id)?.reputation ?? 0;
    const seeded = [...all].sort((a, b) => rep(b) - rep(a));
    const through = new Set(seeded.slice(0, byes));
    const pool = rng.shuffle(all.filter((id) => !through.has(id)));
    while (pool.length >= 2) ties.push(newTie(state, cup, r, pool.shift()!, pool.shift()!));
    for (const id of [...through, ...pool]) {
      const bye = newTie(state, cup, r, id, null);
      bye.winnerId = id;
    }
  }
  cup.drawn = Math.max(cup.drawn, r + 1);
  for (const t of ties) {
    applyHost(rng, round, t, (id) => clubById(state, id));
    makeTieFixtures(state, cup, r, t);
  }
  return ties;
}

/* ───────────────────────── UEFA ───────────────────────── */

/** League-phase games from a real draw: each club's home fixtures. */
function drawToMatches(state: GameState, draw: Draw): { clubs: Club[]; matches: [number, number][] } {
  const clubs: Club[] = [];
  const byName = new Map<string, Club>();
  for (const n of Object.keys(draw)) {
    const c = resolveClub(state, n);
    if (!c) {
      console.warn(`cups: unknown club ${n}`);
      continue;
    }
    byName.set(n, c);
    clubs.push(c);
  }
  const matches: [number, number][] = [];
  for (const [n, { h }] of Object.entries(draw)) {
    const home = byName.get(n);
    if (!home) continue;
    for (const o of h) {
      const away = byName.get(o) ?? resolveClub(state, o);
      if (away) matches.push([home.id, away.id]);
    }
  }
  return { clubs, matches };
}

/** A league-phase draw for later seasons: pots by strength, two opponents from each pot (one from each for 6 games). */
export function generatePhase(rng: Rng, clubs: Club[], games: number): [number, number][] {
  const sorted = [...clubs].sort((a, b) => strength(b) - strength(a));
  const country = (c: Club) => (c.external ? c.external.country : leagueCountry(c.leagueId));
  const pairs: [number, number][] = [];
  const size = games === 8 ? 9 : 6;
  const potCount = sorted.length / size;
  const pots = Array.from({ length: potCount }, (_, i) => sorted.slice(i * size, i * size + size));
  /** Try random arrangements until clubs from the same country are kept apart (then give up on that). */
  const attempt = (make: () => [Club, Club][]): void => {
    let best = make();
    for (let i = 0; i < 300 && best.some(([a, b]) => country(a) === country(b)); i++) best = make();
    for (const [a, b] of best) pairs.push([a.id, b.id]);
  };
  for (let i = 0; i < potCount; i++) {
    for (let j = i; j < potCount; j++) {
      const P = pots[i];
      const Q = pots[j];
      if (games === 8) {
        if (i === j) {
          // A random cycle through the pot: each club meets two others from its own pot.
          attempt(() => {
            const c = rng.shuffle([...P]);
            return c.map((x, k) => [x, c[(k + 1) % c.length]] as [Club, Club]);
          });
        } else {
          // Two different pairings with the other pot (a shuffle and a rotation of it).
          attempt(() => {
            const sq = rng.shuffle([...Q]);
            const shift = rng.int(1, size - 1);
            return P.flatMap((x, k) => [[x, sq[k]], [x, sq[(k + shift) % size]]] as [Club, Club][]);
          });
        }
      } else if (i === j) {
        attempt(() => {
          const c = rng.shuffle([...P]);
          return [0, 2, 4].map((k) => [c[k], c[k + 1]] as [Club, Club]);
        });
      } else {
        attempt(() => {
          const sq = rng.shuffle([...Q]);
          return P.map((x, k) => [x, sq[k]] as [Club, Club]);
        });
      }
    }
  }
  return orient(rng, pairs);
}

/** Give every club as many home as away games (an Euler tour of the even-degree graph). */
function orient(rng: Rng, pairsIn: [number, number][]): [number, number][] {
  const pairs = rng.shuffle([...pairsIn]);
  const adj = new Map<number, { to: number; e: number }[]>();
  pairs.forEach(([a, b], e) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, e });
    adj.get(b)!.push({ to: a, e });
  });
  const used = new Array(pairs.length).fill(false);
  const out: [number, number][] = [];
  for (const start of adj.keys()) {
    // Hierholzer: walk unused edges, orienting each in the direction walked.
    const stack = [start];
    while (stack.length) {
      const v = stack[stack.length - 1];
      const list = adj.get(v)!;
      const nextEdge = list.find((x) => !used[x.e]);
      if (!nextEdge) {
        stack.pop();
        continue;
      }
      used[nextEdge.e] = true;
      out.push([v, nextEdge.to]);
      stack.push(nextEdge.to);
    }
  }
  return out;
}

/**
 * Spread league-phase games over the matchdays so every club plays once per matchday
 * (a proper edge colouring, found with Kempe-chain swaps and random restarts).
 */
export function assignMatchdays(rng: Rng, matches: [number, number][], k: number): number[] {
  for (let attempt = 0; attempt < 60; attempt++) {
    const colour = new Array<number>(matches.length).fill(-1);
    const at = new Map<number, number[]>();
    const slots = (c: number) => {
      if (!at.has(c)) at.set(c, new Array(k).fill(-1));
      return at.get(c)!;
    };
    const set = (e: number, c: number) => {
      const [u, v] = matches[e];
      colour[e] = c;
      slots(u)[c] = e;
      slots(v)[c] = e;
    };
    const unset = (e: number) => {
      const [u, v] = matches[e];
      const c = colour[e];
      if (slots(u)[c] === e) slots(u)[c] = -1;
      if (slots(v)[c] === e) slots(v)[c] = -1;
      colour[e] = -1;
    };
    let failed = false;
    for (const e of rng.shuffle(matches.map((_, i) => i))) {
      const [u, v] = matches[e];
      const fu = slots(u).map((x, c) => (x === -1 ? c : -1)).filter((c) => c >= 0);
      const fv = slots(v).map((x, c) => (x === -1 ? c : -1)).filter((c) => c >= 0);
      const common = fu.filter((c) => fv.includes(c));
      if (common.length) {
        set(e, rng.pick(common));
        continue;
      }
      let placed = false;
      for (const a of rng.shuffle(fu)) {
        for (const b of rng.shuffle(fv)) {
          // Kempe chain from v alternating a, b; flipping it frees colour a at v unless it reaches u.
          const chain: number[] = [];
          let x = v;
          let col = a;
          let reachesU = false;
          for (;;) {
            const ed = slots(x)[col];
            if (ed === -1) break;
            chain.push(ed);
            const [p, q] = matches[ed];
            x = p === x ? q : p;
            if (x === u) {
              reachesU = true;
              break;
            }
            col = col === a ? b : a;
            if (chain.length > matches.length) break;
          }
          if (reachesU) continue;
          const flips = chain.map((ed) => [ed, colour[ed] === a ? b : a] as [number, number]);
          for (const [ed] of flips) unset(ed);
          for (const [ed, c] of flips) set(ed, c);
          set(e, a);
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) {
        failed = true;
        break;
      }
    }
    if (!failed) return colour;
  }
  // Very unlikely: fall back to the least crowded matchday.
  const count = new Map<string, number>();
  return matches.map(([u, v]) => {
    let best = 0;
    let bs = Infinity;
    for (let c = 0; c < k; c++) {
      const s = (count.get(`${u}:${c}`) ?? 0) + (count.get(`${v}:${c}`) ?? 0);
      if (s < bs) { bs = s; best = c; }
    }
    count.set(`${u}:${best}`, (count.get(`${u}:${best}`) ?? 0) + 1);
    count.set(`${v}:${best}`, (count.get(`${v}:${best}`) ?? 0) + 1);
    return best;
  });
}

function buildEuro(state: GameState, rng: Rng, def: EuroDef, entrants: Club[] | null): Cup {
  const s = state.season;
  const cur = EUR;
  const pz = def.prize;
  const cup: Cup = {
    id: def.id, name: def.name, short: def.short, kind: 'euro', country: 'EU', rounds: [], ties: [], drawn: 0, winnerId: null,
    phaseWin: pz.win * cur, phaseDraw: pz.draw * cur, winnerPrize: pz.winner * cur, runnerUpPrize: 0, phaseDone: false,
  };
  const koPrize = [pz.po, pz.r16, pz.qf, pz.sf, pz.final];
  def.ko.forEach(([name, dates], i) => {
    cup.rounds.push({ name, days: dates.map((d) => seasonDay(d, s)), time: '21:00', extraTime: true, entrants: [], host: i === 0 || i === 1 ? ('fixed' as CupRound['host']) : 'drawn', prize: koPrize[i] * cur });
  });
  cup.rounds.push({ name: 'Final', days: [seasonDay(def.final[0], s)], time: '21:00', extraTime: true, entrants: [], host: 'neutral', venue: def.final[1], prize: koPrize[4] * cur });

  const { clubs, matches } = entrants ? { clubs: entrants, matches: generatePhase(rng, entrants, def.phase.length) } : drawToMatches(state, def.draw);
  cup.phaseClubs = clubs.map((c) => c.id);
  cup.phaseDays = def.phase.map((days) => days.map((d) => seasonDay(d, s)));
  for (const c of clubs) pay(state, c.id, pz.participation * cur);

  const md = assignMatchdays(rng, matches, def.phase.length);
  let id = nextFixtureId(state);
  for (let m = 0; m < def.phase.length; m++) {
    const games = rng.shuffle(matches.filter((_, i) => md[i] === m));
    const days = cup.phaseDays[m];
    games.forEach(([homeId, awayId], i) => {
      const day = days[i % days.length];
      const nth = Math.floor(i / days.length);
      const early = def.id === 'UCL' ? nth < 2 : nth % 2 === 1;
      state.fixtures.push({ id: id++, comp: def.id, round: m, weekend: day, day, time: early ? def.time[0] : def.time[1], tbc: false, homeId, awayId, result: null });
    });
  }
  return cup;
}

export interface PhaseRow {
  clubId: number;
  p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number; awayGf: number; awayW: number;
}

/** League-phase table with UEFA's tie-breakers (goal difference, goals, away goals, wins, away wins). */
export function phaseTable(state: GameState, cup: Cup): PhaseRow[] {
  const rows = new Map<number, PhaseRow>();
  for (const id of cup.phaseClubs ?? []) rows.set(id, { clubId: id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, awayGf: 0, awayW: 0 });
  for (const f of state.fixtures) {
    if (f.comp !== cup.id || f.tieId !== undefined || !f.result) continue;
    const h = rows.get(f.homeId);
    const a = rows.get(f.awayId);
    if (!h || !a) continue;
    const r = f.result;
    h.p++; a.p++;
    h.gf += r.hg; h.ga += r.ag; a.gf += r.ag; a.ga += r.hg; a.awayGf += r.ag;
    if (r.hg > r.ag) { h.w++; a.l++; h.pts += 3; }
    else if (r.hg < r.ag) { a.w++; h.l++; a.pts += 3; a.awayW++; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  const list = [...rows.values()];
  for (const r of list) r.gd = r.gf - r.ga;
  const name = (id: number) => clubById(state, id)?.name ?? '';
  return list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || y.awayGf - x.awayGf || y.w - x.w || y.awayW - x.awayW || name(x.clubId).localeCompare(name(y.clubId)));
}

/** The league phase is over: build the knockout bracket from the table. */
function startKnockouts(state: GameState, rng: Rng, cup: Cup): Fixture[] {
  cup.phaseDone = true;
  const t = phaseTable(state, cup).map((r) => r.clubId);
  const pos = (n: number) => t[n - 1];
  const created: Fixture[] = [];
  // Play-offs: 9th–16th (second leg at home) against 17th–24th.
  const po: Tie[] = [];
  for (let s = 1; s <= 8; s++) po.push(newTie(state, cup, 0, pos(16 + s), pos(17 - s)));
  // Round of 16: the top eight, in bracket order so first and second can only meet in the final.
  const order = [1, 8, 4, 5, 2, 7, 3, 6];
  const r16 = order.map((s) => {
    const tie = newTie(state, cup, 1, null, pos(s));
    tie.fromHome = po[s - 1].id;
    return tie;
  });
  const qf = [0, 2, 4, 6].map((i) => {
    const tie = newTie(state, cup, 2, null, null);
    tie.fromHome = r16[i].id;
    tie.fromAway = r16[i + 1].id;
    return tie;
  });
  const sf = [0, 2].map((i) => {
    const tie = newTie(state, cup, 3, null, null);
    tie.fromHome = qf[i].id;
    tie.fromAway = qf[i + 1].id;
    return tie;
  });
  const fin = newTie(state, cup, 4, null, null);
  fin.fromHome = sf[0].id;
  fin.fromAway = sf[1].id;
  cup.drawn = cup.rounds.length;
  for (const tie of po) created.push(...makeTieFixtures(state, cup, 0, tie));
  void rng;
  return created;
}

/* ───────────────────────── Season set-up ───────────────────────── */

/** Next season's UEFA entrants, by name, from the final tables and this season's winners. */
export function europeanPlaces(state: GameState, tables: Record<string, number[]>): Record<string, string[]> {
  const out: Record<string, string[]> = { UCL: [], UEL: [], UECL: [] };
  const taken = new Set<string>();
  const put = (cup: 'UCL' | 'UEL' | 'UECL', c: Club | undefined) => {
    if (!c || taken.has(c.name)) return false;
    taken.add(c.name);
    out[cup].push(c.name);
    return true;
  };
  const winner = (id: string) => {
    const cup = cupById(state, id);
    return cup?.winnerId ? clubById(state, cup.winnerId) : undefined;
  };
  put('UCL', winner('UCL'));
  put('UCL', winner('UEL'));
  const club = (id: number) => state.clubs.find((c) => c.id === id);
  for (const [lg, places] of Object.entries(EURO_PLACES)) {
    const t = tables[lg] ?? [];
    let n = 0;
    for (const id of t) {
      if (n >= places.ucl) break;
      if (put('UCL', club(id))) n++;
    }
  }
  for (const [lg, places] of Object.entries(EURO_PLACES)) {
    const t = tables[lg] ?? [];
    put('UEL', winner(places.cup));
    let n = 0;
    for (const id of t) {
      if (n >= places.uel) break;
      if (put('UEL', club(id))) n++;
    }
  }
  for (const [lg, places] of Object.entries(EURO_PLACES)) {
    const t = tables[lg] ?? [];
    let n = 0;
    for (const id of t) {
      if (n >= places.uecl) break;
      if (put('UECL', club(id))) n++;
    }
  }
  return out;
}

/** Fill each UEFA competition to 36 with clubs from the rest of Europe, strongest to the Champions League. */
function fillFromEurope(state: GameState, rng: Rng, names: Record<string, string[]>): Record<string, Club[]> {
  const inUse = new Set(Object.values(names).flat());
  const foreign = [...extRows().values()].filter((r) => !LOWER[r.country] && !inUse.has(r.name))
    .map((r) => ({ r, k: r.tier + rng.normal() * 0.5 }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.r);
  const out: Record<string, Club[]> = {};
  const inCup = new Set<number>();
  for (const id of ['UCL', 'UEL', 'UECL']) {
    const list = names[id].map((n) => resolveClub(state, n)).filter((c): c is Club => !!c && !inCup.has(c.id));
    while (list.length < 36 && foreign.length) list.push(makeExtClub(state, foreign.shift()!));
    for (const c of list) inCup.add(c.id);
    out[id] = list;
  }
  // Not enough clubs from the rest of Europe: the next clubs in the six leagues' tables join the Conference League.
  const next = state.comps.filter((c) => tierOf(c.id) === 1).flatMap((c) => (state.lastRanks?.[c.id] ?? c.clubIds).map((id, i) => ({ id, i }))).sort((a, b) => a.i - b.i);
  for (const id of ['UECL', 'UEL', 'UCL']) {
    for (const x of next) {
      if (out[id].length >= 36) break;
      if (inCup.has(x.id)) continue;
      inCup.add(x.id);
      out[id].push(state.clubs.find((c) => c.id === x.id)!);
    }
    out[id] = out[id].slice(0, 36);
  }
  return out;
}

/** This season's cups: the UEFA competitions first (they decide who joins the domestic cups when). */
export function buildCups(state: GameState, rng: Rng): void {
  state.cups = [];
  let entrants: Record<string, Club[]> | null = null;
  if (state.season !== 2026 && state.europe) entrants = fillFromEurope(state, rng, state.europe);
  for (const def of EURO_2026) state.cups.push(buildEuro(state, rng, def, entrants?.[def.id] ?? null));
  const europe = new Set(state.cups.flatMap((c) => c.phaseClubs ?? []));
  const ctx: BuildCtx = { rng, europe, used: new Set(), reserved: new Set() };
  for (const def of DOMESTIC_2026) state.cups.push(buildDomestic(state, def, ctx));
  resolveClashes(state, state.fixtures.filter((f) => isCupComp(state, f.comp)));
}

/* ───────────────────────── Results ───────────────────────── */

/** Match rules for a cup fixture: extra time and penalties when it must be settled tonight. */
export function knockoutRules(state: GameState, f: Fixture): { extraTime: boolean; first?: [number, number] } | undefined {
  const x = tieOf(state, f);
  if (!x) return undefined;
  const round = x.cup.rounds[f.round];
  if (round.days.length > 1 && f.leg === 1) return undefined;
  if (f.leg === 2) {
    const first = state.fixtures.find((g) => g.id === x.tie.fixtureIds[0])?.result;
    if (!first) return { extraTime: round.extraTime };
    return { extraTime: round.extraTime, first: [first.ag, first.hg] };
  }
  return { extraTime: round.extraTime };
}

export function neutralVenue(f: Fixture): { venue: string; capacity: number } | undefined {
  return f.neutral ? { venue: f.neutral, capacity: VENUES[f.neutral] ?? 60_000 } : undefined;
}

/** Winner of a finished tie, or null while a leg is still to play. */
function tieWinner(state: GameState, tie: Tie): number | null {
  const fx = tie.fixtureIds.map((id) => state.fixtures.find((f) => f.id === id)!);
  if (!fx.length || fx.some((f) => !f.result)) return null;
  const last = fx[fx.length - 1].result!;
  let h = 0;
  let a = 0;
  for (const f of fx) {
    const r = f.result!;
    if (f.homeId === tie.homeId) { h += r.hg; a += r.ag; } else { h += r.ag; a += r.hg; }
  }
  if (h !== a) return h > a ? tie.homeId : tie.awayId;
  const lastF = fx[fx.length - 1];
  const p = last.pens ?? [0, 0];
  const lastHomeWon = p[0] > p[1];
  return lastHomeWon ? lastF.homeId : lastF.awayId;
}

export interface CupNews {
  kind: 'cup';
  title: string;
  body: string;
}

/** After a day's matches: settle ties, pay prize money, fill the bracket, draw the next rounds. */
export function cupsAfterDay(state: GameState, rng: Rng, played: Fixture[]): { news: CupNews[]; created: Fixture[] } {
  const news: CupNews[] = [];
  const created: Fixture[] = [];
  const me = state.userClubId;
  const name = (id: number) => clubById(state, id).name;
  for (const f of played) {
    const cup = cupById(state, f.comp);
    if (!cup || !f.result) continue;
    if (f.tieId === undefined) {
      // League phase: prize money per result.
      const r = f.result;
      if (r.hg > r.ag) pay(state, f.homeId, cup.phaseWin ?? 0);
      else if (r.ag > r.hg) pay(state, f.awayId, cup.phaseWin ?? 0);
      else {
        pay(state, f.homeId, cup.phaseDraw ?? 0);
        pay(state, f.awayId, cup.phaseDraw ?? 0);
      }
      continue;
    }
    const tie = cup.ties.find((t) => t.id === f.tieId)!;
    if (tie.winnerId !== null) continue;
    const w = tieWinner(state, tie);
    if (w === null) continue;
    tie.winnerId = w;
    const loser = w === tie.homeId ? tie.awayId! : tie.homeId!;
    const round = cup.rounds[tie.round];
    const isFinal = tie.round === cup.rounds.length - 1;
    if (cup.kind === 'cup' && !isFinal) pay(state, w, round.prize ?? 0);
    if (isFinal) {
      cup.winnerId = w;
      pay(state, w, cup.winnerPrize ?? 0);
      pay(state, loser, cup.runnerUpPrize ?? 0);
      const wc = clubById(state, w);
      if (!wc.external) (wc.honours ??= []).push({ season: state.season, cup: cup.name });
      const r = f.result;
      const how = r.pens ? ` on penalties (${Math.max(...r.pens)}-${Math.min(...r.pens)})` : r.aet ? ' after extra time' : '';
      news.push({
        kind: 'cup',
        title: w === me ? `${name(w)} win the ${cup.name}!` : `${name(w)} win the ${cup.name}`,
        body: `${name(w)} beat ${name(loser)} ${Math.max(r.hg, r.ag)}-${Math.min(r.hg, r.ag)}${how} in the ${cup.name} final${f.neutral ? ` at ${f.neutral}` : ''}.${w === me ? ' A trophy for the cabinet, and the board are thrilled.' : ''}`,
      });
    } else if (w === me || loser === me) {
      const next = cup.rounds[tie.round + 1];
      news.push(w === me
        ? { kind: 'cup', title: `Through to the ${cup.name} ${next.name.toLowerCase()}`, body: `${name(me)} knocked out ${name(loser)} and are into the ${next.name.toLowerCase()} of the ${cup.name}.` }
        : { kind: 'cup', title: `Out of the ${cup.name}`, body: `${name(me)} were knocked out of the ${cup.name} ${round.name.toLowerCase()} by ${name(w)}.` });
    }
    // Fill the next tie in a fixed bracket.
    for (const next of cup.ties) {
      let changed = false;
      if (next.fromHome === tie.id && next.homeId === null) { next.homeId = w; changed = true; }
      if (next.fromAway === tie.id && next.awayId === null) { next.awayId = w; changed = true; }
      if (changed && next.homeId !== null && next.awayId !== null) {
        applyHost(rng, cup.rounds[next.round], next, (id) => clubById(state, id));
        const fx = makeTieFixtures(state, cup, next.round, next);
        created.push(...fx);
        if (next.homeId === me || next.awayId === me) news.push(drawNews(state, cup, next));
      }
    }
    // A round finished: draw the next one (unless it's a fixed bracket).
    const r = tie.round;
    const done = cup.ties.filter((t) => t.round === r).every((t) => t.winnerId !== null);
    if (done && r + 1 < cup.rounds.length && !cup.ties.some((t) => t.round === r + 1)) {
      const ties = drawRound(state, rng, cup, r + 1);
      for (const t of ties) created.push(...state.fixtures.filter((x) => t.fixtureIds.includes(x.id)));
      const mine = ties.find((t) => t.homeId === me || t.awayId === me);
      if (mine) news.push(drawNews(state, cup, mine));
    }
  }
  // UEFA league phases that have just finished.
  for (const cup of state.cups) {
    if (cup.kind !== 'euro' || cup.phaseDone) continue;
    if (state.fixtures.some((f) => f.comp === cup.id && f.tieId === undefined && !f.result)) continue;
    if (!played.some((f) => f.comp === cup.id)) continue;
    created.push(...startKnockouts(state, rng, cup));
    const t = phaseTable(state, cup);
    const pos = t.findIndex((x) => x.clubId === me) + 1;
    if (pos > 0) {
      const text = pos <= 8 ? 'go straight into the round of 16' : pos <= 24 ? 'go into the knockout play-offs' : 'are out of Europe';
      const po = cup.ties.find((x) => x.round === 0 && (x.homeId === me || x.awayId === me));
      const opp = po ? name(po.homeId === me ? po.awayId! : po.homeId!) : '';
      news.push({
        kind: 'cup',
        title: `${cup.name}: ${ordinalWord(pos)} in the league phase`,
        body: `${name(me)} finished ${ordinalWord(pos)} of 36 and ${text}.${opp ? ` The play-off opponents are ${opp}.` : ''}`,
      });
    }
  }
  if (created.length) {
    resolveClashes(state, created, (lf, from) => {
      if (lf.homeId !== me && lf.awayId !== me) return;
      const d = (x: number) => new Date(Date.UTC(state.season, 7, 1 + x)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
      news.push({
        kind: 'cup',
        title: `${name(lf.homeId)} v ${name(lf.awayId)} rearranged`,
        body: `Because of a cup tie, the league game ${name(lf.homeId)} v ${name(lf.awayId)} moves from ${d(from)} to ${d(lf.day)}, kicking off at ${lf.time}.`,
      });
    });
  }
  return { news, created };
}

function ordinalWord(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function drawNews(state: GameState, cup: Cup, tie: Tie): CupNews {
  const me = state.userClubId;
  const round = cup.rounds[tie.round];
  const h = clubById(state, tie.homeId!);
  const a = clubById(state, tie.awayId!);
  const opp = tie.homeId === me ? a : h;
  const f = state.fixtures.find((x) => x.id === tie.fixtureIds[0]);
  const when = f ? new Date(Date.UTC(state.season, 7, 1 + f.day)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '';
  const where = round.host === 'neutral' ? ` at ${round.venue}` : round.days.length > 1 ? `, over two legs (first leg ${tie.homeId === me ? 'at home' : 'away'})` : tie.homeId === me ? ' at home' : ' away';
  const level = opp.external ? ` (${opp.external.division})` : '';
  return {
    kind: 'cup',
    title: `${cup.name} ${round.name.toLowerCase()}: ${h.short} v ${a.short}`,
    body: `The ${cup.name} ${round.name.toLowerCase()} draw has paired ${state.clubs.find((c) => c.id === me)!.name} with ${opp.name}${level}${where}. ${when ? `The ${round.days.length > 1 ? 'first leg' : 'tie'} is on ${when}.` : ''}`,
  };
}

/* ───────────────────────── Clashes ───────────────────────── */

/**
 * League games are moved when a club has a cup tie close by: to another day of the same
 * weekend if that gives both clubs two clear days, else to a free midweek.
 */
export function resolveClashes(state: GameState, cupFixtures: Fixture[], onMoved?: (f: Fixture, from: number) => void): void {
  const byClub = new Map<number, Fixture[]>();
  for (const f of state.fixtures) {
    if (f.result) continue;
    for (const id of [f.homeId, f.awayId]) {
      if (!byClub.has(id)) byClub.set(id, []);
      byClub.get(id)!.push(f);
    }
  }
  const leagueIds = new Set(state.comps.map((c) => c.id));
  const wins = windows(state.season).slice(0, 3);
  const busy = (f: Fixture, day: number, gap = 3) => {
    if (day <= state.day) return true;
    // International windows are kept free (the clubs' internationals are away): no league
    // match or cup tie is moved into one.
    if (wins.some((w) => day >= w.from && day <= w.to)) return true;
    for (const id of [f.homeId, f.awayId]) for (const o of byClub.get(id) ?? []) if (o !== f && Math.abs(o.day - day) < gap) return true;
    return false;
  };
  // Europe comes first, then the domestic cups, then the league.
  const rank = (f: Fixture) => (leagueIds.has(f.comp) ? 0 : cupById(state, f.comp)?.kind === 'euro' ? 2 : 1);
  const moveLeague = (lf: Fixture, near: number): boolean => {
    const from = lf.day;
    const wd = weekday(state.season, lf.weekend);
    const offsets = wd === 6 ? [1, -1, 2, 0] : [1, -1, 0];
    const alt = offsets.map((o) => lf.weekend + o).filter((d) => d !== lf.day).sort((a, b) => Math.abs(a - from) - Math.abs(b - from)).find((d) => !busy(lf, d));
    if (alt !== undefined) {
      lf.day = alt;
      const dow = weekday(state.season, alt);
      lf.time = dow === 5 ? '20:00' : dow === 1 ? '20:00' : dow === 0 ? '16:30' : lf.time;
      lf.tbc = false;
    } else {
      // Postponed to the first free Tuesday or Wednesday.
      let d = near + 3;
      const limit = near + 90;
      while (d < limit && !(([2, 3].includes(weekday(state.season, d))) && !busy(lf, d))) d++;
      if (d >= limit) return false;
      lf.day = d;
      lf.weekend = d;
      lf.time = (MIDWEEK[lf.comp] ?? MIDWEEK.ENG).base[1];
      lf.tbc = false;
    }
    if (onMoved) onMoved(lf, from);
    return true;
  };
  /** A domestic cup tie clashing with a European night moves a day or two (never a final). */
  const moveCup = (f: Fixture): boolean => {
    if (f.neutral) return false;
    const from = f.day;
    const offsets = [1, -1, 2, -2, 3, -3, ...Array.from({ length: 57 }, (_, i) => i + 4)];
    // Never so late that it runs into the cup's next round (not drawn yet, so not in the fixtures).
    const next = cupById(state, f.comp)?.rounds[f.round + 1]?.days[0];
    const ok = (d: number, gap: number) => !busy(f, d, gap) && !(f.leg === 1 && d >= from + 5) && !(next !== undefined && d > next - 3);
    const days = offsets.map((o) => from + o);
    // Three days' rest if there's a date for it.
    let alt = days.find((d) => ok(d, 3));
    if (alt === undefined) {
      // At a crowded time of year: a date where only league games are too close, and those move instead.
      for (const d of days.filter((x) => ok(x, 2))) {
        const close = [f.homeId, f.awayId].flatMap((id) => (id === null ? [] : byClub.get(id) ?? []))
          .filter((o) => o !== f && !o.result && Math.abs(o.day - d) < 3);
        if (!close.every((o) => leagueIds.has(o.comp))) continue;
        const saved = close.map((o) => [o, o.day, o.weekend, o.time, o.tbc] as const);
        const was = f.day;
        f.day = d;
        if (close.every((o) => moveLeague(o, d))) { f.day = was; alt = d; break; }
        f.day = was;
        for (const [o, day, weekend, time, tbc] of saved) { o.day = day; o.weekend = weekend; o.time = time; o.tbc = tbc; }
      }
    }
    // Two days' rest, then (in the very worst case) games on consecutive days.
    alt ??= days.find((d) => ok(d, 2)) ?? days.find((d) => ok(d, 1));
    if (alt === undefined) return false;
    f.day = alt;
    f.weekend = alt;
    if (onMoved) onMoved(f, from);
    return true;
  };
  for (const cf of cupFixtures) {
    for (const id of [cf.homeId, cf.awayId]) {
      for (const other of [...(byClub.get(id) ?? [])]) {
        if (other === cf || other.result || cf.result || Math.abs(other.day - cf.day) >= 3) continue;
        const [lo, hi] = rank(other) <= rank(cf) ? [other, cf] : [cf, other];
        if (rank(lo) === rank(hi)) continue;
        if (rank(lo) === 0) moveLeague(lo, hi.day);
        else moveCup(lo);
      }
    }
  }
}

/* ───────────────────────── Lists for the screens ───────────────────────── */

/** Every cup a club is still in (or was in) this season, with how far it got. */
export function clubCupRuns(state: GameState, clubId: number): { cup: Cup; status: string; alive: boolean }[] {
  const out: { cup: Cup; status: string; alive: boolean }[] = [];
  for (const cup of state.cups) {
    const ties = cup.ties.filter((t) => t.homeId === clubId || t.awayId === clubId).sort((a, b) => b.round - a.round);
    const inPhase = cup.phaseClubs?.includes(clubId);
    const entry = cup.rounds.findIndex((r) => r.entrants.includes(clubId));
    if (!ties.length && !inPhase && entry < 0) continue;
    const last = ties[0];
    if (cup.winnerId === clubId) out.push({ cup, status: 'Winners', alive: false });
    else if (last && last.winnerId !== null && last.winnerId !== clubId) out.push({ cup, status: `Out in the ${cup.rounds[last.round].name.toLowerCase()}`, alive: false });
    else if (last) out.push({ cup, status: cup.rounds[last.round].name, alive: true });
    else if (inPhase) {
      if (cup.phaseDone) out.push({ cup, status: 'Out in the league phase', alive: false });
      else {
        const pos = phaseTable(state, cup).findIndex((r) => r.clubId === clubId) + 1;
        out.push({ cup, status: `League phase (${ordinalWord(pos)})`, alive: true });
      }
    } else out.push({ cup, status: `Enters in the ${cup.rounds[entry].name.toLowerCase()}`, alive: true });
  }
  return out;
}

/** Outside clubs still needed this season: in a cup, or met the manager's club. */
export function aliveExternal(state: GameState): Set<number> {
  const alive = new Set<number>();
  for (const f of state.fixtures) if (!f.result) { alive.add(f.homeId); alive.add(f.awayId); }
  for (const cup of state.cups) {
    for (const t of cup.ties) if (t.winnerId === null) { if (t.homeId) alive.add(t.homeId); if (t.awayId) alive.add(t.awayId); }
    for (const t of cup.ties) if (t.winnerId !== null && cup.ties.some((n) => (n.fromHome === t.id && n.homeId === null) || (n.fromAway === t.id && n.awayId === null))) alive.add(t.winnerId);
    for (let r = cup.drawn; r < cup.rounds.length; r++) for (const id of cup.rounds[r].entrants) alive.add(id);
    if (cup.kind === 'euro' && !cup.phaseDone) for (const id of cup.phaseClubs ?? []) alive.add(id);
  }
  return alive;
}

export function summaryWinnerSide(r: MatchSummary): 0 | 1 | null {
  if (r.hg !== r.ag) return r.hg > r.ag ? 0 : 1;
  if (r.pens) return r.pens[0] > r.pens[1] ? 0 : 1;
  return null;
}
