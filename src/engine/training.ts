import { ATTR_LABEL, computeCA, GOALKEEPING, MENTAL, PHYSICAL, TECHNICAL } from './attributes.js';
import { CAMP_FROM, CAMP_TO, REPORT_DAY } from './calendar.js';
import { INJURIES } from './data.js';
import { expectedRevenue, fmtMoney, niceMoney } from './finance.js';
import { addNews, dateOf, userClub } from './game.js';
import { clamp, Rng } from './rng.js';
import type { AttrKey, CampKey, Club, DrillKey, Fixture, GameState, Player, Pos, TeamFocus, TrainingPlan, Workload } from './types.js';

/**
 * Training: match sharpness, tactical familiarity, drills, individual attribute work and
 * position retraining. The manager's club follows his programme; every other club trains
 * at a standard level.
 */

export { DEFAULT_SHARP, sharpOf } from './prep.js';
import { sharpOf } from './prep.js';

/** Most players who can have an individual programme at once. */
export const MAX_INDIVIDUAL = 6;

export const WORKLOADS: { key: Workload; label: string; note: string }[] = [
  { key: 'light', label: 'Light', note: 'Slow sharpness, quick recovery, few training injuries.' },
  { key: 'normal', label: 'Normal', note: 'The standard load.' },
  { key: 'heavy', label: 'Heavy', note: 'Builds sharpness fastest, but drains condition and risks more injuries.' },
];
const WL: Record<Workload, { gain: number; drain: number; injury: number; learn: number }> = {
  light: { gain: 0.6, drain: -0.6, injury: 0.5, learn: 0.75 },
  normal: { gain: 1, drain: 0, injury: 1, learn: 1 },
  heavy: { gain: 1.5, drain: 1.0, injury: 2.2, learn: 1.2 },
};

export const DRILLS: { key: DrillKey; label: string; note: string }[] = [
  { key: 'passing', label: 'Passing style', note: 'Short or long, the side plays it better.' },
  { key: 'pressing', label: 'Closing down', note: 'Pressing costs less energy and wins the ball higher up.' },
  { key: 'counter', label: 'Counter attack', note: 'Breaks are quicker and more direct.' },
  { key: 'offside', label: 'Offside trap', note: 'The line steps up together, so fewer runners get through.' },
  { key: 'tackling', label: 'Hard tackling', note: 'Fewer fouls and cards when the side tackles hard.' },
];

export const FOCUSES: { key: TeamFocus; label: string; note: string }[] = [
  { key: 'balanced', label: 'Balanced', note: 'A bit of everything.' },
  { key: 'fitness', label: 'Fitness', note: 'Sharpness comes 35% faster and training injuries are rarer.' },
  { key: 'tactics', label: 'Tactics', note: 'The side gets used to your formation faster.' },
  ...DRILLS.map((d) => ({ key: d.key as TeamFocus, label: `Drill: ${d.label}`, note: d.note })),
];

export interface Camp {
  key: CampKey;
  label: string;
  note: string;
  fitness: number;
  tactics: number;
  injury: number;
}
export const CAMPS: Camp[] = [
  { key: 'home', label: 'Train at the club', note: 'Free. A standard two weeks of work.', fitness: 1, tactics: 1, injury: 1 },
  { key: 'spain', label: 'Warm-weather camp (Spain)', note: 'Better facilities: fitness and tactical work both go faster.', fitness: 1.3, tactics: 1.25, injury: 1 },
  { key: 'austria', label: 'Altitude camp (Austria)', note: 'The best fitness gains, but tougher on the body.', fitness: 1.55, tactics: 1, injury: 1.2 },
  { key: 'tour', label: 'Commercial tour (USA and Asia)', note: 'Big clubs earn a lot from sponsors and appearances. Less training gets done.', fitness: 0.85, tactics: 0.85, injury: 1 },
];
export const campOf = (k: CampKey): Camp => CAMPS.find((c) => c.key === k)!;

/** What a camp costs, and what a tour brings in. */
export function campMoney(state: GameState, c: Club, key: CampKey): { cost: number; income: number } {
  const rev = expectedRevenue(state, c);
  if (key === 'home') return { cost: 0, income: 0 };
  if (key === 'spain') return { cost: niceMoney(rev * 0.004), income: 0 };
  if (key === 'austria') return { cost: niceMoney(rev * 0.005), income: 0 };
  return { cost: niceMoney(rev * 0.004), income: niceMoney(rev * 0.012 * clamp((c.reputation - 3) / 6, 0.05, 1)) };
}

