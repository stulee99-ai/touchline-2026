import { familiarityFactor, hashString, POS_ROLE, roleRating } from './attributes.js';
import type { Club, Player, Pos } from './types.js';

export interface FormationDef {
  name: string;
  /** 11 slots, GK first. */
  slots: Pos[];
  /** Pitch coordinates for each slot, x 0–100 (left→right), y 0–100 (own goal→opposition). */
  coords: [number, number][];
}

export const FORMATIONS: FormationDef[] = [
  {
    name: '4-4-2',
    slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'MR', 'MC', 'MC', 'ML', 'ST', 'ST'],
    coords: [[50, 6], [86, 26], [62, 22], [38, 22], [14, 26], [86, 52], [62, 48], [38, 48], [14, 52], [62, 80], [38, 80]],
  },
  {
    name: '4-3-3',
    slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'MC', 'DM', 'MC', 'AMR', 'ST', 'AML'],
    coords: [[50, 6], [86, 26], [62, 22], [38, 22], [14, 26], [70, 50], [50, 40], [30, 50], [84, 74], [50, 82], [16, 74]],
  },
  {
    name: '4-2-3-1',
    slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'DM', 'AMR', 'AMC', 'AML', 'ST'],
    coords: [[50, 6], [86, 26], [62, 22], [38, 22], [14, 26], [62, 40], [38, 40], [84, 64], [50, 64], [16, 64], [50, 84]],
  },
  {
    name: '4-5-1',
    slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'MR', 'MC', 'DM', 'MC', 'ML', 'ST'],
    coords: [[50, 6], [86, 26], [62, 22], [38, 22], [14, 26], [86, 56], [66, 52], [50, 40], [34, 52], [14, 56], [50, 82]],
  },
  {
    name: '3-5-2',
    slots: ['GK', 'DC', 'DC', 'DC', 'MR', 'MC', 'DM', 'MC', 'ML', 'ST', 'ST'],
    coords: [[50, 6], [72, 22], [50, 20], [28, 22], [88, 52], [66, 50], [50, 40], [34, 50], [12, 52], [62, 80], [38, 80]],
  },
  {
    name: '3-4-2-1',
    slots: ['GK', 'DC', 'DC', 'DC', 'MR', 'MC', 'MC', 'ML', 'AMR', 'AML', 'ST'],
    coords: [[50, 6], [72, 22], [50, 20], [28, 22], [88, 48], [62, 44], [38, 44], [12, 48], [66, 68], [34, 68], [50, 84]],
  },
  {
    name: '4-1-4-1',
    slots: ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MR', 'MC', 'MC', 'ML', 'ST'],
    coords: [[50, 6], [86, 26], [62, 22], [38, 22], [14, 26], [50, 38], [86, 58], [64, 54], [36, 54], [14, 58], [50, 82]],
  },
  {
    name: '5-3-2',
    slots: ['GK', 'DR', 'DC', 'DC', 'DC', 'DL', 'MC', 'MC', 'MC', 'ST', 'ST'],
    coords: [[50, 6], [88, 32], [70, 22], [50, 20], [30, 22], [12, 32], [70, 52], [50, 48], [30, 52], [62, 80], [38, 80]],
  },
];

export function getFormation(name: string): FormationDef {
  return FORMATIONS.find((f) => f.name === name) ?? FORMATIONS[0];
}

export function available(p: Player): boolean {
  return !p.injury && p.suspended === 0 && !p.away;
}

/** How good a player is in a given slot, on the 1–20 scale. */
export function slotRating(p: Player, pos: Pos): number {
  return roleRating(p.attrs, POS_ROLE[pos]) * familiarityFactor(p, pos);
}

/** Selection score: ability in the slot, discounted for tiredness and poor form. */
function baseScore(p: Player, pos: Pos, judge = 20): number {
  const tired = p.condition >= 85 ? 0 : p.condition >= 70 ? 0.07 : 0.2;
  // A poor judge of players doesn't notice how tired they are as much as a good one.
  return slotRating(p, pos) * (1 - tired * (0.4 + 0.6 * Math.min(20, judge) / 20));
}

/** Who is judging: an assistant's id and his judging-players rating (1–20). */
export interface Judge { id: number; judge: number }

/**
 * How an assistant sees a player, as a factor on his true worth: 1 for a perfect judge (20), and
 * up to about ±25% for a poor one. The error is his own opinion of that player and doesn't change
 * from day to day (he has his favourites), so his picks are steady rather than random.
 */
export function misjudge(j: Judge | undefined, playerId: number, salt = ''): number {
  if (!j || j.judge >= 20) return 1;
  // Three hashed uniforms make a bell curve with mean 0 and spread about 1.
  let z = 0;
  for (let i = 0; i < 3; i++) z += (hashString(`judge:${j.id}:${playerId}:${salt}:${i}`) % 100000) / 100000;
  z = (z - 1.5) * 2;
  return 1 + z * 0.16 * ((20 - Math.max(1, j.judge)) / 20);
}

