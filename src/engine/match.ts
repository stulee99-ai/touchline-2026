import { familiarityFactor, hashString, POS_ROLE, type Role } from './attributes.js';
import {
  buildLine, celebrateLine, type ChanceType, fillerLine, goalLine, milestoneLine, missedLine, offsideLine, savedLine,
  woodworkLine,
} from './commentary.js';
import { INJURIES, injuryWeights } from './data.js';
import { drillFactor, famFactor, type Prep, sharpFatigue, sharpInjury, sharpOf, sharpStrength } from './prep.js';
import { clamp, Rng } from './rng.js';
import { traitsOf, type TraitId } from './traits.js';
import { getFormation, MAX_SUB_WINDOWS, MAX_SUBS, misjudge, slotRating } from './tactics.js';
import type {
  AttrKey, Club, CommentaryLine, Injury, MatchAnalysis, MatchEvent, MatchSummary, Mentality, Player, Pos, RunFlags, SideNumbers, Tactics,
} from './types.js';

/**
 * Minute-by-minute match engine.
 *
 * Each minute one side has the ball (weighted by midfield strength). The side in
 * possession may create a chance, weighted by its attack against the opposition
 * defence. Chances are resolved shooter-vs-keeper using the attributes relevant to
 * the type of chance. Fatigue, cards, injuries and substitutions all feed back into
 * team strength, which is recomputed as the match goes on.
 *
 * Team instructions (passing, tackling, closing down, counter-attack, offside trap)
 * shift possession, chance rate, the mix of chance types, fouls and fatigue.
 *
 * All the tuning constants live in TUNING so the balance script can tweak them.
 */
export const TUNING = {
  chanceBase: 0.3,
  chanceExponent: 0.85,
  possessionExponent: 1.1,
  homeBoost: 1.07,
  conversion: 0.8,
  skillExponent: 0.5,
  keeperExponent: 0.4,
  defenceExponent: 0.2,
  shooterExponent: 1.0,
  foulRate: 0.25,
  yellowBase: 0.2,
  injuryRate: 0.00011,
};

export interface TeamSetup {
  club: Club;
  xi: number[];
  bench: number[];
  formation: string;
  tactics: Tactics;
  /** AI sides change mentality to suit the scoreline. */
  ai: boolean;
  /** Tactical familiarity and drills (the manager's side only). */
  prep?: Prep;
  /** Run arrows by player id (the manager's side only). */
  runs?: Record<number, RunFlags>;
  /** The manager's assistant (his side only): his suggestions and, when he takes over, his changes. */
  assistant?: AssistantView;
}

/** What the match needs to know about an assistant. */
export interface AssistantView { id: number; read: number; judge: number }

/** Cup ties: extra time and penalties, and the first leg's score for a second leg (this match's home side first). */
export interface KnockoutRules {
  extraTime: boolean;
  first?: [number, number];
}

export interface MatchOptions {
  commentary: boolean;
  human?: [boolean, boolean];
  /** Set when the match must have a winner on the night (single match or second leg). */
  knockout?: KnockoutRules;
  /** Neutral ground: no home advantage. */
  neutral?: { venue: string; capacity: number };
  /** A pre-season friendly: fewer injuries and cards, and no VAR. */
  friendly?: boolean;
  /** No VAR (the English Football League). */
  noVar?: boolean;
  /** Scales the chance of a goal: matches in lower divisions, where the football is scrappier but the goals still come. */
  goals?: number;
}

export interface MatchOutcome {
  summary: MatchSummary;
  /** Condition of every player who appeared, at the final whistle. */
  conditions: Record<number, number>;
  injuries: { playerId: number; injury: Injury }[];
}

interface OnPitch {
  p: Player;
  /** Index into the side's formation slots (which shirt on the tactics board). */
  idx: number;
  slot: Pos;
  role: Role;
  cond: number;
  /** Day-to-day form multiplier (consistency matters here). */
  day: number;
  rating: number;
  yellow: boolean;
  started: boolean;
  goals: number;
  /** Carrying an injury: a human manager decides whether to take him off. */
  injured: boolean;
}

/** A player the live screen can show, with his place in the formation. */
export interface LivePlayer {
  p: Player;
  idx: number;
  slot: Pos;
  cond: number;
  rating: number;
  yellow: boolean;
  goals: number;
  injured: boolean;
}

/** What the assistant suggests after an injury or a red card. */
export interface SubSuggestion {
  offId: number;
  onId: number;
  /** Formation slot the substitute goes into. */
  intoIdx: number;
}

/** What a side looked like before a stoppage's changes (opaque to the UI). */
export interface ChangeMark {
  active: OnPitch[];
  places: [OnPitch, number, Pos, Role][];
  bench: Player[];
  subsLeft: number;
  windowsUsed: number;
  windowMinute: number;
  appeared: number;
  events: number;
  formation: string;
}

interface Side {
  prep?: Prep;
  asst?: AssistantView;
  runs: Record<number, RunFlags>;
  club: Club;
  idx: 0 | 1;
  tactics: Tactics;
  ai: boolean;
  active: OnPitch[];
  appeared: OnPitch[];
  bench: Player[];
  subsLeft: number;
  formation: string;
  /** Stoppages used for substitutions, and the minute of the last one. */
  windowsUsed: number;
  windowMinute: number;
  /** Controlled by the manager: no automatic substitutions, injured players stay on until he acts. */
  human: boolean;
  sentOff: { playerId: number; idx: number; slot: Pos }[];
  goals: number;
  shots: number;
  onTarget: number;
  corners: number;
  fouls: number;
  offsides: number;
  possession: number;
  def: number;
  mid: number;
  att: number;
}

/** Share of each role's effort that goes to defence, midfield and attack. */
const SHARE: Record<Role, [number, number, number]> = {
  GK: [0, 0, 0],
  CB: [1.0, 0.15, 0.03],
  FB: [0.7, 0.3, 0.2],
  DM: [0.55, 0.6, 0.08],
  CM: [0.25, 0.8, 0.25],
  WM: [0.2, 0.6, 0.45],
  AW: [0.08, 0.35, 0.8],
  AM: [0.08, 0.55, 0.7],
  ST: [0.03, 0.12, 1.0],
};

/** How much of a player's effort an arrow moves from defence to attack. */
const RUN_SHIFT = 0.12;

const DEF_KEYS: AttrKey[] = ['tackling', 'marking', 'positioning', 'anticipation', 'strength', 'heading', 'pace', 'decisions'];
const MID_KEYS: AttrKey[] = ['passing', 'teamwork', 'workRate', 'decisions', 'technique', 'stamina', 'creativity', 'anticipation'];
const ATT_KEYS: AttrKey[] = ['finishing', 'offTheBall', 'dribbling', 'pace', 'technique', 'composure', 'creativity', 'crossing'];

const XG: Record<ChanceType, number> = {
  through: 0.32, counter: 0.3, cross: 0.13, long: 0.045, box: 0.17, corner: 0.085, freekick: 0.07, penalty: 0.78,
};
const BASE_MIX: Record<ChanceType, number> = {
  through: 13, counter: 0, cross: 20, long: 24, box: 27, corner: 11, freekick: 3, penalty: 1.4,
};

/** How likely each role is to be the one taking a shot. */
const SHOOTER_ROLE: Record<Role, number> = { GK: 0, CB: 0.25, FB: 0.25, DM: 0.45, CM: 0.9, WM: 0.9, AW: 1.7, AM: 1.8, ST: 2.3 };

function avg(p: Player, keys: AttrKey[]): number {
  let s = 0;
  for (const k of keys) s += p.attrs[k];
  return s / keys.length;
}

function name(p: Player): string {
  return p.lastName;
}

/** Share of goals that VAR checks, and the share of checked goals that are ruled out. */
const VAR_GOAL_CHECK = 0.1;
const VAR_GOAL_OVERTURN = 0.27;


/** Which channel a position works in: 0 left, 1 centre, 2 right. */
function channel(slot: Pos): 0 | 1 | 2 {
  if (slot === 'GK') return 1;
  return slot.endsWith('L') ? 0 : slot.endsWith('R') ? 2 : 1;
}

function zeroNumbers(): SideNumbers {
  return {
    goals: 0, shots: 0, onTarget: 0, poss: 0, corners: 0, crosses: 0, crossesDone: 0, aerialsWon: 0,
    flank: [0, 0, 0], shotFlank: [0, 0, 0], periods: [0, 0, 0, 0, 0, 0, 0], kinds: {},
  };
}

/** Keepers tire at about a third of an outfielder's rate. */
export const GK_DRAIN = 0.35;
export class MatchSim {
  minute = 0;
  finished = false;
  added = 0;
  readonly sides: [Side, Side];
  readonly lines: CommentaryLine[] = [];
  readonly events: MatchEvent[] = [];
  private injuries: { playerId: number; injury: Injury }[] = [];
  private pending: CommentaryLine[] = [];
  private attendance: number;
  /** Which side had the ball last minute: drives the colour of the live commentary panel. */
  ball: 0 | 1 = 0;
  /** True during the half-time interval, when substitutions don't use up a stoppage. */
  interval = false;
  /** Normal time, extra time, or the penalty shoot-out. */
  phase: 'normal' | 'et' | 'pens' = 'normal';
  private etAdded = 0;
  /** Penalty shoot-out: takers in order, kicks taken, and who went first. */
  private shoot: { order: [Player[], Player[]]; kicks: { side: 0 | 1; playerId: number; scored: boolean }[]; first: 0 | 1 } | null = null;
  /**
   * The assistant's notebook (the manager's matches only). It has its own random stream, so
   * keeping it never changes how a match plays out.
   */
  private an: { nums: [SideNumbers, SideNumbers]; half: [SideNumbers, SideNumbers] | null; players: MatchAnalysis['players']; changes: MatchAnalysis['changes'] } | null = null;
  private srng = new Rng(1);
  /** The assistant's own slips (kept apart from the match's random numbers, so a perfect assistant changes nothing). */
  private arng = new Rng(2);