export function defaultPlan(c: Club, season: number): TrainingPlan {
  return {
    workload: 'normal',
    focus: 'balanced',
    camp: 'home',
    confirmed: season - 1,
    fam: { [c.tactics.formation]: 75 },
    drills: { passing: 50, pressing: 50, counter: 50, offside: 50, tackling: 50 },
  };
}

export function planOf(state: GameState, c: Club): TrainingPlan {
  return (c.training ??= defaultPlan(c, state.season));
}

/** How familiar the manager's side is with a formation. Unused formations start at 60. */
export const famWith = (plan: TrainingPlan, formation: string): number => plan.fam[formation] ?? 60;

export const AI_PLAN: TrainingPlan = defaultPlan({ tactics: { formation: '' } } as Club, 0);

/* ───────────────────────── The summer ───────────────────────── */

/** The first day of real (non-friendly) football for the manager's club. */
export function firstCompetitiveDay(state: GameState): number {
  let best = Infinity;
  const mine = state.userClubId;
  for (const f of state.fixtures) {
    if (f.comp === 'FRI' || (mine && f.homeId !== mine && f.awayId !== mine)) continue;
    if (f.day < best) best = f.day;
  }
  return best === Infinity ? 21 : best;
}

/** Players' sharpness after the summer break. */
export function holidaySharp(rng: Rng, p: Player): number {
  return clamp(Math.round(48 + p.attrs.naturalFitness * 0.6 + rng.next() * 6), 40, 70);
}

/** The pre-season plan is waiting for the manager: players are back and he hasn't set the camp. */
export function preseasonPending(state: GameState): boolean {
  const me = userClub(state);
  if (state.day < REPORT_DAY || state.day >= firstCompetitiveDay(state)) return false;
  return planOf(state, me).confirmed < state.season;
}

/** The day the calendar should stop at for the pre-season plan, if it hasn't been set yet. */
export function preseasonStop(state: GameState): number | null {
  if (state.userClubId === 0) return null;
  const me = userClub(state);
  if (state.day < REPORT_DAY && planOf(state, me).confirmed < state.season && firstCompetitiveDay(state) > REPORT_DAY) return REPORT_DAY;
  return null;
}

/** Settle the training camp and programme, and pay for the camp. Returns an error message, or null. */
export function confirmPreseason(state: GameState, camp: CampKey): string | null {
  const me = userClub(state);
  const plan = planOf(state, me);
  if (plan.confirmed >= state.season) return 'The pre-season plan is already set.';
  if (state.day > CAMP_FROM) return 'It is too late to arrange a camp.';
  const { cost, income } = campMoney(state, me, camp);
  if (cost > me.finance.balance + me.finance.transferBudget) return `The club can't afford the ${fmtMoney(cost)} camp.`;
  plan.camp = camp;
  plan.confirmed = state.season;
  me.finance.balance -= cost;
  me.finance.ledger.operating += cost;
  if (income) {
    me.finance.balance += income;
    me.finance.ledger.sponsorship += income;
  }
  const c = campOf(camp);
  addNews(state, {
    kind: 'training',
    title: `Pre-season: ${c.label}`,
    body: camp === 'home'
      ? 'The squad will do its pre-season work at the training ground.'
      : `The squad heads off from 12 July. The trip costs ${fmtMoney(cost)}${income ? ` and brings in ${fmtMoney(income)} from sponsors and appearances` : ''}.`,
  });
  return null;
}

export function setWorkload(state: GameState, w: Workload): void {
  planOf(state, userClub(state)).workload = w;
}
export function setFocus(state: GameState, f: TeamFocus): void {
  planOf(state, userClub(state)).focus = f;
}

/* ───────────────────────── Every day ───────────────────────── */

function focusMults(plan: TrainingPlan, day: number): { sharp: number; tactics: number; inj: number } {
  const camp = plan.confirmed >= 0 && day >= CAMP_FROM && day <= CAMP_TO && plan.camp !== 'home' ? campOf(plan.camp) : null;
  const f = plan.focus;
  return {
    sharp: (f === 'fitness' ? 1.35 : f === 'tactics' ? 0.85 : f === 'balanced' ? 1 : 0.9) * (camp?.fitness ?? 1),
    tactics: (f === 'tactics' ? 4 : 1) * (camp?.tactics ?? 1),
    inj: (f === 'fitness' ? 0.85 : 1) * (camp?.injury ?? 1),
  };
}

