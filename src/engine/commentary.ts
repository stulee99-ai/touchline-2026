import { Rng } from './rng.js';

/**
 * Text commentary in the spirit of the classic text-only match engines.
 * Kept separate from the simulation so the wording can grow without touching the maths.
 *
 * Placeholders: {s} shooter, {a} provider, {d} defender, {k} keeper, {t} penalty taker,
 * {team} side in possession, {opp} the other side, {foot} "left"/"right", {p}/{q} any two players.
 */

export type ChanceType = 'through' | 'cross' | 'long' | 'box' | 'corner' | 'freekick' | 'penalty' | 'counter';

export type Fill = Record<string, string>;

function fill(t: string, f: Fill): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => f[k] ?? k);
}

const BUILD: Record<ChanceType, string[]> = {
  through: [
    '{a} threads a pass through the defence for {s}...',
    '{a} spots the run and slides {s} in behind...',
    'Lovely ball over the top from {a}! {s} is away...',
    '{s} beats the offside trap, {a} finds him...',
    '{a} splits the centre-backs with a perfectly weighted pass. {s} is clean through...',
    '{s} darts between {d} and his partner, and {a} picks him out...',
    '{a} looks up and lofts it over the top for {s} to chase...',
  ],
  counter: [
    '{team} break at pace! {a} carries it forward and releases {s}...',
    'Quick counter-attack from {team}! {a} finds {s} in acres of space...',
    '{team} win it back and go straight for the jugular. {s} is through...',
    '{opp} are caught short at the back! {a} to {s}, three against two...',
    'Lightning break! {a} sprints into the {opp} half and slips in {s}...',
  ],
  cross: [
    '{a} whips in a cross from the flank...',
    '{a} gets to the byline and hangs one up for {s}...',
    'Deep cross from {a}, {s} rises...',
    '{a} swings it in towards the far post...',
    '{a} beats his man and fizzes a low cross into the six-yard box...',
    'Early ball in from {a}! {s} has made a run to the near post...',
    '{a} chips a cross to the back stick where {s} is lurking...',
  ],
  long: [
    '{s} picks it up 30 yards out and lets fly...',
    'Space opens up for {s} on the edge of the box...',
    '{s} shifts it onto his {foot} foot and tries his luck from distance...',
    '{a} lays it back to {s}, who hits it first time...',
    'The ball breaks to {s} 25 yards out. He shoots...',
    '{s} is given too much room by {d} and has a go from range...',
    'Half-cleared corner falls to {s} on the edge of the area...',
  ],
  box: [
    'Scramble in the box! It drops to {s}...',
    '{a} cuts it back and {s} is waiting...',
    'Quick one-two between {a} and {s} on the edge of the area...',
    '{s} turns {d} inside the box...',
    '{a} squares it across the six-yard box for {s}...',
    '{s} goes past one, then another, and he\'s into the area...',
    'Neat interplay from {team}, {a} finds {s} unmarked at the penalty spot...',
    '{d} is caught in possession by {s}! He\'s in the box...',
  ],
  corner: [
    '{a} swings in the corner... {s} attacks it...',
    'Corner from {a}, it\'s flicked on towards {s}...',
    'In comes the corner from {a}, {s} gets up highest...',
    'Short corner, {a} to the edge, and it\'s curled in for {s}...',
    '{a} drills the corner in low to the near post... {s}...',
  ],
  freekick: [
    'Free kick in a dangerous position. {s} stands over it...',
    '{s} lines up the free kick from 22 yards...',
    'Foul on the edge of the box. {s} fancies this one...',
    '{s} steps up to take the free kick. The wall is set...',
  ],
  penalty: [
    'PENALTY! {d} brings down {s} in the box! {t} steps up...',
    'The referee points to the spot! {d} has clipped {s}. {t} to take...',
    'Handball! The referee gives a penalty against {opp}. {t} places the ball...',
    '{s} is tripped by {d} and it\'s a spot-kick! {t} will take it...',
  ],
};