  constructor(
    home: TeamSetup,
    away: TeamSetup,
    private players: Record<number, Player>,
    private rng: Rng,
    private opts: MatchOptions = { commentary: false },
  ) {
    this.sides = [this.makeSide(home, 0), this.makeSide(away, 1)];
    if (home.assistant || away.assistant) this.arng = new Rng(hashString(`asst:${home.club.id}:${away.club.id}`) ^ rng.state);
    const cap = opts.neutral?.capacity ?? (home.club.capacity || 9000 + home.club.reputation * 4200);
    const roll = rng.next();
    // A club whose fan base is known (the manager's) fills the ground only as far as demand goes;
    // a big visitor brings a bigger crowd. Everyone else sells out, give or take.
    const fans = opts.neutral ? undefined : home.club.fans;
    const want = fans !== undefined ? fans * (0.88 + roll * 0.17) * (away.club.reputation >= 8 ? 1.1 : 1) : Infinity;
    // A sold-out ground is full but for a few empty seats (away allocations, no-shows).
    this.attendance = Math.round(want >= cap ? cap * (0.97 + roll * 0.03) : want);
    if (opts.commentary) {
      this.an = { nums: [zeroNumbers(), zeroNumbers()], half: null, players: {}, changes: [] };
      this.srng = new Rng((home.club.id * 2654435761) ^ (away.club.id * 40503) ^ (this.attendance * 97));
    }
    this.recompute();
  }

  private makeSide(t: TeamSetup, idx: 0 | 1): Side {
    const f = getFormation(t.formation);
    const active: OnPitch[] = t.xi.map((id, i) => this.makeOnPitch(this.players[id], f.slots[i], i, true));
    return {
      club: t.club, prep: t.prep, asst: t.assistant, runs: { ...(t.runs ?? {}) }, idx, tactics: { ...t.tactics, formation: f.name }, ai: t.ai, active, appeared: [...active],
      bench: t.bench.map((id) => this.players[id]), subsLeft: MAX_SUBS, formation: f.name,
      windowsUsed: 0, windowMinute: -1, human: !!this.opts.human?.[idx], sentOff: [],
      goals: 0, shots: 0, onTarget: 0, corners: 0, fouls: 0, offsides: 0, possession: 0, def: 1, mid: 1, att: 1,
    };
  }

  private makeOnPitch(p: Player, slot: Pos, idx: number, started: boolean): OnPitch {
    const sd = 0.035 + (20 - p.attrs.consistency) * 0.0055;
    return {
      p, idx, slot, role: POS_ROLE[slot], cond: p.condition,
      day: clamp(1 + this.rng.normal() * sd, 0.8, 1.2),
      rating: 6.3 + this.rng.normal() * 0.25, yellow: false, started, goals: 0, injured: false,
    };
  }

  get score(): [number, number] {
    return [this.sides[0].goals, this.sides[1].goals];
  }

  get clockLabel(): string {
    if (this.phase === 'pens') return 'PENS';
    if (this.phase === 'et') return this.minute > 120 ? `120+${this.minute - 120}` : `${this.minute}`;
    if (this.minute > 90) return `90+${this.minute - 90}`;
    return `${this.minute}`;
  }

  /** Aggregate score over both legs (just this match's score for a single match). */
  get aggregate(): [number, number] {
    const f = this.opts.knockout?.first ?? [0, 0];
    return [this.sides[0].goals + f[0], this.sides[1].goals + f[1]];
  }

  /** Penalty shoot-out score so far, if there is one. */
  get shootout(): [number, number] | null {
    if (!this.shoot) return null;
    const k = this.shoot.kicks;
    return [k.filter((x) => x.side === 0 && x.scored).length, k.filter((x) => x.side === 1 && x.scored).length];
  }

  /** Penalties taken so far in a shoot-out. */
  get kicksTaken(): number {
    return this.shoot?.kicks.length ?? 0;
  }

  get isKnockout(): boolean {
    return !!this.opts.knockout;
  }

  get isSecondLeg(): boolean {
    return !!this.opts.knockout?.first;
  }

  /** Winning side of a knockout match (after extra time and penalties), or null. */
  get winnerSide(): 0 | 1 | null {
    if (!this.finished || !this.opts.knockout) return null;
    const [h, a] = this.aggregate;
    if (h !== a) return h > a ? 0 : 1;
    const p = this.shootout;
    return p ? (p[0] > p[1] ? 0 : 1) : null;
  }

  /** Goal difference from a side's point of view, over both legs of a tie. */
  private lead(s: Side): number {
    const [h, a] = this.aggregate;
    return s.idx === 0 ? h - a : a - h;
  }

  private eff(o: OnPitch): number {
    return familiarityFactor(o.p, o.slot) * (0.6 + 0.4 * (o.cond / 100)) * (0.95 + (o.p.morale / 100) * 0.1) * o.day * sharpStrength(sharpOf(o.p)) * (o.injured ? 0.55 : 1);
  }

  /** How well drilled a side is in an instruction (1 = a normal side). */
  private drill(s: Side, key: keyof Prep['drills']): number {
    return s.prep ? drillFactor(s.prep.drills[key]) : 1;
  }

  /**
   * A player's share of defence, midfield and attack. Arrows shift it: a run with the ball turns some
   * defending into attacking (more if he's a good dribbler; a poor one just loses it), and a run without
   * the ball does the same for players who read the game and move well.
   */
  private share(s: Side, o: OnPitch): [number, number, number] {
    let [d, m, a] = SHARE[o.role];
    const r = s.runs[o.p.id];
    if (!r || o.slot === 'GK') return [d, m, a];
    const at = o.p.attrs;
    if (r.ball) {
      const k = clamp(((at.dribbling * 2 + at.pace + at.technique) / 4) / 11, 0.6, 1.35);
      a += RUN_SHIFT * k;
      d *= 0.85;
      if (k < 0.85) m *= 0.94;
    }
    if (r.off) {
      const k = clamp(((at.offTheBall * 2 + at.pace + at.anticipation) / 4) / 11, 0.6, 1.35);
      a += RUN_SHIFT * 0.9 * k;
      d *= 0.88;
    }
    return [d, m, a];
  }

  /** Change a player's arrows during a match (the manager's touchline shouts). */
  setRuns(side: 0 | 1, playerId: number, flags: RunFlags): void {
    const s = this.sides[side];
    if (flags.ball || flags.off) s.runs[playerId] = { ball: !!flags.ball, off: !!flags.off };
    else delete s.runs[playerId];
    this.recompute();
  }

  runsOf(side: 0 | 1, playerId: number): RunFlags {
    return this.sides[side].runs[playerId] ?? {};
  }

  /** Is VAR in use? Not in pre-season friendlies or the English Football League. */
  private get varOn(): boolean {
    return !this.opts.friendly && !this.opts.noVar;
  }

  private recompute(): void {
    for (const s of this.sides) {
      let def = 0, mid = 0, att = 0;
      for (const o of s.active) {
        const [d, m, a] = this.share(s, o);
        const e = this.eff(o);
        if (d) def += d * avg(o.p, DEF_KEYS) * e;
        if (m) mid += m * avg(o.p, MID_KEYS) * e;
        if (a) att += a * avg(o.p, ATT_KEYS) * e;
      }
      const t = s.tactics;
      if (t.mentality === 'attacking') { att *= 1.08; def *= 0.88; }
      if (t.mentality === 'defensive') { att *= 0.9; def *= 1.14; }
      const pf = s.prep ? famFactor(s.prep.fam) : 1;
      def *= pf; mid *= pf; att *= pf;
      if (t.passing === 'short') mid *= 1.05 * this.drill(s, 'passing');
      if (t.passing === 'long') mid *= 0.95 * this.drill(s, 'passing');
      if (t.counterAttack) mid *= 0.97;
      if (t.offsideTrap) def *= 1.02;
      const boost = s.idx === 0 && !this.opts.neutral ? TUNING.homeBoost : 1;
      s.def = def * boost;
      s.mid = mid * boost;
      s.att = att * boost;
    }
    // Pressing and tackling act on the opposition.
    for (const s of this.sides) {
      const o = this.sides[1 - s.idx];
      const t = o.tactics;
      if (t.closingDown === 'all-over') {
        const k = (this.drill(o, 'pressing') - 1) * 0.6;
        s.att *= 0.94 - k;
        s.mid *= 0.97 - k * 0.5;
      }
      if (t.closingDown === 'own-half') { s.att *= 1.04; s.mid *= 1.03; }
      if (t.tackling === 'hard') s.att *= 0.95 - (this.drill(o, 'tackling') - 1) * 0.5;
      if (t.tackling === 'easy') s.att *= 1.02;
      s.def = Math.max(1, s.def);
      s.mid = Math.max(1, s.mid);
      s.att = Math.max(1, s.att);
    }
  }