/** One day of training for every club. Called as the calendar advances. */
export function trainingDay(state: GameState, rng: Rng, day: number): void {
  const onBreak = day < REPORT_DAY;
  for (const c of state.clubs) {
    if (c.external) continue;
    const mine = c.id === state.userClubId;
    const plan = mine ? planOf(state, c) : AI_PLAN;
    const w = WL[plan.workload];
    const m = focusMults(plan, day);
    for (const id of c.playerIds) {
      const p = state.players[id];
      if (!p || p.clubId !== c.id) continue;
      let s = sharpOf(p);
      if (onBreak) {
        s += (45 - s) * 0.02;
      } else if (p.injury) {
        s = Math.max(45, s - 0.35);
      } else {
        s += (100 - s) * 0.02 * w.gain * m.sharp;
        // Hard graft tires legs; easy days aid recovery (recovery itself is applied by the calendar).
        if (w.drain) p.condition = clamp(p.condition - w.drain, 25, 100);
        const risk = 0.0002 * (0.4 + p.attrs.injuryProneness / 12) * w.injury * m.inj;
        if (rng.chance(risk)) {
          const def = INJURIES[rng.weighted(INJURIES.slice(0, 6).map((_, i) => 10 - i * 1.2))];
          p.injury = { name: def.name, days: rng.int(def.min * 7 - 3, def.max * 7), seen: false };
          if (mine) {
            const wk = Math.max(1, Math.ceil(p.injury.days / 7));
            addNews(state, { kind: 'injury', title: `${`${p.firstName} ${p.lastName}`.trim()} hurt in training`, body: `${p.lastName} has a ${def.name.toLowerCase()} and will be out for about ${wk} week${wk > 1 ? 's' : ''}.` });
          }
        }
      }
      p.sharp = Math.min(100, s);
    }
  }
  if (state.userClubId === 0) return;
  // The manager's side: formation familiarity and drills.
  const me = userClub(state);
  const plan = planOf(state, me);
  if (onBreak) return;
  const w = WL[plan.workload];
  const m = focusMults(plan, day);
  const cur = me.tactics.formation;
  const fam = famWith(plan, cur);
  plan.fam[cur] = Math.min(100, fam + (100 - fam) * 0.006 * m.tactics * w.gain);
  for (const f of Object.keys(plan.fam)) if (f !== cur) plan.fam[f] = Math.max(45, plan.fam[f] - 0.04);
  for (const d of DRILLS) {
    const v = plan.drills[d.key];
    plan.drills[d.key] = plan.focus === d.key ? v + (100 - v) * 0.022 * w.gain * (campOf(plan.camp).tactics > 1 && day >= CAMP_FROM && day <= CAMP_TO ? 1.25 : 1) : v + (50 - v) * 0.003;
  }
}

/* ───────────────────────── Every week ───────────────────────── */

export const isTrainableAttr = (k: AttrKey): boolean =>
  ![...['naturalFitness', 'determination', 'aggression', 'consistency', 'importantMatches', 'injuryProneness']].includes(k);

/** The attributes a player can work on: outfielders the outfield ones, keepers the goalkeeping ones. */
export function trainableAttrs(p: Player): AttrKey[] {
  const keeper = (p.pos.GK ?? 0) >= 15;
  return [...TECHNICAL, ...MENTAL, ...PHYSICAL, ...(keeper ? GOALKEEPING : [])].filter(isTrainableAttr);
}

const ageFactor = (p: Player, k: AttrKey): number => {
  const physical = PHYSICAL.includes(k);
  if (p.age <= 20) return 1.4;
  if (p.age <= 24) return 1.1;
  if (p.age <= 28) return physical ? 0.7 : 0.9;
  if (p.age <= 31) return physical ? 0.15 : 0.5;
  return physical ? 0.05 : 0.25;
};

/** Positions a player can most easily be moved between. */
const NEAR: Partial<Record<Pos, Partial<Record<Pos, number>>>> = {
  DL: { DR: 12, ML: 8, DC: 7 }, DR: { DL: 12, MR: 8, DC: 7 }, DC: { DM: 7, DL: 6, DR: 6 },
  DM: { MC: 9, DC: 7 }, MC: { DM: 9, AMC: 8, ML: 6, MR: 6 }, ML: { MR: 12, AML: 9, DL: 7, MC: 6 }, MR: { ML: 12, AMR: 9, DR: 7, MC: 6 },
  AMC: { MC: 8, ST: 6, AML: 6, AMR: 6 }, AML: { AMR: 12, ML: 9, ST: 6 }, AMR: { AML: 12, MR: 9, ST: 6 }, ST: { AMC: 6, AML: 5, AMR: 5 },
};