const GOAL: Record<ChanceType, string[]> = {
  through: ['...rounds the keeper and slots it home! GOAL!', '...and calmly slides it past {k}! GOAL!', '...chips it over the advancing {k}! GOAL!', '...opens up his body and curls it into the far corner! GOAL!', '...fires it through {k}\'s legs! GOAL!'],
  counter: ['...and he finishes it off with ease! GOAL!', '...draws {k} and squares it... no, he keeps it and scores! GOAL!', '...smashes it past {k} at the near post! GOAL!', '...a textbook counter-attack, finished with his {foot} foot! GOAL!'],
  cross: ['...and heads it powerfully into the net! GOAL!', '...glancing header, {k} can\'t reach it! GOAL!', '...volleys it in at the far post! GOAL!', '...stoops to head it home! GOAL!', '...gets in front of {d} and nods it in! GOAL!'],
  long: ['...it flies into the top corner! What a strike! GOAL!', '...a dipping effort that beats {k}! GOAL!', '...it takes a deflection off {d} and loops in! GOAL!', '...an absolute thunderbolt with his {foot} foot! GOAL!', '...it swerves and {k} can only watch it go in! GOAL!'],
  box: ['...and he buries it! GOAL!', '...side-foots it into the bottom corner! GOAL!', '...smashes it into the roof of the net! GOAL!', '...pokes it home from close range! GOAL!', '...finds the corner with his {foot} foot! GOAL!', '...a clinical finish, {k} had no chance! GOAL!'],
  corner: ['...and powers his header in! GOAL!', '...bundles it over the line! GOAL!', '...near-post flick, it\'s in! GOAL!', '...rises above {d} and thumps it in! GOAL!'],
  freekick: ['...over the wall and in! GOAL!', '...curls it around the wall into the net! GOAL!', '...whips it into the top corner! {k} is rooted to the spot! GOAL!'],
  penalty: ['...sends {k} the wrong way. GOAL!', '...blasts it down the middle. GOAL!', '...tucks it into the corner. GOAL!', '...{k} gets a hand to it but can\'t keep it out! GOAL!'],
};

const SAVED: Record<ChanceType, string[]> = {
  through: ['...but {k} spreads himself and saves!', '...{k} comes out quickly and smothers it.', '...shoots, but {k} gets a strong hand to it!', '...{k} stands tall and blocks!'],
  counter: ['...but {k} is equal to it!', '...{k} races off his line to save!', '...shot saved by {k}, what a chance that was!'],
  cross: ['...header straight at {k}.', '...but {k} tips it over the bar!', '...{k} claws it away!', '...{k} plucks it out of the air.'],
  long: ['...{k} gathers comfortably.', '...{k} pushes it round the post.', '...fine save by {k}, diving to his left!', '...{k} tips it over the bar at full stretch!'],
  box: ['...point-blank save from {k}!', '...{k} blocks with his legs!', '...{k} parries it away!', '...straight at {k}.', '...{k} gets down well to save!'],
  corner: ['...header is held by {k}.', '...{k} punches clear under pressure.', '...{k} claws it off the line!'],
  freekick: ['...{k} tips it over!', '...{k} holds on to it.', '...{k} is behind it all the way.'],
  penalty: ['...SAVED! {k} guesses right!', '...{k} dives low and keeps it out!', '...{k} saves it with his feet!'],
};

const MISSED: Record<ChanceType, string[]> = {
  through: ['...but drags it wide of the post.', '...shoots over the bar! He should have scored.', '...{d} gets back to make a superb tackle.', '...but he takes too long and {d} nicks it away.'],
  counter: ['...but the final ball is poor and {d} cuts it out.', '...wide! {team} will be kicking themselves.', '...{d} gets back brilliantly to block.'],
  cross: ['...but heads it over.', '...{d} gets there first and clears.', '...it\'s just too high for him.', '...he can\'t get enough on it and it goes wide.'],
  long: ['...well over the bar.', '...wide of the target.', '...blocked by {d}.', '...skews it into the stand.', '...just over! The crowd thought that was in.'],
  box: ['...fires it wide!', '...blocked by {d}!', '...scuffs his shot and it rolls wide.', '...over the bar from close range!', '...{d} throws himself in front of it!'],
  corner: ['...heads it wide.', '...{d} clears the danger.', '...it\'s cleared off the line by {d}!', '...the flag is up for a foul on the keeper.'],
  freekick: ['...into the wall.', '...just over the crossbar.', '...wide of the post.'],
  penalty: ['...MISSES! It\'s over the bar!', '...hits the post and bounces away!', '...drags it wide! What a let-off for {opp}!'],
};

const WOODWORK = [
  '...OFF THE POST! So close!',
  '...CRASHES AGAINST THE BAR!',
  '...it hits the inside of the post and comes back out!',
  '...off the crossbar! {k} was beaten.',
];