  setMentality(side: 0 | 1, m: Mentality): void {
    if (this.sides[side].tactics.mentality === m) return;
    this.sides[side].tactics.mentality = m;
    this.logChange(side, 'mentality', m);
    this.recompute();
    const label = m === 'attacking' ? 'push more men forward' : m === 'defensive' ? 'drop deeper and look to protect what they have' : 'settle back into a balanced shape';
    this.say(`${this.sides[side].club.name} ${label}.`, 'info', side);
  }

  /** Change any team instruction mid-match (manager's touchline shouts). */
  setInstruction<K extends keyof Tactics>(side: 0 | 1, key: K, value: Tactics[K]): void {
    if (this.sides[side].tactics[key] === value) return;
    this.sides[side].tactics[key] = value;
    this.logChange(side, key, String(value));
    this.recompute();
  }

  /** A manager's change of instruction, for the assistant's notes (one entry per instruction per minute). */
  private logChange(side: 0 | 1, key: string, value: string): void {
    if (!this.an || !this.sides[side].human) return;
    const c = this.an.changes;
    const same = c.findIndex((x) => x.side === side && x.key === key && x.minute === this.minute);
    if (same >= 0) c.splice(same, 1);
    c.push({ minute: this.minute, side, key, value });
  }

  /** The numbers so far: whole match, and the half-time sheet once the first half is over. */
  analysisNow(): MatchAnalysis | null {
    if (!this.an) return null;
    const read = this.sides.find((s) => s.asst)?.asst?.read;
    return { sides: [this.snapSide(0), this.snapSide(1)], half: this.an.half, players: this.an.players, changes: this.an.changes, ...(read !== undefined ? { read } : {}) };
  }

  private snapSide(i: 0 | 1): SideNumbers {
    const s = this.sides[i];
    const n = this.an!.nums[i];
    return {
      ...n, flank: [...n.flank], shotFlank: [...n.shotFlank], periods: [...n.periods], kinds: { ...n.kinds },
      goals: s.goals, shots: s.shots, onTarget: s.onTarget, poss: s.possession, corners: s.corners,
    };
  }

  /** Strength in the air: the best three headers among the players who would go up for it. */
  private air(s: Side, attacking: boolean): number {
    const v = s.active.filter((o) => o.slot !== 'GK' && (attacking ? SHARE[o.role][2] >= 0.2 || o.role === 'CB' : SHARE[o.role][0] >= 0.5))
      .map((o) => (o.p.attrs.heading + o.p.attrs.jumping) * (this.has(o.p, 'aerial') ? 1.1 : 1)).sort((a, b) => b - a).slice(0, 3);
    return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 15;
  }

  /** A minute on the ball: which channel, and any cross or high ball that came of it. */
  private notePossession(atk: Side, dfn: Side): void {
    const A = this.an;
    if (!A) return;
    const r = this.srng;
    const w = [0.3, 0.3, 0.3];
    for (const o of atk.active) {
      if (o.slot === 'GK') continue;
      w[channel(o.slot)] += SHARE[o.role][2] + SHARE[o.role][1] * 0.3 + (atk.runs[o.p.id]?.ball ? 0.25 : 0);
    }
    if (atk.tactics.passing === 'short') w[1] *= 1.25;
    const c = r.weighted(w) as 0 | 1 | 2;
    A.nums[atk.idx].flank[c]++;
    const crossRate = atk.tactics.passing === 'long' ? 1.4 : atk.tactics.passing === 'short' ? 0.65 : 1;
    if (c !== 1 && r.chance(0.45 * crossRate)) this.noteCross(atk, dfn, c, false);
    // Balls in the air: goal kicks, clearances, knock-downs; a long-ball side plays a lot more of them.
    if (r.chance(atk.tactics.passing === 'long' ? 0.6 : atk.tactics.passing === 'short' ? 0.2 : 0.35)) {
      const share = this.air(atk, true) / (this.air(atk, true) + this.air(dfn, false));
      A.nums[r.chance(share) ? atk.idx : dfn.idx].aerialsWon++;
    }
  }

  /** A cross from a channel: found a team-mate or cleared (a chance that came from a cross always found one). */
  private noteCross(atk: Side, dfn: Side, c: 0 | 1 | 2, fromChance: boolean): void {
    const A = this.an!;
    const n = A.nums[atk.idx];
    n.crosses++;
    if (fromChance) {
      n.crossesDone++;
      n.aerialsWon++;
      return;
    }
    const wide = atk.active.filter((o) => o.slot !== 'GK' && channel(o.slot) === c);
    const crossing = wide.length ? Math.max(...wide.map((o) => o.p.attrs.crossing)) : 8;
    const share = this.air(atk, true) / (this.air(atk, true) + this.air(dfn, false));
    const ok = this.srng.chance(clamp(share * (0.22 + crossing * 0.022), 0.06, 0.6));
    if (ok) n.crossesDone++;
    A.nums[ok ? atk.idx : dfn.idx].aerialsWon++;
  }

  /** A shot: its kind, the spell of the match, the channel it came from, who made it. */
  private noteShot(atk: Side, dfn: Side, type: ChanceType, shooter: OnPitch, assister: OnPitch | null): void {
    const A = this.an;
    if (!A) return;
    const n = A.nums[atk.idx];
    n.kinds[type] = (n.kinds[type] ?? 0) + 1;
    n.periods[this.phase === 'normal' ? Math.min(5, Math.floor((this.minute - 1) / 15)) : 6]++;
    let c = channel((assister ?? shooter).slot);
    if (type === 'cross' && c === 1) c = this.srng.chance(0.5) ? 0 : 2;
    n.shotFlank[c]++;
    if (type === 'cross') this.noteCross(atk, dfn, c, true);
    const P = A.players;
    (P[shooter.p.id] ??= { kp: 0, sh: 0, tk: 0 }).sh++;
    if (assister) (P[assister.p.id] ??= { kp: 0, sh: 0, tk: 0 }).kp++;
  }

  private noteTackle(o: OnPitch): void {
    if (this.an) (this.an.players[o.p.id] ??= { kp: 0, sh: 0, tk: 0 }).tk++;
  }

  private pushEvent(e: MatchEvent): void {
    if (this.phase !== 'normal') e.et = true;
    this.events.push(e);
  }

  private say(text: string, tone: CommentaryLine['tone'], side?: 0 | 1): void {
    if (!this.opts.commentary) return;
    const line: CommentaryLine = { minute: this.minute, text, tone, side };
    if (this.phase !== 'normal') line.stage = this.phase;
    this.lines.push(line);
    this.pending.push(line);
  }

  /** Advance one minute. Returns the commentary lines produced. */
  step(): CommentaryLine[] {
    if (this.finished) return [];
    this.pending = [];
    this.interval = false;
    if (this.phase === 'pens') {
      this.penaltyKick();
      return this.pending;
    }
    if (this.minute === 0) {
      const where = this.opts.neutral ? `${this.opts.neutral.venue}` : this.sides[0].club.stadium;
      const f = this.opts.knockout?.first;
      const leg = !f ? '' : f[0] === f[1] ? ` The first leg finished ${f[0]}-${f[1]}.` : ` ${this.sides[f[0] > f[1] ? 0 : 1].club.name} lead ${Math.max(...f)}-${Math.min(...f)} from the first leg.`;
      this.say(`Kick-off at ${where}. ${this.attendance.toLocaleString('en-GB')} in attendance.${leg}`, 'info');
    }
    this.minute++;
    this.playMinute();
    const [h, a] = this.sides;
    if (this.phase === 'normal') {
      if (this.minute === 45) {
        this.say(`Half-time: ${h.club.name} ${this.score[0]}-${this.score[1]} ${a.club.name}.`, 'info');
        this.interval = true;
        if (this.an) this.an.half = [this.snapSide(0), this.snapSide(1)];
      }
      if (this.minute === 90) {
        this.added = this.rng.int(2, 6);
        this.say(`The fourth official indicates ${this.added} minutes of added time.`, 'info');
      }
      if (this.minute >= 90 + this.added && this.minute >= 91) this.endOfNormalTime();
    } else if (this.phase === 'et') {
      if (this.minute === 105) {
        this.say(`Half-time in extra time: ${h.club.name} ${this.score[0]}-${this.score[1]} ${a.club.name}.`, 'info');
        this.interval = true;
      }
      if (this.minute === 120) this.etAdded = this.rng.int(0, 2);
      if (this.minute >= 120 + this.etAdded) {
        const [x, y] = this.aggregate;
        if (x === y) this.startPens();
        else this.finish(`End of extra time: ${h.club.name} ${this.score[0]}-${this.score[1]} ${a.club.name}.`);
      }
    }
    return this.pending;
  }

  private finish(text: string): void {
    this.finished = true;
    const [h, a] = this.sides;
    let extra = '';
    if (this.opts.knockout?.first) {
      const [x, y] = this.aggregate;
      extra = x === y ? '' : ` ${x > y ? h.club.name : a.club.name} go through ${Math.max(x, y)}-${Math.min(x, y)} on aggregate.`;
    }
    this.say(text + extra, 'info');
  }