/** How far along a player already is at a position he is about to learn. */
export function retrainStart(p: Player, target: Pos): number {
  const have = p.pos[target] ?? 0;
  const near = Object.entries(NEAR[target] ?? {}).filter(([k]) => (p.pos[k as Pos] ?? 0) >= 15).map(([, v]) => v as number);
  return Math.max(have, near.length ? Math.max(...near) : 3);
}

/** Can this player be retrained to that position? Keepers stay keepers and outfielders stay out. */
export function canRetrain(p: Player, target: Pos): string | null {
  if ((p.pos.GK ?? 0) >= 15 || target === 'GK') return "Goalkeepers can't be retrained, and outfielders can't go in goal.";
  if ((p.pos[target] ?? 0) >= 20) return `${p.lastName} is already a natural ${target}.`;
  return null;
}

/** Months a retraining takes, from where the player starts. */
export function retrainMonths(p: Player, target: Pos): number {
  return Math.ceil((20 - retrainStart(p, target)) / retrainRate(p));
}

/** Familiarity points gained per month. */
export function retrainRate(p: Player): number {
  const learn = (p.attrs.anticipation + p.attrs.decisions + p.attrs.teamwork) / 3 / 12; // ~0.6–1.4
  const age = p.age <= 23 ? 1.2 : p.age <= 28 ? 1 : p.age <= 32 ? 0.75 : 0.5;
  return 0.8 * clamp(learn, 0.6, 1.4) * age;
}

export function individualCount(state: GameState): number {
  return userClub(state).playerIds.filter((id) => state.players[id]?.train).length;
}

export function setIndividual(state: GameState, playerId: number, train: Player['train'] | null): string | null {
  const me = userClub(state);
  const p = state.players[playerId];
  if (!p || !me.playerIds.includes(playerId)) return 'He is not in your squad.';
  if (!train) {
    delete p.train;
    return null;
  }
  if (!p.train && individualCount(state) >= MAX_INDIVIDUAL) return `Your coaches can only give ${MAX_INDIVIDUAL} players individual programmes at once.`;
  if ('pos' in train) {
    const err = canRetrain(p, train.pos);
    if (err) return err;
    p.train = { pos: train.pos, progress: retrainStart(p, train.pos) };
  } else {
    if (!trainableAttrs(p).includes(train.attr)) return `${ATTR_LABEL[train.attr]} can't be trained.`;
    if (p.attrs[train.attr] >= 20) return `${p.lastName}'s ${ATTR_LABEL[train.attr].toLowerCase()} is already as good as it gets.`;
    p.train = { attr: train.attr };
  }
  return null;
}

/** Weekly individual work for the manager's players: attributes creep up, new positions are learned. */
export function individualWeek(state: GameState, rng: Rng): void {
  const me = userClub(state);
  const w = WL[planOf(state, me).workload];
  const gains: string[] = [];
  for (const id of me.playerIds) {
    const p = state.players[id];
    if (!p?.train) continue;
    if (p.injury && p.injury.days > 14) continue; // long-term injured players can't do the work
    const name = `${p.firstName} ${p.lastName}`.trim();
    if ('attr' in p.train) {
      const k = p.train.attr;
      if (p.attrs[k] >= 20) continue;
      const prob = (0.1 / 4.345) * ageFactor(p, k) * (0.7 + p.attrs.determination / 25) * w.learn;
      if (rng.chance(prob)) {
        p.attrs[k] += 1;
        p.ca = computeCA(p);
        if (p.ca > p.pa) p.pa = p.ca;
        gains.push(`${name} (${ATTR_LABEL[k].toLowerCase()} ${p.attrs[k]})`);
      }
    } else {
      const t = p.train.pos;
      p.train.progress = Math.min(20, p.train.progress + retrainRate(p) * w.learn / 4.345);
      const lvl = Math.floor(p.train.progress + 1e-9);
      const old = p.pos[t] ?? 0;
      if (lvl > old) {
        p.pos[t] = lvl;
        if (old < 15 && lvl >= 15 && lvl < 20) gains.push(`${name} is now accomplished as a ${t}`);
        if (lvl >= 20) {
          delete p.train;
          p.ca = computeCA(p);
          addNews(state, { kind: 'training', title: `${p.lastName} has learned a new position`, body: `${name} is now a natural ${t} after a long spell of retraining.` });
        }
      }
    }
  }
  if (gains.length) addNews(state, { kind: 'training', title: 'Coaches\' training report', body: `Progress this week: ${gains.join('; ')}.` });
}

