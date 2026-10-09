import { clamp, Rng } from './rng.js';
import type { Attributes, AttrKey, Player, Pos } from './types.js';

export const TECHNICAL: AttrKey[] = [
  'crossing', 'dribbling', 'finishing', 'heading', 'longShots', 'marking', 'passing', 'setPieces', 'tackling', 'technique',
];
export const MENTAL: AttrKey[] = [
  'aggression', 'anticipation', 'composure', 'creativity', 'decisions', 'determination', 'flair', 'offTheBall',
  'positioning', 'teamwork', 'workRate',
];
export const PHYSICAL: AttrKey[] = ['acceleration', 'agility', 'jumping', 'naturalFitness', 'pace', 'stamina', 'strength'];
export const GOALKEEPING: AttrKey[] = ['aerialAbility', 'handling', 'oneOnOnes', 'reflexes'];
export const HIDDEN: AttrKey[] = ['consistency', 'importantMatches', 'injuryProneness'];

export const ATTR_LABEL: Record<AttrKey, string> = {
  crossing: 'Crossing', dribbling: 'Dribbling', finishing: 'Finishing', heading: 'Heading', longShots: 'Long Shots',
  marking: 'Marking', passing: 'Passing', setPieces: 'Set Pieces', tackling: 'Tackling', technique: 'Technique',
  aggression: 'Aggression', anticipation: 'Anticipation', composure: 'Composure', creativity: 'Creativity',
  decisions: 'Decisions', determination: 'Determination', flair: 'Flair', offTheBall: 'Off The Ball',
  positioning: 'Positioning', teamwork: 'Teamwork', workRate: 'Work Rate', acceleration: 'Acceleration',
  agility: 'Agility', jumping: 'Jumping', naturalFitness: 'Natural Fitness', pace: 'Pace', stamina: 'Stamina',
  strength: 'Strength', handling: 'Handling', oneOnOnes: 'One On Ones', reflexes: 'Reflexes',
  aerialAbility: 'Aerial Ability', consistency: 'Consistency', importantMatches: 'Important Matches',
  injuryProneness: 'Injury Proneness',
};

export type Role = 'GK' | 'FB' | 'CB' | 'DM' | 'CM' | 'WM' | 'AW' | 'AM' | 'ST';

export const POS_ROLE: Record<Pos, Role> = {
  GK: 'GK', DL: 'FB', DR: 'FB', DC: 'CB', DM: 'DM', MC: 'CM', ML: 'WM', MR: 'WM',
  AML: 'AW', AMR: 'AW', AMC: 'AM', ST: 'ST',
};

/** How much each attribute matters in each role (0–3). Drives generation, CA and match ratings. */
export const ROLE_WEIGHTS: Record<Role, Partial<Record<AttrKey, number>>> = {
  GK: { handling: 3, reflexes: 3, oneOnOnes: 2, aerialAbility: 2, positioning: 2, agility: 2, anticipation: 1, decisions: 1, composure: 1, jumping: 1 },
  CB: { tackling: 3, marking: 3, heading: 3, positioning: 3, strength: 2, jumping: 2, anticipation: 2, decisions: 1, composure: 1, pace: 1, passing: 1, teamwork: 1, acceleration: 1 },
  FB: { tackling: 2, marking: 2, positioning: 2, pace: 3, acceleration: 2, crossing: 2, stamina: 2, workRate: 1, passing: 1, dribbling: 1, teamwork: 1, anticipation: 1 },
  DM: { tackling: 3, positioning: 3, marking: 2, passing: 2, decisions: 2, anticipation: 2, teamwork: 2, workRate: 2, stamina: 2, strength: 1, composure: 1 },
  CM: { passing: 3, decisions: 2, teamwork: 2, workRate: 2, stamina: 2, creativity: 2, technique: 2, tackling: 1, anticipation: 1, composure: 1, offTheBall: 1, longShots: 1 },
  WM: { crossing: 3, pace: 2, acceleration: 2, dribbling: 2, stamina: 2, workRate: 2, passing: 1, technique: 1, teamwork: 1, offTheBall: 1, tackling: 1 },
  AW: { dribbling: 3, pace: 3, acceleration: 2, crossing: 2, technique: 2, flair: 2, offTheBall: 2, finishing: 1, agility: 1, creativity: 1, composure: 1 },
  AM: { creativity: 3, passing: 3, technique: 3, flair: 2, decisions: 2, offTheBall: 2, dribbling: 2, longShots: 1, finishing: 1, composure: 1, anticipation: 1 },
  ST: { finishing: 3, offTheBall: 3, composure: 2, anticipation: 2, pace: 2, acceleration: 2, heading: 2, technique: 1, dribbling: 1, strength: 1, agility: 1 },
};