  private endOfNormalTime(): void {
    const [h, a] = this.sides;
    const ft = `Full time: ${h.club.name} ${this.score[0]}-${this.score[1]} ${a.club.name}.`;
    const ko = this.opts.knockout;
    const [x, y] = this.aggregate;
    if (!ko || x !== y) {
      this.finish(ft);
      return;
    }
    if (ko.extraTime) {
      this.say(`${ft} ${ko.first ? `${x}-${y} on aggregate, so` : 'Level, so'} we go to extra time.`, 'info');
      this.phase = 'et';
      this.minute = 90;
      this.interval = true;
      // One more substitution, and one more stoppage to make it in.
      for (const s of this.sides) s.subsLeft++;
      for (const s of this.sides) if (s.ai && s.tactics.mentality !== 'balanced') this.setMentality(s.idx, 'balanced');
      return;
    }
    this.say(`${ft} ${ko.first ? `${x}-${y} on aggregate. ` : ''}It goes straight to penalties.`, 'info');
    this.startPens();
  }

  /** Five penalties each, then sudden death. Takers go in order of their penalty-taking. */
  private startPens(): void {
    this.phase = 'pens';
    this.interval = false;
    const order = this.sides.map((s) => {
      const score = (p: Player) => p.attrs.finishing * 2 + p.attrs.composure * 1.5 + p.attrs.setPieces * 0.5 + p.attrs.technique * 0.5;
      const outfield = s.active.filter((o) => o.slot !== 'GK').map((o) => o.p).sort((x, y) => score(y) - score(x));
      const gk = s.active.filter((o) => o.slot === 'GK').map((o) => o.p);
      return [...outfield, ...gk];
    }) as [Player[], Player[]];
    const first = this.rng.chance(0.5) ? 0 : 1;
    this.shoot = { order, kicks: [], first };
    this.say(`Penalties! ${this.sides[first].club.name} will go first.`, 'info');
  }

  private penaltyKick(): void {
    const sh = this.shoot!;
    const n = sh.kicks.length;
    const side = (n % 2 === 0 ? sh.first : 1 - sh.first) as 0 | 1;
    const taken = sh.kicks.filter((k) => k.side === side).length;
    const takers = sh.order[side];
    const taker = takers[taken % takers.length];
    const gkO = this.keeper(this.sides[1 - side]);
    const a = taker.attrs;
    const skill = (a.finishing + a.composure * 2 + a.technique) / 4;
    const keep = gkO ? (gkO.p.attrs.reflexes + gkO.p.attrs.oneOnOnes + gkO.p.attrs.agility) / 3 : 6;
    const pressure = taken >= 4 ? 0.96 : 1;
    const pGoal = clamp(0.755 * (skill / 12) ** 0.35 * (12 / Math.max(4, keep)) ** 0.25 * pressure, 0.5, 0.93);
    const scored = this.rng.chance(pGoal);
    sh.kicks.push({ side, playerId: taker.id, scored });
    const o = this.sides[side].appeared.find((x) => x.p.id === taker.id);
    if (o) o.rating += scored ? 0.05 : -0.35;
    if (!scored && gkO && this.rng.chance(0.6)) gkO.rating += 0.35;
    const [ph, pa] = this.shootout!;
    const miss = gkO && this.rng.chance(0.6) ? `saved by ${name(gkO.p)}!` : this.rng.pick(['over the bar!', 'wide of the post!', 'off the post!']);
    this.say(`${name(taker)} (${this.sides[side].club.short}) ${scored ? 'scores.' : `misses, ${miss}`} ${this.sides[0].club.short} ${ph}-${pa} ${this.sides[1].club.short}`, scored ? 'goal' : 'chance', side);
    // Decided?
    const kh = sh.kicks.filter((k) => k.side === 0).length;
    const ka = sh.kicks.filter((k) => k.side === 1).length;
    let done = false;
    if (kh <= 5 && ka <= 5) {
      done = ph > pa + (5 - ka) || pa > ph + (5 - kh);
    }
    if (!done && kh >= 5 && ka >= 5 && kh === ka && ph !== pa) done = true;
    if (done) {
      const w = ph > pa ? this.sides[0] : this.sides[1];
      this.finished = true;
      this.say(`${w.club.name} win ${Math.max(ph, pa)}-${Math.min(ph, pa)} on penalties!`, 'goal', w.idx);
    }
  }

  runToEnd(): MatchOutcome {
    while (!this.finished) this.step();
    return this.outcome();
  }

  private playMinute(): void {
    const [h, a] = this.sides;
    // Fatigue. Pressing all over the pitch is exhausting.
    for (const s of this.sides) {
      const press = s.tactics.closingDown === 'all-over' ? 1.35 / this.drill(s, 'pressing') : s.tactics.closingDown === 'own-half' ? 0.8 : 1;
      for (const o of s.active) {
        const rn = s.runs[o.p.id];
        // A goalkeeper covers a fraction of the ground and takes almost no part in the press.
        const gk = o.slot === 'GK';
        const runs = rn && !gk ? (rn.ball ? 1.12 : 1) * (rn.off ? 1.15 : 1) : 1;
        const base = 0.3 - o.p.attrs.stamina * 0.011 + (s.tactics.mentality === 'attacking' && !gk ? 0.02 : 0);
        const load = gk ? GK_DRAIN * (1 + (press - 1) * 0.1) : press * runs;
        const drain = base * load * sharpFatigue(sharpOf(o.p)) * (this.has(o.p, 'tireless') ? 0.9 : 1);
        o.cond = Math.max(20, o.cond - Math.max(gk ? 0.02 : 0.05, drain));
      }
    }
    if (this.minute % 5 === 0) {
      this.aiTouchline();
      this.recompute();
    }

    const k = TUNING.possessionExponent;
    const homeShare = clamp(h.mid ** k / (h.mid ** k + a.mid ** k), 0.25, 0.75);
    const atk = this.rng.chance(homeShare) ? h : a;
    const dfn = atk === h ? a : h;
    atk.possession++;
    this.ball = atk.idx;
    this.notePossession(atk, dfn);

    const t = atk.tactics;
    const mentMod = t.mentality === 'attacking' ? 1.06 : t.mentality === 'defensive' ? 0.9 : 1;
    const passMod = t.passing === 'short' ? 0.94 : t.passing === 'long' ? 1.06 : 1;
    // Counter-attacking sides feast on opponents who commit men forward.
    const counterMod = t.counterAttack && (dfn.tactics.mentality === 'attacking' || dfn.goals > atk.goals) ? 1.07 * this.drill(atk, 'counter') : 1;
    // Game state: sides chasing a result late on push harder, sides in front sit deeper.
    const lead = this.lead(atk);
    const stateMod = this.minute > 55 ? (lead < 0 ? 1.15 : lead > 0 ? 0.85 : 1) : 1;
    const pc = TUNING.chanceBase * (atk.att / dfn.def) ** TUNING.chanceExponent * mentMod * passMod * counterMod * stateMod;
    if (this.rng.chance(pc)) {
      this.chance(atk, dfn, this.chanceType(atk, dfn));
    } else if (this.rng.chance(TUNING.foulRate * (dfn.tactics.tackling === 'hard' ? 1.45 / this.drill(dfn, 'tackling') : dfn.tactics.tackling === 'easy' ? 0.7 : 1))) {
      this.foul(dfn, atk);
    } else if (this.rng.chance(0.045)) {
      atk.corners++;
    } else if (this.rng.chance(0.03)) {
      this.defensiveAction(dfn, atk);
    } else if (this.rng.chance(0.13)) {
      const pick = () => this.rng.pick(atk.active).p;
      const p = pick();
      let q = pick();
      if (q === p) q = atk.active[0].p;
      const x = this.rng.pick(dfn.active).p;
      this.say(fillerLine(this.rng, { p: name(p), q: name(q), x: name(x), team: atk.club.name }, {
        passing: t.passing, pressing: dfn.tactics.closingDown === 'all-over', home: atk.idx === 0,
      }), 'plain', atk.idx);
    }

    this.injuryCheck();
    this.autoSubs();
  }

  /** Interceptions and tackles: small rating credit for defenders, flavour for the commentary. */
  private defensiveAction(dfn: Side, atk: Side): void {
    const d = this.pickWeighted(dfn, (o) => (o.slot === 'GK' ? 0 : SHARE[o.role][0] * (o.p.attrs.tackling + o.p.attrs.anticipation)));
    if (!d) return;
    d.rating += 0.05;
    this.noteTackle(d);
    const victim = this.rng.pick(atk.active).p;
    this.say(this.rng.pick([
      `${name(d.p)} reads it well and intercepts.`,
      `Superb sliding tackle from ${name(d.p)} to stop ${name(victim)}.`,
      `${name(d.p)} steps in to win the ball back for ${dfn.club.name}.`,
    ]), 'plain', dfn.idx);
  }

  private chanceType(atk: Side, dfn: Side): ChanceType {
    const mix = { ...BASE_MIX };
    const t = atk.tactics;
    if (t.passing === 'short') { mix.through *= 1.3; mix.box *= 1.3; mix.cross *= 0.7; mix.long *= 0.8; }
    if (t.passing === 'long') { mix.cross *= 1.4; mix.long *= 1.2; mix.through *= 1.1; mix.box *= 0.75; }
    if (t.counterAttack) mix.counter = dfn.tactics.mentality === 'attacking' || dfn.goals > atk.goals ? 10 : 5;
    // Defenders who have gone forward leave gaps behind them.
    mix.counter += this.exposed(dfn) * 1.5;
    const types = Object.keys(mix) as ChanceType[];
    return types[this.rng.weighted(types.map((k) => mix[k]))];
  }

