import { POS_ROLE, type Role } from './attributes.js';
import type { Attributes, Player } from './types.js';

/**
 * Player traits: the recognisable things a player does well (or badly). They are derived
 * from attributes so they follow a player as he develops and need no save data, with a
 * short list of real players whose reputation adds a trait their numbers alone might miss.
 * The match engine applies small modifiers (a few percent), never big swings.
 */
export type TraitId =
  | 'clinical' | 'poacher' | 'aerial' | 'longShots' | 'setPieces' | 'penalty' | 'playmaker'
  | 'crosser' | 'speedster' | 'dribbler' | 'ballWinner' | 'tireless' | 'shotStopper' | 'hothead' | 'brittle';

export interface TraitDef {
  label: string;
  /** What it does, in the words the manager sees. */
  blurb: string;
  good: boolean;
  test: (a: Attributes, role: Role) => boolean;
}

export const TRAIT_DEFS: Record<TraitId, TraitDef> = {
  clinical: { label: 'Clinical finisher', blurb: 'Converts chances more often than most.', good: true, test: (a, r) => r !== 'GK' && a.finishing >= 17 && a.composure >= 15 },
  poacher: { label: 'Poacher', blurb: 'Always in the right place; gets more shooting chances.', good: true, test: (a, r) => r === 'ST' && a.offTheBall >= 17 && a.finishing >= 15 },
  aerial: { label: 'Aerial threat', blurb: 'Dangerous from crosses and corners.', good: true, test: (a, r) => r !== 'GK' && a.heading >= 17 && a.jumping >= 15 },
  longShots: { label: 'Shoots from distance', blurb: 'More dangerous from outside the box.', good: true, test: (a, r) => r !== 'GK' && a.longShots >= 17 },
  setPieces: { label: 'Set-piece specialist', blurb: 'Free kicks and corners are better with him.', good: true, test: (a, r) => r !== 'GK' && a.setPieces >= 17 },
  penalty: { label: 'Penalty ace', blurb: 'Rarely misses from the spot.', good: true, test: (a, r) => r !== 'GK' && a.composure >= 17 && a.finishing >= 15 },
  playmaker: { label: 'Playmaker', blurb: 'Creates more of the team\'s chances.', good: true, test: (a, r) => r !== 'GK' && a.passing >= 17 && a.creativity >= 16 },
  crosser: { label: 'Delivers crosses', blurb: 'Sets up more goals from wide.', good: true, test: (a, r) => (r === 'FB' || r === 'WM' || r === 'AW' || r === 'AM') && a.crossing >= 17 },
  speedster: { label: 'Speedster', blurb: 'Lethal on the counter and in behind.', good: true, test: (a, r) => r !== 'GK' && (a.pace >= 18 || (a.pace >= 17 && a.acceleration >= 17)) },
  dribbler: { label: 'Runs with the ball', blurb: 'Beats his man, then finds the shot.', good: true, test: (a, r) => r !== 'GK' && a.dribbling >= 17 && a.flair >= 14 },
  ballWinner: { label: 'Ball winner', blurb: 'Breaks up more attacks.', good: true, test: (a, r) => r !== 'GK' && a.tackling >= 17 && a.workRate >= 15 },
  tireless: { label: 'Tireless', blurb: 'Tires more slowly than others.', good: true, test: (a, r) => r !== 'GK' && a.stamina >= 18 && a.workRate >= 17 },
  shotStopper: { label: 'Shot-stopper', blurb: 'Saves what others would not.', good: true, test: (a, r) => r === 'GK' && a.reflexes >= 17 },
  hothead: { label: 'Hot-headed', blurb: 'Commits more fouls and picks up more cards.', good: false, test: (a, r) => r !== 'GK' && a.aggression >= 17 && a.decisions <= 12 },
  brittle: { label: 'Injury prone', blurb: 'Spends more time on the treatment table.', good: false, test: (a) => a.injuryProneness >= 16 },
};

/** Reputation traits for real players, added on top of what their attributes earn. */
const EXTRA: Record<string, TraitId[]> = {
  'Erling Haaland': ['poacher', 'clinical'],
  'Cole Palmer': ['penalty', 'clinical'],
  'Bruno Fernandes': ['setPieces', 'penalty', 'playmaker'],
  'Dominik Szoboszlai': ['longShots', 'setPieces'],
  'Martin Ødegaard': ['playmaker'],
  'Florian Wirtz': ['playmaker', 'dribbler'],
  'Jérémy Doku': ['dribbler', 'speedster'],
  'Rayan Cherki': ['dribbler', 'playmaker'],
  'Jeremie Frimpong': ['speedster'],
  'Moisés Caicedo': ['ballWinner', 'tireless'],
  'Declan Rice': ['tireless', 'setPieces'],
  'Virgil van Dijk': ['aerial'],
  'Gabriel Magalhães': ['aerial'],
  'Chris Wood': ['aerial'],
  'Lisandro Martínez': ['hothead'],
  'Reece James': ['brittle', 'crosser'],
  'Pedro Porro': ['crosser'],
};

export function traitsOf(p: Player): TraitId[] {
  const role = POS_ROLE[bestOf(p)];
  const out = new Set<TraitId>();
  for (const id in TRAIT_DEFS) if (TRAIT_DEFS[id as TraitId].test(p.attrs, role)) out.add(id as TraitId);
  for (const id of EXTRA[`${p.firstName} ${p.lastName}`.trim()] ?? []) out.add(id);
  return [...out];
}

function bestOf(p: Player) {
  let best = 'MC' as keyof Player['pos'];
  let bf = -1;
  for (const k of Object.keys(p.pos) as (keyof Player['pos'])[]) {
    if ((p.pos[k] ?? 0) > bf) { bf = p.pos[k]!; best = k; }
  }
  return best;
}