/* ───────────────────────── Matches ───────────────────────── */

/** Sharpness and tactical familiarity from playing. */
export function afterMatchTraining(state: GameState, clubId: number, started: number[], subbed: number[], friendly: boolean): void {
  for (const id of started) {
    const p = state.players[id];
    if (p) p.sharp = Math.min(100, sharpOf(p) + (friendly ? 4.5 : 3.5));
  }
  for (const id of subbed) {
    const p = state.players[id];
    if (p) p.sharp = Math.min(100, sharpOf(p) + (friendly ? 2.5 : 1.8));
  }
  if (clubId === state.userClubId) {
    const me = userClub(state);
    const plan = planOf(state, me);
    const f = me.tactics.formation;
    const fam = famWith(plan, f);
    plan.fam[f] = Math.min(100, fam + (100 - fam) * (friendly ? 0.1 : 0.05));
  }
}

/** A club has a new signing: the side takes a little while to bed in. */
export function newSigningSetback(state: GameState, c: Club): void {
  if (c.id !== state.userClubId) return;
  const plan = planOf(state, c);
  for (const f of Object.keys(plan.fam)) plan.fam[f] = Math.max(45, plan.fam[f] - 0.8);
}

/* ───────────────────────── Friendlies ───────────────────────── */

const satOnOrBefore = (season: number, day: number): number => {
  const dow = dateOf(season, day).getUTCDay(); // 0 = Sunday
  return day - ((dow + 1) % 7);
};

/** Four pre-season friendlies on the Saturdays before the season starts. */
export function scheduleFriendlies(state: GameState, rng: Rng): void {
  state.fixtures = state.fixtures.filter((f) => f.comp !== 'FRI');
  if (state.userClubId === 0) return;
  const me = userClub(state);
  const first = firstCompetitiveDay(state);
  let day = satOnOrBefore(state.season, first - 3);
  const days: number[] = [];
  while (days.length < 4 && day > REPORT_DAY + 10) {
    days.unshift(day);
    day -= 7;
  }
  const used = new Set<number>();
  const pool = state.clubs.filter((c) => !c.external && c.id !== me.id);
  const offsets = [-2.2, 0.3, -0.6, 1.6];
  let id = Math.max(0, ...state.fixtures.map((f) => f.id)) + 1;
  days.forEach((d, i) => {
    const want = me.reputation + offsets[i % offsets.length];
    // Nobody with a real match within a few days of the friendly.
    const busy = new Set<number>();
    for (const f of state.fixtures) if (f.comp !== 'FRI' && Math.abs(f.day - d) < 3) { busy.add(f.homeId); busy.add(f.awayId); }
    const pick = [...pool]
      .filter((c) => !used.has(c.id) && !busy.has(c.id))
      .sort((a, b) => Math.abs(a.reputation - want) + rng.next() * 0.9 - (Math.abs(b.reputation - want) + rng.next() * 0.9))[0];
    if (!pick) return;
    used.add(pick.id);
    const home = i % 2 === 0;
    const f: Fixture = {
      id: id++, comp: 'FRI', round: i, day: d, weekend: d, time: '15:00', tbc: false,
      homeId: home ? me.id : pick.id, awayId: home ? pick.id : me.id, result: null,
    };
    state.fixtures.push(f);
  });
}

/* ───────────────────────── Summer resets ───────────────────────── */

/** New season: the side loses some of its edge over the summer. */
export function newSeasonTraining(state: GameState): void {
  if (state.userClubId === 0) return;
  const me = userClub(state);
  const plan = planOf(state, me);
  plan.confirmed = state.season - 1;
  plan.camp = 'home';
  for (const d of DRILLS) plan.drills[d.key] = 50 + (plan.drills[d.key] - 50) * 0.6;
  for (const f of Object.keys(plan.fam)) plan.fam[f] = 60 + (plan.fam[f] - 60) * 0.7;
}

export function trainingSummary(state: GameState): { workload: Workload; focus: TeamFocus } {
  const plan = planOf(state, userClub(state));
  return { workload: plan.workload, focus: plan.focus };
}