  /** How exposed a side's back line is by players who have gone forward (centre-backs count double). */
  private exposed(s: Side): number {
    let n = 0;
    for (const o of s.active) {
      const r = s.runs[o.p.id];
      if (!r || !(r.ball || r.off)) continue;
      n += o.role === 'CB' ? 2 : o.role === 'FB' || o.role === 'DM' ? 1 : o.role === 'CM' ? 0.5 : 0;
    }
    return n;
  }

  private pickWeighted(side: Side, weight: (o: OnPitch) => number, exclude?: OnPitch): OnPitch | null {
    const pool = side.active.filter((o) => o !== exclude);
    if (!pool.length) return null;
    return pool[this.rng.weighted(pool.map(weight))];
  }

  private traitCache = new Map<number, Set<TraitId>>();
  /** Does this player have the trait? Modifiers are small: a few percent each. */
  private has(p: Player, id: TraitId): boolean {
    let t = this.traitCache.get(p.id);
    if (!t) { t = new Set(traitsOf(p)); this.traitCache.set(p.id, t); }
    return t.has(id);
  }

  private keeper(side: Side): OnPitch | null {
    return side.active.find((o) => o.slot === 'GK') ?? null;
  }

  private chance(atk: Side, dfn: Side, type: ChanceType): void {
    const longBall = atk.tactics.passing === 'long';
    const shooterWeight = (o: OnPitch): number => {
      let w = SHOOTER_ROLE[o.role];
      if (type === 'cross' || type === 'corner') w *= (o.p.attrs.heading + o.p.attrs.jumping) / 20 * (o.role === 'CB' ? 3 : 1);
      else if (type === 'long') w *= o.p.attrs.longShots / 10 * (o.role === 'ST' ? 0.5 : 1.3);
      else if (type === 'counter') w *= (o.p.attrs.pace + o.p.attrs.finishing) / 20;
      else w *= (o.p.attrs.finishing + o.p.attrs.offTheBall) / 20;
      if (longBall && o.role === 'ST') w *= (o.p.attrs.strength + o.p.attrs.heading) / 22;
      if (this.has(o.p, 'poacher') && type !== 'long') w *= 1.1;
      if ((type === 'cross' || type === 'corner') && this.has(o.p, 'aerial')) w *= 1.12;
      if (type === 'long' && this.has(o.p, 'longShots')) w *= 1.12;
      if ((type === 'counter' || type === 'through') && this.has(o.p, 'speedster')) w *= 1.1;
      if (this.has(o.p, 'dribbler') && (type === 'through' || type === 'box')) w *= 1.06;
      const rn = atk.runs[o.p.id];
      if (rn && o.slot !== 'GK') {
        if (rn.off && (type === 'through' || type === 'counter' || type === 'box' || type === 'cross')) w *= 1.25;
        if (rn.ball && (type === 'long' || type === 'box')) w *= 1.12;
      }
      return w ** TUNING.shooterExponent;
    };
    let shooter: OnPitch | null;
    if (type === 'penalty' || type === 'freekick') {
      // The side's designated taker: set-piece specialists for free kicks, cool finishers for penalties.
      const score = (o: OnPitch) => type === 'penalty'
        ? o.p.attrs.finishing * 2 + o.p.attrs.composure + o.p.attrs.setPieces * 0.5 + (this.has(o.p, 'penalty') ? 3 : 0)
        : o.p.attrs.setPieces * 2 + o.p.attrs.technique + o.p.attrs.longShots * 0.5 + (this.has(o.p, 'setPieces') ? 3 : 0);
      shooter = [...atk.active].filter((o) => o.slot !== 'GK').sort((x, y) => score(y) - score(x))[0] ?? null;
    } else {
      shooter = this.pickWeighted(atk, shooterWeight);
    }
    if (!shooter) return;
    const assister = type === 'freekick' ? null
      : this.pickWeighted(atk, (o) => {
          if (o.slot === 'GK') return 0.05;
          const a = o.p.attrs;
          const skill = type === 'cross' ? a.crossing : type === 'corner' ? a.setPieces : type === 'counter' ? (a.pace + a.passing) / 2 : (a.passing + a.creativity) / 2;
          let m = (skill / 10) ** 2 * (o.role === 'CB' ? 0.3 : 1);
          if (this.has(o.p, 'playmaker')) m *= 1.12;
          if (type === 'cross' && this.has(o.p, 'crosser')) m *= 1.12;
          if (type === 'corner' && this.has(o.p, 'setPieces')) m *= 1.1;
          const rn = atk.runs[o.p.id];
          if (rn?.ball && (type === 'through' || type === 'box' || type === 'counter' || type === 'cross')) m *= 1.3;
          return m;
        }, shooter);
    const defender = this.pickWeighted(dfn, (o) => (o.slot === 'GK' ? 0 : (SHARE[o.role][0] + 0.05) * (this.has(o.p, 'ballWinner') ? 1.12 : 1)));
    const gk = this.keeper(dfn);

    const f = {
      s: name(shooter.p), a: assister ? name(assister.p) : '', d: defender ? name(defender.p) : 'the defender',
      k: gk ? name(gk.p) : 'the keeper', t: name(shooter.p), team: atk.club.name, opp: dfn.club.name,
      foot: shooter.p.foot === 'L' ? 'left' : shooter.p.foot === 'R' ? 'right' : this.rng.pick(['left', 'right']),
    };
    // For penalties the fouled player is the provider, the taker is the shooter.
    if (type === 'penalty') f.s = assister ? name(assister.p) : name(this.rng.pick(atk.active).p);

    // Offside trap: through balls may be flagged, but a beaten trap leaves the keeper exposed.
    // Forwards making runs without the ball are caught offside a little more often.
    const runners = atk.active.filter((o) => o.slot !== 'GK' && atk.runs[o.p.id]?.off).length;
    let trapBeaten = false;
    if (dfn.tactics.offsideTrap && (type === 'through' || type === 'counter')) {
      const line = dfn.active.filter((o) => o.role === 'CB' || o.role === 'FB');
      const pace = line.length ? line.reduce((s, o) => s + o.p.attrs.pace + o.p.attrs.positioning, 0) / (line.length * 2) : 10;
      if (this.rng.chance(clamp((0.2 + (pace - 11) * 0.03) * this.drill(dfn, 'offside') * (1 + runners * 0.08), 0.1, 0.55))) {
        this.flagOffside(atk, f, true);
        return;
      }
      trapBeaten = true;
    } else if ((type === 'through' || type === 'counter') && this.rng.chance(0.08 + runners * 0.02)) {
      this.flagOffside(atk, f, false);
      return;
    }

    const s = shooter.p.attrs;
    let skill: number;
    switch (type) {
      case 'through':
      case 'counter': skill = (s.finishing * 2 + s.composure + s.pace + s.offTheBall) / 5; break;
      case 'cross':
      case 'corner': skill = (s.heading * 2 + s.jumping + s.strength + s.offTheBall) / 5; break;
      case 'long': skill = (s.longShots * 2 + s.technique + s.composure) / 4; break;
      case 'freekick': skill = (s.setPieces * 2 + s.technique + s.longShots) / 4; break;
      case 'penalty': skill = (s.finishing + s.composure * 2 + s.technique) / 4; break;
      default: skill = (s.finishing * 2 + s.composure + s.technique + s.anticipation) / 5;
    }
    skill *= this.eff(shooter);
    if (this.has(shooter.p, 'clinical') && type !== 'penalty' && type !== 'freekick') skill *= 1.03;
    if (type === 'penalty' && this.has(shooter.p, 'penalty')) skill *= 1.04;
    if (type === 'freekick' && this.has(shooter.p, 'setPieces')) skill *= 1.04;
    if (type === 'long' && this.has(shooter.p, 'longShots')) skill *= 1.03;
    if ((type === 'cross' || type === 'corner') && this.has(shooter.p, 'aerial')) skill *= 1.03;
    let keep = 6;
    if (gk) {
      const g = gk.p.attrs;
      const special = type === 'through' || type === 'counter' || type === 'penalty' ? g.oneOnOnes : type === 'cross' || type === 'corner' ? g.aerialAbility : g.handling;
      keep = ((g.reflexes * 2 + special + g.positioning + g.agility) / 5) * this.eff(gk) * (this.has(gk.p, 'shotStopper') ? 1.03 : 1);
    }
    const defQ = defender ? avg(defender.p, DEF_KEYS) * this.eff(defender) : 8;

    const pGoal = clamp(
      XG[type] * TUNING.conversion * (this.opts.goals ?? 1) * (trapBeaten ? 1.3 : 1) * (skill / 11) ** TUNING.skillExponent * (11 / Math.max(3, keep)) ** TUNING.keeperExponent *
        (type === 'penalty' ? 1 : (11 / defQ) ** TUNING.defenceExponent),
      0.01, 0.92,
    );
    const pSaveOfRest = clamp(0.3 * (skill / 13) ** 0.6, 0.15, 0.55);

    if (type === 'penalty' && this.varOn && !this.penaltyReview(atk, dfn, f)) return;
    atk.shots++;
    this.noteShot(atk, dfn, type, shooter, assister);
    const intro = type === 'penalty' && this.penaltyByVar ? this.penaltyByVar : buildLine(this.rng, type, f);
    this.penaltyByVar = '';
    if (type === 'corner') atk.corners++;
    this.say(intro, 'chance', atk.idx);

    if (this.rng.chance(pGoal)) {
      const og = (type === 'cross' || type === 'corner' || type === 'box') && defender && this.rng.chance(0.035);
      // A goal that is checked by VAR: the ball is in the net, then the wait.
      if (!og && this.varOn && type !== 'penalty' && type !== 'freekick' && this.rng.chance(VAR_GOAL_CHECK)) {
        const scored = this.goalReview(atk, dfn, shooter, assister, f, goalLine(this.rng, type, f));
        if (!scored) {
          atk.onTarget++;
          shooter.rating -= 0.05;
          return;
        }
        this.reviewedGoal = true;
      }
      atk.onTarget++;
      atk.goals++;
      if (og && defender) {
        this.say(`...and it's turned into his own net by ${name(defender.p)}! OWN GOAL! ${this.scoreText()}`, 'goal', atk.idx);
        this.pushEvent({ minute: this.minute, kind: 'og', side: atk.idx, playerId: defender.p.id });
        defender.rating -= 1.0;
      } else {
        const assisted = type !== 'penalty' && type !== 'freekick' && assister && (type === 'corner' || this.rng.chance(0.85));
        if (this.reviewedGoal) this.reviewedGoal = false;
        else this.say(`${goalLine(this.rng, type, f)} ${this.scoreText()}`, 'goal', atk.idx);
        this.pushEvent({
          minute: this.minute, kind: type === 'penalty' ? 'pen' : 'goal', side: atk.idx,
          playerId: shooter.p.id, otherId: assisted && assister ? assister.p.id : undefined,
        });
        shooter.goals++;
        shooter.rating += type === 'penalty' ? 0.7 : 1.05;
        if (assisted && assister) assister.rating += 0.6;
        const milestone = milestoneLine(shooter.goals, shooter.p.stats.goals + shooter.goals, name(shooter.p));
        this.say(milestone ?? celebrateLine(this.rng, f), 'info', atk.idx);
      }
      for (const o of dfn.active) {
        if (o.slot === 'GK') o.rating -= 0.45;
        else if (SHARE[o.role][0] >= 0.7) o.rating -= 0.22;
        else if (SHARE[o.role][0] >= 0.5) o.rating -= 0.1;
      }
      for (const o of atk.active) o.rating += 0.05;
      return;
    }
    if (type === 'penalty') {
      this.pushEvent({ minute: this.minute, kind: 'penmiss', side: atk.idx, playerId: shooter.p.id });
      shooter.rating -= 0.6;
    }
    if (this.rng.chance(pSaveOfRest)) {
      atk.onTarget++;
      shooter.rating += 0.12;
      if (gk) gk.rating += type === 'penalty' ? 0.8 : 0.28;
      this.say(savedLine(this.rng, type, f), 'chance', atk.idx);
      if (this.rng.chance(0.3)) atk.corners++;
    } else {
      shooter.rating -= 0.04;
      if (defender && this.rng.chance(0.5)) {
        defender.rating += 0.12;
        this.noteTackle(defender);
      }
      if (assister) assister.rating += 0.08;
      const text = this.rng.chance(0.07) && type !== 'penalty' ? woodworkLine(this.rng, f) : missedLine(this.rng, type, f);
      this.say(text, 'chance', atk.idx);
      if (this.rng.chance(0.25)) atk.corners++;
    }
  }