/** Weighted average of the attributes a role cares about, on the 1–20 scale. */
export function roleRating(attrs: Attributes, role: Role): number {
  const w = ROLE_WEIGHTS[role];
  let sum = 0;
  let tot = 0;
  for (const k in w) {
    const weight = w[k as AttrKey]!;
    sum += attrs[k as AttrKey] * weight;
    tot += weight;
  }
  return sum / tot;
}

/** Multiplier for playing a player in a slot, from his positional familiarity. */
export function familiarityFactor(p: Player, pos: Pos): number {
  const f = p.pos[pos] ?? 0;
  if (pos === 'GK') return f >= 15 ? 1 : 0.3;
  if (p.pos.GK && !p.pos[pos]) return 0.35;
  if (f >= 20) return 1;
  if (f >= 15) return 0.93;
  if (f >= 10) return 0.82;
  return 0.68;
}

export function naturalPositions(p: Player): Pos[] {
  return (Object.keys(p.pos) as Pos[]).filter((k) => (p.pos[k] ?? 0) >= 20);
}

export function bestPos(p: Player): Pos {
  let best: Pos = 'MC';
  let bf = -1;
  for (const k of Object.keys(p.pos) as Pos[]) {
    if ((p.pos[k] ?? 0) > bf) {
      bf = p.pos[k]!;
      best = k;
    }
  }
  return best;
}

export function bestRole(p: Player): Role {
  return POS_ROLE[bestPos(p)];
}

/** Current ability: 10× the rating in the player's best role, so it runs roughly 1–200. */
export function computeCA(p: Player): number {
  return Math.round(roleRating(p.attrs, bestRole(p)) * 10);
}

/** CM-style position string, e.g. "D/DM C", "AM RL", "GK". */
export function posLabel(p: Player): string {
  const has = (k: Pos) => (p.pos[k] ?? 0) >= 15;
  const parts: string[] = [];
  if (has('GK')) parts.push('GK');
  const lines: [string, Pos | null, Pos | null, Pos | null][] = [
    ['D', 'DR', 'DL', 'DC'],
    ['DM', null, null, 'DM'],
    ['M', 'MR', 'ML', 'MC'],
    ['AM', 'AMR', 'AML', 'AMC'],
    ['F', null, null, 'ST'],
  ];
  for (const [name, r, l, c] of lines) {
    let sides = '';
    if (r && has(r)) sides += 'R';
    if (l && has(l)) sides += 'L';
    if (c && has(c)) sides += 'C';
    if (sides) parts.push(name === 'DM' || name === 'F' ? name + (name === 'F' ? ' C' : '') : `${name} ${sides}`);
  }
  return parts.join(', ') || 'N/A';
}

const OFFSETS = [-4.5, -1.8, 0.4, 1.8];