const CELEBRATE = [
  '{s} wheels away in celebration.',
  '{s} runs to the {team} fans.',
  '{s} is mobbed by his team-mates.',
  'The {team} bench is on its feet.',
  '{s} slides on his knees in front of the away end.',
];

const OFFSIDE = [
  '{s} is caught offside. The trap works for {opp}.',
  'The flag goes up. {s} mistimed his run.',
  '{opp} step up together and {s} is left offside.',
];

const FILLER_COMMON = [
  '{p} plays it short to {q}.',
  '{p} carries it forward.',
  '{p} tries to find {q} but it\'s cut out.',
  '{p} switches play to {q}.',
  'Good tackle by {p}.',
  '{p} clears his lines.',
  '{team} are enjoying a spell of possession.',
  '{p} goes down after a challenge, but the referee waves play on.',
  '{p} tries a pass down the line for {q}, but it runs out of play.',
  '{p} wins a header in midfield.',
  '{p} is dispossessed by {x}.',
  'Throw-in to {team} deep in their own half.',
  '{p} takes a touch and looks for options.',
  '{p} plays a one-two with {q}.',
];
const FILLER_SHORT = ['{team} knock it around patiently at the back.', 'Neat, short passing from {team}.', '{p} and {q} exchange passes in midfield.'];
const FILLER_LONG = ['{p} goes long, looking for {q}.', '{team} hit it long early.', '{p} launches it forward.'];
const FILLER_PRESS = ['{team} are pressing high up the pitch.', '{p} closes down {x} quickly.', '{team} hunt the ball in packs.'];
const FILLER_CROWD = ['The crowd are getting behind {team}.', 'A chorus of boos for {x} after that challenge.', 'The home fans are growing restless.'];

export function buildLine(rng: Rng, type: ChanceType, f: Fill): string {
  return fill(rng.pick(BUILD[type]), f);
}
export function goalLine(rng: Rng, type: ChanceType, f: Fill): string {
  return fill(rng.pick(GOAL[type]), f);
}
export function savedLine(rng: Rng, type: ChanceType, f: Fill): string {
  return fill(rng.pick(SAVED[type]), f);
}
export function missedLine(rng: Rng, type: ChanceType, f: Fill): string {
  return fill(rng.pick(MISSED[type]), f);
}
export function woodworkLine(rng: Rng, f: Fill): string {
  return fill(rng.pick(WOODWORK), f);
}
export function celebrateLine(rng: Rng, f: Fill): string {
  return fill(rng.pick(CELEBRATE), f);
}
const OFFSIDE_TECH = [
  'The flag goes up, and the semi-automated offside system confirms it: {s} was ahead by {cm}cm.',
  'Offside! The semi-automated technology gets the decision to the referee in seconds. {s} was {cm}cm beyond the last defender.',
  '{s} thought he was clean through, but the system says he was {cm}cm offside.',
];

/** A flag for offside; the semi-automated system is quoted on some of them. */
export function offsideLine(rng: Rng, f: Fill, trap = false): string {
  const cm = String(rng.int(2, 46));
  const pool = trap ? OFFSIDE : [...OFFSIDE, ...OFFSIDE_TECH, ...OFFSIDE_TECH];
  return fill(rng.pick(pool), { ...f, cm });
}
export function fillerLine(rng: Rng, f: Fill, style: { passing?: string; pressing?: boolean; home?: boolean }): string {
  const pool = [...FILLER_COMMON];
  if (style.passing === 'short') pool.push(...FILLER_SHORT, ...FILLER_SHORT);
  if (style.passing === 'long') pool.push(...FILLER_LONG, ...FILLER_LONG);
  if (style.pressing) pool.push(...FILLER_PRESS);
  if (style.home) pool.push(...FILLER_CROWD);
  return fill(rng.pick(pool), f);
}

/** "That's his 10th of the season!" and friends. */
export function milestoneLine(goalsInMatch: number, seasonGoals: number, name: string): string | null {
  if (goalsInMatch === 3) return `HAT-TRICK for ${name}!`;
  if (goalsInMatch === 2) return `That's his second of the afternoon!`;
  if (seasonGoals === 1) return `${name}'s first goal of the season.`;
  if (seasonGoals > 0 && seasonGoals % 5 === 0) return `That's ${name}'s ${seasonGoals}th league goal of the season.`;
  return null;
}