  private penaltyByVar = '';
  private reviewedGoal = false;

  /** A flag for offside, with the semi-automated system's verdict on the close ones. */
  private flagOffside(atk: Side, f: Record<string, string>, trap: boolean): void {
    atk.offsides++;
    this.say(offsideLine(this.rng, f, trap), 'plain', atk.idx);
  }

  /**
   * VAR looks at a penalty: some are overturned, some are only given after the referee is sent to the monitor.
   * Returns false if the penalty is cancelled.
   */
  private penaltyReview(atk: Side, dfn: Side, f: Record<string, string>): boolean {
    const r = this.rng.next();
    const victim = f.s;
    const defender = f.d;
    if (r < 0.08) {
      this.say(buildLine(this.rng, 'penalty', f), 'chance', atk.idx);
      this.say(`VAR is looking at the penalty decision against ${dfn.club.name}.`, 'var', atk.idx);
      this.say(this.rng.pick([
        `The referee is called to the monitor. ${victim} went down very easily and the penalty is overturned!`,
        `Overturned! The replay shows there was hardly any contact, and there's no penalty after the review.`,
        `No penalty! The replays show the contact was just outside the box, so it's only a free kick.`,
      ]), 'var', atk.idx);
      return false;
    }
    if (r < 0.3) {
      this.say(`Appeals for a penalty after ${victim} goes down in the box, but the referee waves play on...`, 'chance', atk.idx);
      this.say('VAR is checking a possible penalty. The referee is asked to look at the pitchside monitor.', 'var', atk.idx);
      this.penaltyByVar = this.rng.pick([
        `PENALTY! The referee changes his mind after watching the replay. ${defender} did catch ${victim}.`,
        `The referee points to the spot after the review! ${defender} was late and ${victim} was clipped. ${f.t} to take...`,
        `Handball! VAR spotted it and the referee gives the penalty. ${f.t} will take it...`,
      ]);
      return true;
    }
    if (r < 0.4) {
      this.say(buildLine(this.rng, 'penalty', f), 'chance', atk.idx);
      this.say(`VAR checks the decision and it stands: a clear penalty.`, 'var', atk.idx);
      this.penaltyByVar = `${f.t} steps up to take it...`;
    }
    return true;
  }

  /**
   * VAR checks a goal. Returns true if it stands. Disallowed goals never reach the score; the shot still counts.
   */
  private goalReview(atk: Side, dfn: Side, shooter: OnPitch, assister: OnPitch | null, f: Record<string, string>, goalText: string): boolean {
    this.say(goalText, 'chance', atk.idx);
    const reason = this.rng.pick(['offside', 'offside', 'offside', 'foul', 'foul', 'hand']);
    const man = assister && this.rng.chance(0.5) ? name(assister.p) : name(shooter.p);
    const cm = this.rng.int(1, 34);
    if (reason === 'offside') this.say(`The flag stayed down, but VAR is checking for offside in the build-up. The semi-automated system is drawing the lines.`, 'var', atk.idx);
    else if (reason === 'foul') this.say(`VAR is checking for a possible foul in the build-up to the goal.`, 'var', atk.idx);
    else this.say(`VAR is checking for a possible handball in the build-up.`, 'var', atk.idx);
    const disallowed = this.rng.chance(VAR_GOAL_OVERTURN);
    if (!disallowed) {
      const text = reason === 'offside'
        ? this.rng.pick([`${man} is onside by ${cm}cm. The goal stands!`, `The 3D animation shows ${man} level. The goal stands!`])
        : reason === 'foul' ? 'No foul, the check is complete. The goal stands!' : 'No handball, the check is complete. The goal stands!';
      this.say(`${text} ${this.scoreText(atk.idx, 1)}`, 'goal', atk.idx);
      return true;
    }
    const text = reason === 'offside'
      ? this.rng.pick([
        `NO GOAL! Semi-automated offside technology: ${man} was offside by ${cm}cm. The goal is ruled out.`,
        `NO GOAL! The 3D animation shows ${man} ahead of the last defender by ${cm}cm. Ruled out for offside.`,
      ])
      : reason === 'foul'
        ? `NO GOAL! ${man} fouled ${name(this.rng.pick(dfn.active).p)} in the build-up. The referee disallows it after the review.`
        : `NO GOAL! The ball struck ${man}'s arm in the build-up. The goal is chalked off.`;
    this.say(text, 'var', atk.idx);
    if (reason === 'offside') atk.offsides++;
    else atk.fouls++;
    for (const o of dfn.active) if (o.slot === 'GK') o.rating += 0.15;
    return false;
  }

  private scoreText(bySide?: 0 | 1, extra = 0): string {
    if (bySide !== undefined) {
      const g: [number, number] = [this.sides[0].goals, this.sides[1].goals];
      g[bySide] += extra;
      const [h, a] = this.sides;
      return `${h.club.short} ${g[0]}-${g[1]} ${a.club.short}`;
    }
    const [h, a] = this.sides;
    return `${h.club.short} ${h.goals}-${a.goals} ${a.club.short}`;
  }