const SLOT_PRIORITY: Pos[] = ['GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'ST', 'AMC', 'ML', 'MR', 'AML', 'AMR'];

/**
 * The assistant manager's team pick: greedy fill by scarce position,
 * then a swap pass to fix obviously wrong assignments.
 */
export function autoPickXI(club: Club, players: Record<number, Player>, rest?: Set<number>): number[] {
  const f = getFormation(club.tactics.formation);
  // The manager's club is picked by his assistant, who sees players only as well as he judges them.
  const j = club.assistant;
  const selectionScore = (p: Player, pos: Pos) => baseScore(p, pos, j?.judge ?? 20) * misjudge(j, p.id);
  let pool = club.playerIds.map((id) => players[id]).filter(available);
  // Rested players sit out if there are enough others to pick from.
  if (rest && pool.filter((p) => !rest.has(p.id)).length >= 13) pool = pool.filter((p) => !rest.has(p.id));
  const chosen: (Player | null)[] = new Array(11).fill(null);
  const used = new Set<number>();
  const order = f.slots
    .map((pos, i) => ({ pos, i }))
    .sort((a, b) => SLOT_PRIORITY.indexOf(a.pos) - SLOT_PRIORITY.indexOf(b.pos));
  for (const { pos, i } of order) {
    let best: Player | null = null;
    let bs = -1;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const s = selectionScore(p, pos);
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    if (best) {
      chosen[i] = best;
      used.add(best.id);
    }
  }
  // Swap pass: try exchanging any two picks, or a pick with a bench player.
  for (let iter = 0; iter < 3; iter++) {
    let improved = false;
    for (let a = 0; a < 11; a++) {
      for (let b = a + 1; b < 11; b++) {
        const pa = chosen[a];
        const pb = chosen[b];
        if (!pa || !pb) continue;
        const now = selectionScore(pa, f.slots[a]) + selectionScore(pb, f.slots[b]);
        const swapped = selectionScore(pb, f.slots[a]) + selectionScore(pa, f.slots[b]);
        if (swapped > now + 0.01) {
          chosen[a] = pb;
          chosen[b] = pa;
          improved = true;
        }
      }
      for (const p of pool) {
        const cur = chosen[a];
        if (used.has(p.id) || !cur) continue;
        if (selectionScore(p, f.slots[a]) > selectionScore(cur, f.slots[a]) + 0.01) {
          used.delete(cur.id);
          used.add(p.id);
          chosen[a] = p;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return chosen.filter((p): p is Player => !!p).map((p) => p.id);
}

/** Matchday squad rules (Premier League and the other big leagues, 2026/27). */
export const BENCH_SIZE = 9;
export const MAX_SUBS = 5;
/** Substitutions must be made in at most three stoppages; half time does not count. */
export const MAX_SUB_WINDOWS = 3;

/**
 * The assistant's bench: a keeper, then cover for each line of the team, then the best of
 * the rest. Covering each line first means an injury anywhere has a natural replacement.
 */
export function pickBench(club: Club, players: Record<number, Player>, xi: number[]): number[] {
  const rest = club.playerIds.map((id) => players[id]).filter((p) => available(p) && !xi.includes(p.id));
  const seen = (p: Player) => p.ca * misjudge(club.assistant, p.id);
  const keepers = rest.filter((p) => (p.pos.GK ?? 0) >= 15).sort((a, b) => seen(b) - seen(a));
  const outfield = rest.filter((p) => !(p.pos.GK ?? 0)).sort((a, b) => seen(b) - seen(a));
  const bench: Player[] = keepers.slice(0, 1);
  const lines: Pos[][] = [['DC'], ['DL', 'DR'], ['DM', 'MC'], ['ML', 'MR', 'AML', 'AMR', 'AMC'], ['ST']];
  for (const line of lines) {
    const p = outfield.find((x) => !bench.includes(x) && line.some((k) => (x.pos[k] ?? 0) >= 15));
    if (p) bench.push(p);
  }
  for (const p of outfield) {
    if (bench.length >= BENCH_SIZE) break;
    if (!bench.includes(p)) bench.push(p);
  }
  return bench.map((p) => p.id);
}

/** The bench a club will name: the manager's picks that are still available, else the assistant's. */
export function resolveBench(club: Club, players: Record<number, Player>, xi: number[]): number[] {
  if (!club.bench) return pickBench(club, players, xi);
  return club.bench
    .filter((id) => club.playerIds.includes(id) && players[id] && available(players[id]) && !xi.includes(id))
    .slice(0, BENCH_SIZE);
}

/** The XI a club will actually field: the manager's pick if valid, else the assistant's. */
export function resolveLineup(club: Club, players: Record<number, Player>): number[] {
  const f = getFormation(club.tactics.formation);
  if (club.lineup && club.lineup.length === 11) {
    // -1 is a slot the manager has deliberately left empty ("unpick all"): it stays empty until he fills it.
    const ok = club.lineup.every((id) => id === -1 || (club.playerIds.includes(id) && players[id] && available(players[id])));
    if (ok) return club.lineup;
    // Fill gaps left by injuries/suspensions with the best available player for that slot.
    const fixed = [...club.lineup];
    const used = new Set(fixed.filter((id) => players[id] && available(players[id])));
    for (let i = 0; i < 11; i++) {
      if (fixed[i] === -1) continue;
      const p = players[fixed[i]];
      if (p && available(p) && club.playerIds.includes(p.id)) continue;
      let best = -1;
      let bs = -1;
      for (const id of club.playerIds) {
        const c = players[id];
        if (used.has(id) || !available(c)) continue;
        const s = baseScore(c, f.slots[i], club.assistant?.judge ?? 20) * misjudge(club.assistant, id);
        if (s > bs) {
          bs = s;
          best = id;
        }
      }
      if (best >= 0) {
        fixed[i] = best;
        used.add(best);
      }
    }
    return fixed;
  }
  return autoPickXI(club, players);
}