/** Build a believable attribute set for a role at a given current ability. */
export function generateAttributes(rng: Rng, role: Role, ca: number, age: number): Attributes {
  const w = ROLE_WEIGHTS[role];
  const level = ca / 10;
  const a = {} as Attributes;
  const all: AttrKey[] = [...TECHNICAL, ...MENTAL, ...PHYSICAL, ...GOALKEEPING];
  for (const k of all) {
    const weight = w[k] ?? 0;
    a[k] = level + OFFSETS[weight] + rng.normal() * 1.9;
  }
  // Keepers are poor outfielders and vice versa.
  if (role === 'GK') {
    for (const k of TECHNICAL) a[k] = Math.min(a[k], 3 + rng.next() * 8);
    a.finishing = Math.min(a.finishing, 1 + rng.next() * 4);
  } else {
    for (const k of GOALKEEPING) a[k] = 1 + rng.next() * 4;
  }
  // Youngsters are rawer mentally, veterans have lost a yard of pace.
  if (age <= 20) {
    for (const k of ['decisions', 'composure', 'anticipation', 'positioning'] as AttrKey[]) a[k] -= 1.5;
  } else if (age >= 31) {
    const drop = (age - 30) * 0.7;
    for (const k of ['pace', 'acceleration', 'stamina', 'agility'] as AttrKey[]) a[k] -= drop;
    for (const k of ['decisions', 'anticipation', 'positioning', 'composure'] as AttrKey[]) a[k] += 1;
  }
  // Personality-type attributes are independent of ability.
  // Better players tend to be the driven ones.
  a.determination = 5 + Math.max(0, (ca - 100) / 12) + rng.next() * 11;
  a.aggression = 3 + rng.next() * 16;
  a.flair = role === 'AW' || role === 'AM' ? a.flair : 3 + rng.next() * 14;
  a.naturalFitness = 6 + rng.next() * 14;
  a.consistency = 4 + Math.max(0, (ca - 110) / 15) + rng.next() * 13;
  a.importantMatches = 4 + Math.max(0, (ca - 110) / 15) + rng.next() * 13;
  a.injuryProneness = 1 + rng.next() * 16;

  for (const k in a) a[k as AttrKey] = clamp(Math.round(a[k as AttrKey]), 1, 20);

  // Nudge the role-relevant attributes until the role rating matches the target.
  for (let pass = 0; pass < 4; pass++) {
    const diff = level - roleRating(a, role);
    if (Math.abs(diff) < 0.15) break;
    for (const k in w) {
      const key = k as AttrKey;
      a[key] = clamp(Math.round(a[key] + diff + (rng.next() - 0.5) * 0.6), 1, 20);
    }
  }
  return a;
}

/**
 * Change a player's ability by `delta` CA points by nudging attributes.
 * Young players grow physically and technically, older players lose physique.
 */
export function shiftAbility(rng: Rng, p: Player, delta: number): void {
  const role = bestRole(p);
  const w = ROLE_WEIGHTS[role];
  const keys = [...TECHNICAL, ...MENTAL, ...PHYSICAL, ...(role === 'GK' ? GOALKEEPING : [])].filter(
    (k) => k !== 'determination' && k !== 'aggression',
  );
  const target = p.ca + delta;
  let guard = 0;
  while (guard++ < 200) {
    const cur = computeCA(p);
    if (delta > 0 ? cur >= target : cur <= target) break;
    const weights = keys.map((k) => {
      let wt = 0.3 + (w[k] ?? 0);
      if (delta < 0 && PHYSICAL.includes(k)) wt += 2.5;
      if (delta > 0 && p.age >= 27 && MENTAL.includes(k)) wt += 1;
      if (delta > 0 && p.attrs[k] >= 20) wt = 0;
      if (delta < 0 && p.attrs[k] <= 1) wt = 0;
      return wt;
    });
    const k = keys[rng.weighted(weights)];
    p.attrs[k] = clamp(p.attrs[k] + (delta > 0 ? 1 : -1), 1, 20);
  }
  p.ca = computeCA(p);
}

/**
 * Stamp known strengths onto a generated attribute set, then nudge the remaining
 * role attributes so the player's overall ability still matches the target rating.
 */
export function applyTraits(rng: Rng, a: Attributes, role: Role, ca: number, fixed: Partial<Attributes>): void {
  for (const k in fixed) a[k as AttrKey] = clamp(Math.round(fixed[k as AttrKey]!), 1, 20);
  const w = ROLE_WEIGHTS[role];
  const free = (Object.keys(w) as AttrKey[]).filter((k) => !(k in fixed));
  if (!free.length) return;
  const level = ca / 10;
  for (let pass = 0; pass < 6; pass++) {
    const diff = level - roleRating(a, role);
    if (Math.abs(diff) < 0.12) break;
    // Spread the correction over the free attributes, weighted by how much the role cares.
    const freeWeight = free.reduce((s, k) => s + (w[k] ?? 0), 0);
    const totalWeight = Object.values(w).reduce((s, x) => s + (x ?? 0), 0);
    const scale = totalWeight / Math.max(1, freeWeight);
    for (const k of free) a[k] = clamp(Math.round(a[k] + diff * scale + (rng.next() - 0.5) * 0.5), 1, 20);
  }
}

/** Stable 32-bit hash of a string, so a named player gets the same attributes in every new game. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