  private foul(offender: Side, victim: Side): void {
    offender.fouls++;
    const o = this.pickWeighted(offender, (x) => (x.slot === 'GK' ? 0.05 : (0.5 + SHARE[x.role][0] + x.p.attrs.aggression / 10) * (this.has(x.p, 'hothead') ? 1.2 : 1)));
    if (!o) return;
    const agg = o.p.attrs.aggression;
    const cardMod = (offender.tactics.tackling === 'hard' ? 1.2 / this.drill(offender, 'tackling') : offender.tactics.tackling === 'easy' ? 0.8 : 1) * (this.opts.friendly ? 0.5 : 1);
    const v = this.rng.pick(victim.active).p;
    if (this.rng.chance((0.0003 + agg * 0.00006) * cardMod)) {
      if (this.varOn && !o.yellow && this.rng.chance(0.12)) {
        // Sent off, then the monitor changes it to a booking.
        this.say(`${name(o.p)} lunges in on ${name(v)} and the referee reaches for a red card!`, 'card', offender.idx);
        this.say(`VAR is reviewing the challenge and calls the referee to the monitor.`, 'var', offender.idx);
        this.say(`Downgraded! After a look at the replay it's only a yellow card for ${name(o.p)}.`, 'var', offender.idx);
        o.yellow = true;
        o.rating -= 0.3;
        this.pushEvent({ minute: this.minute, kind: 'yellow', side: offender.idx, playerId: o.p.id });
        return;
      }
      if (this.varOn && this.rng.chance(0.25)) this.say(`VAR checks the challenge by ${name(o.p)} on ${name(v)} and backs the referee: it's a red card.`, 'var', offender.idx);
      this.sendOff(offender, o, `Straight red card! ${name(o.p)} is sent off for a reckless challenge on ${name(v)}.`);
      return;
    }
    if (this.varOn && !o.yellow && this.rng.chance(0.002)) {
      this.say(`${name(o.p)} is shown a yellow for a challenge on ${name(v)}, but VAR has seen something more serious.`, 'card', offender.idx);
      this.say(`The referee is sent to the monitor to look at the tackle again.`, 'var', offender.idx);
      this.sendOff(offender, o, `Upgraded! It's a straight red card for ${name(o.p)}.`);
      return;
    }
    if (this.rng.chance((TUNING.yellowBase + (agg - 10) * 0.008) * cardMod * (o.yellow ? 0.45 : 1))) {
      if (o.yellow) {
        this.pushEvent({ minute: this.minute, kind: 'yellow', side: offender.idx, playerId: o.p.id });
        this.sendOff(offender, o, `Second yellow for ${name(o.p)}! He's off, and ${offender.club.name} are down to ${offender.active.length - 1}.`);
      } else {
        o.yellow = true;
        o.rating -= 0.3;
        this.pushEvent({ minute: this.minute, kind: 'yellow', side: offender.idx, playerId: o.p.id });
        this.say(this.rng.pick([
          `${name(o.p)} is booked for a late challenge on ${name(v)}.`,
          `Yellow card. ${name(o.p)} scythes down ${name(v)}.`,
          `${name(o.p)} goes into the book for pulling back ${name(v)}.`,
          `The referee shows ${name(o.p)} a yellow for dissent.`,
        ]), 'card', offender.idx);
      }
    }
  }

  private sendOff(side: Side, o: OnPitch, text: string): void {
    this.pushEvent({ minute: this.minute, kind: 'red', side: side.idx, playerId: o.p.id });
    o.rating -= 1.5;
    this.say(text, 'card', side.idx);
    side.active = side.active.filter((x) => x !== o);
    side.sentOff.push({ playerId: o.p.id, idx: o.idx, slot: o.slot });
    if (o.slot === 'GK') {
      // Emergency keeper: bring on the sub keeper for an outfielder, or put someone in goal.
      // This happens straight away, even for the manager's side: nobody can play without a keeper.
      const benchGk = side.bench.find((p) => (p.pos.GK ?? 0) >= 15);
      const off = [...side.active].sort((x, y) => SHARE[y.role][2] - SHARE[x.role][2] || x.cond - y.cond)[0];
      if (benchGk && off && this.canSub(side.idx)) {
        this.doSub(side, off, benchGk, o.idx);
      } else {
        const stand = [...side.active].sort((x, y) => y.p.attrs.handling - x.p.attrs.handling)[0];
        if (stand) {
          stand.slot = 'GK';
          stand.role = 'GK';
          stand.idx = o.idx;
          this.say(`${name(stand.p)} goes in goal.`, 'info', side.idx);
        }
      }
    }
    this.recompute();
  }

  private injuryCheck(): void {
    for (const s of this.sides) {
      for (const o of [...s.active]) {
        if (o.injured) continue;
        const risk = TUNING.injuryRate * (0.4 + o.p.attrs.injuryProneness / 12) * (this.has(o.p, 'brittle') ? 1.1 : 1) * (o.cond < 60 ? 1.8 : 1) * sharpInjury(sharpOf(o.p)) * (this.opts.friendly ? 0.5 : 1);
        if (!this.rng.chance(risk)) continue;
        const wts = injuryWeights();
        const def = INJURIES[this.rng.weighted(wts)];
        const injury: Injury = { name: def.name, days: this.rng.int(def.min * 7 - 3, def.max * 7) };
        this.injuries.push({ playerId: o.p.id, injury });
        this.pushEvent({ minute: this.minute, kind: 'injury', side: s.idx, playerId: o.p.id });
        this.say(`${name(o.p)} is down injured. It looks like a ${injury.name.toLowerCase()}.`, 'card', s.idx);
        o.injured = true;
        o.cond = Math.max(20, o.cond - 25);
        if (s.human) continue; // the manager decides
        const replacement = this.bestBenchFor(s, o.slot);
        if (replacement && this.canSub(s.idx)) {
          this.doSub(s, o, replacement, o.idx);
        } else {
          this.say(`${s.club.name} can't make a change. ${name(o.p)} will have to play on.`, 'info', s.idx);
        }
      }
    }
  }

  private bestBenchFor(s: Side, slot: Pos): Player | null {
    let best: Player | null = null;
    let bs = -1;
    for (const p of s.bench) {
      // The manager's assistant picks the replacement he rates best, which isn't always the best.
      const r = slotRating(p, slot) * (p.injury ? 0 : 1) * misjudge(s.asst, p.id);
      if (r > bs) { bs = r; best = p; }
    }
    return best;
  }

  private doSub(s: Side, off: OnPitch, on: Player, intoIdx: number): void {
    s.subsLeft--;
    if (!this.interval && s.windowMinute !== this.minute) {
      s.windowsUsed++;
      s.windowMinute = this.minute;
    }
    s.bench = s.bench.filter((p) => p !== on);
    const slot = getFormation(s.formation).slots[intoIdx] ?? off.slot;
    const o = this.makeOnPitch(on, slot, intoIdx, false);
    if (intoIdx === off.idx) s.active = s.active.map((x) => (x === off ? o : x));
    else {
      s.active = s.active.filter((x) => x !== off);
      s.active.push(o);
    }
    s.appeared.push(o);
    this.pushEvent({ minute: this.minute, kind: 'sub', side: s.idx, playerId: off.p.id, otherId: on.id });
    this.say(`Substitution for ${s.club.name}: ${on.firstName ? on.firstName + ' ' : ''}${on.lastName} replaces ${name(off.p)}.`, 'info', s.idx);
    this.recompute();
  }

  /**
   * A mark taken before the manager starts changing his side during a stoppage, so the
   * changes can be taken back until play restarts (see rollback).
   */
  markChanges(side: 0 | 1): ChangeMark {
    const s = this.sides[side];
    return {
      active: [...s.active], places: s.active.map((o) => [o, o.idx, o.slot, o.role]), bench: [...s.bench],
      subsLeft: s.subsLeft, windowsUsed: s.windowsUsed, windowMinute: s.windowMinute,
      appeared: s.appeared.length, events: this.events.length, formation: s.formation,
    };
  }

  /** Put the side back as it was at `mark`, dropping the commentary lines the changes produced. */
  rollback(side: 0 | 1, mark: ChangeMark, drop: Set<CommentaryLine>): void {
    const s = this.sides[side];
    s.active = [...mark.active];
    for (const [o, idx, slot, role] of mark.places) { o.idx = idx; o.slot = slot; o.role = role; }
    s.bench = [...mark.bench];
    s.subsLeft = mark.subsLeft;
    s.windowsUsed = mark.windowsUsed;
    s.windowMinute = mark.windowMinute;
    s.appeared.length = mark.appeared;
    this.events.length = mark.events;
    s.formation = mark.formation;
    s.tactics.formation = mark.formation;
    for (let i = this.lines.length - 1; i >= 0; i--) if (drop.has(this.lines[i])) this.lines.splice(i, 1);
    this.pending = this.pending.filter((l) => !drop.has(l));
    this.recompute();
  }

  /** Whether a substitution can be made now: subs left, and a stoppage left (or one already open). */
  canSub(side: 0 | 1): boolean {
    const s = this.sides[side];
    if (this.finished || this.phase === 'pens' || s.subsLeft <= 0 || !s.bench.length) return false;
    return this.interval || s.windowMinute === this.minute || s.windowsUsed < this.maxWindows;
  }

  /** Stoppages allowed for changes: one more in extra time. */
  private get maxWindows(): number {
    return MAX_SUB_WINDOWS + (this.phase === 'normal' ? 0 : 1);
  }

  windowsLeft(side: 0 | 1): number {
    return this.maxWindows - this.sides[side].windowsUsed;
  }

  /**
   * Manual substitution (from the UI). The substitute takes the departing player's place,
   * or `intoIdx` if given (an empty slot after a red card). Returns false if not allowed.
   */
  substitute(side: 0 | 1, offId: number, onId: number, intoIdx?: number): boolean {
    const s = this.sides[side];
    const off = s.active.find((o) => o.p.id === offId);
    const on = s.bench.find((p) => p.id === onId);
    if (!off || !on || !this.canSub(side)) return false;
    const target = intoIdx === undefined || intoIdx === off.idx || !this.vacantSlots(side).includes(intoIdx) ? off.idx : intoIdx;
    this.doSub(s, off, on, target);
    return true;
  }

  /** Formation slots with nobody in them (after a red card). */
  vacantSlots(side: 0 | 1): number[] {
    const s = this.sides[side];
    const taken = new Set(s.active.map((o) => o.idx));
    return getFormation(s.formation).slots.map((_, i) => i).filter((i) => !taken.has(i));
  }

  /** Switch shape mid-match: every player on the pitch is moved to the slot that suits him best. */
  setFormation(side: 0 | 1, formation: string): void {
    const s = this.sides[side];
    const f = getFormation(formation);
    if (f.name === s.formation) return;
    // Greedy assignment of players to slots by suitability; the keeper stays in goal.
    const pairs: [OnPitch, number, number][] = [];
    for (const o of s.active) f.slots.forEach((slot, i) => pairs.push([o, i, o.slot === 'GK' ? (slot === 'GK' ? 100 : -100) : slot === 'GK' ? -100 : slotRating(o.p, slot)]));
    pairs.sort((a, b) => b[2] - a[2]);
    const placed = new Set<OnPitch>();
    const used = new Set<number>();
    for (const [o, i] of pairs) {
      if (placed.has(o) || used.has(i)) continue;
      o.idx = i;
      o.slot = f.slots[i];
      o.role = POS_ROLE[o.slot];
      placed.add(o);
      used.add(i);
    }
    s.formation = f.name;
    s.tactics.formation = f.name;
    this.logChange(side, 'formation', f.name);
    this.recompute();
    this.say(`${s.club.name} switch to a ${f.name}.`, 'info', side);
  }

  /** Move a player to another slot; whoever is there swaps with him. */
  movePlayer(side: 0 | 1, playerId: number, toIdx: number): boolean {
    const s = this.sides[side];
    const f = getFormation(s.formation);
    const o = s.active.find((x) => x.p.id === playerId);
    if (!o || toIdx < 0 || toIdx >= f.slots.length || o.idx === toIdx) return false;
    const other = s.active.find((x) => x.idx === toIdx);
    if (other) {
      other.idx = o.idx;
      other.slot = f.slots[other.idx];
      other.role = POS_ROLE[other.slot];
    }
    o.idx = toIdx;
    o.slot = f.slots[toIdx];
    o.role = POS_ROLE[o.slot];
    this.recompute();
    return true;
  }

  /** Hand a side to (or take it back from) the manager's assistant. */
  setHuman(side: 0 | 1, human: boolean): void {
    this.sides[side].human = human;
    // The assistant deals at once with anyone left on injured.
    if (!human) {
      const s = this.sides[side];
      for (const o of [...s.active]) {
        if (!o.injured) continue;
        const on = this.bestBenchFor(s, o.slot);
        if (on && this.canSub(side)) this.doSub(s, o, on, o.idx);
      }
    }
  }

  /** The assistant's advice after one of the manager's players is injured. */
  suggestForInjury(side: 0 | 1, playerId: number): SubSuggestion | null {
    const s = this.sides[side];
    const o = s.active.find((x) => x.p.id === playerId);
    if (!o || !this.canSub(side)) return null;
    const on = this.bestBenchFor(s, o.slot);
    return on ? { offId: o.p.id, onId: on.id, intoIdx: o.idx } : null;
  }

  /**
   * The assistant's advice after a red card: if the gap is in defence or midfield, fill it
   * by taking off the most tired or least effective attacker. A gap up front needs no change.
   */
  suggestForRed(side: 0 | 1, playerId: number): SubSuggestion | null {
    const s = this.sides[side];
    const gone = s.sentOff.find((x) => x.playerId === playerId);
    if (!gone || gone.slot === 'GK' || !this.canSub(side) || !this.vacantSlots(side).includes(gone.idx)) return null;
    const role = POS_ROLE[gone.slot];
    if (SHARE[role][2] >= 0.7) return null;
    const attackers = s.active.filter((o) => o.slot !== 'GK' && SHARE[o.role][2] >= 0.7);
    if (attackers.length < 2) return null;
    const off = attackers.sort((a, b) => (a.cond / 20 + a.rating) - (b.cond / 20 + b.rating))[0];
    const on = this.bestBenchFor(s, gone.slot);
    return on ? { offId: off.p.id, onId: on.id, intoIdx: gone.idx } : null;
  }

  /** AI managers react to the scoreline in the last half-hour. */
  private aiTouchline(): void {
    if (this.minute < 60) return;
    for (const s of this.sides) {
      if (!s.ai) continue;
      const diff = this.lead(s);
      let want: Mentality = s.tactics.mentality;
      if (diff < 0) want = 'attacking';
      else if (diff > 0 && this.minute >= 75) want = 'defensive';
      if (want !== s.tactics.mentality) this.setMentality(s.idx, want);
    }
  }

  /** Assistants and AI managers make changes in the second half, one or two at a time. */
  private autoSubs(): void {
    if (this.minute < 55) return;
    for (const s of this.sides) {
      if (s.human || !this.canSub(s.idx)) continue;
      if (!this.rng.chance(this.minute >= 70 ? 0.2 : 0.08)) continue;
      // The manager's assistant, once he takes over: a poor reader of the game misses his moment or
      // takes off the wrong man, and a poor judge misreads who is struggling. A top one makes no slips.
      const a = s.asst;
      const slip = a ? Math.max(0, 20 - a.read) / 40 : 0;
      if (slip && this.arng.chance(slip * 0.5)) continue;
      const lastWindow = this.windowsLeft(s.idx) <= 1;
      const want = lastWindow ? s.subsLeft : Math.min(s.subsLeft, this.rng.chance(0.55) ? 2 : 1);
      const seen = (o: OnPitch) => (o.cond + o.rating * 4) * misjudge(a, o.p.id, 'form');
      let tired = [...s.active]
        .filter((o) => o.slot !== 'GK')
        .sort((x, y) => seen(x) - seen(y));
      if (slip && this.arng.chance(slip)) tired = this.arng.shuffle(tired);
      let made = 0;
      for (const o of tired) {
        if (made >= want || !this.canSub(s.idx)) break;
        // Fresh players doing well stay on until the closing stages.
        if (o.cond > 72 && o.rating > 6.2 && this.minute < 80) break;
        const on = this.bestBenchFor(s, o.slot);
        if (!on) break;
        this.doSub(s, o, on, o.idx);
        made++;
      }
    }
  }

  /** Live snapshot for the UI, in formation order. */
  livePlayers(side: 0 | 1): LivePlayer[] {
    return this.sides[side].active
      .map((o) => ({ p: o.p, idx: o.idx, slot: o.slot, cond: o.cond, rating: o.rating, yellow: o.yellow, goals: o.goals, injured: o.injured }))
      .sort((a, b) => a.idx - b.idx);
  }

  formationOf(side: 0 | 1): string {
    return this.sides[side].formation;
  }

  /** Substitutions made so far by a side, in order. */
  subsMade(side: 0 | 1): MatchEvent[] {
    return this.events.filter((e) => e.kind === 'sub' && e.side === side);
  }

  benchPlayers(side: 0 | 1): Player[] {
    return this.sides[side].bench;
  }

  subsLeft(side: 0 | 1): number {
    return this.sides[side].subsLeft;
  }

  outcome(): MatchOutcome {
    const [h, a] = this.sides;
    const ratings: Record<number, number> = {};
    const conditions: Record<number, number> = {};
    for (const s of this.sides) {
      const other = s === h ? a : h;
      const res = s.goals > other.goals ? 0.3 : s.goals < other.goals ? -0.3 : 0;
      for (const o of s.appeared) {
        let r = o.rating + res;
        if (other.goals === 0 && (o.slot === 'GK' || SHARE[o.role][0] >= 0.7)) r += 0.55;
        r += (slotRating(o.p, o.slot) - 13) * 0.04;
        ratings[o.p.id] = Math.round(clamp(r, 3, 10) * 10) / 10;
        conditions[o.p.id] = Math.round(o.cond);
      }
    }
    let motm = -1;
    let best = -1;
    for (const id in ratings) {
      if (ratings[id] > best) { best = ratings[id]; motm = Number(id); }
    }
    const total = h.possession + a.possession || 1;
    const hp = Math.round((h.possession / total) * 100);
    const summary: MatchSummary = {
      hg: h.goals,
      ag: a.goals,
      events: this.events,
      stats: {
        possession: [hp, 100 - hp],
        shots: [h.shots, a.shots],
        onTarget: [h.onTarget, a.onTarget],
        corners: [h.corners, a.corners],
        fouls: [h.fouls, a.fouls],
        offsides: [h.offsides, a.offsides],
      },
      ratings,
      lineups: [h.appeared.filter((o) => o.started).map((o) => o.p.id), a.appeared.filter((o) => o.started).map((o) => o.p.id)],
      motm,
      attendance: this.attendance,
    };
    if (this.phase !== 'normal' && this.opts.knockout?.extraTime) summary.aet = true;
    if (this.shoot) {
      summary.pens = this.shootout!;
      summary.kicks = this.shoot.kicks;
    }
    if (this.opts.neutral) summary.venue = this.opts.neutral.venue;
    if (this.opts.commentary) summary.commentary = this.lines;
    const an = this.analysisNow();
    if (an) summary.analysis = an;
    return { summary, conditions, injuries: this.injuries };
  }
}
