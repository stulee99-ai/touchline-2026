/**
 * All leagues in the game, in the order they appear on the new-game screen.
 * A player listed by two clubs (sources can lag behind transfers) is kept at the first
 * club encountered, so leagues built from fresher sources come first.
 */
import { BUNDESLIGA } from './bundesliga-2026.js';
import { LALIGA } from './laliga-2026.js';
import { LIGUE1 } from './ligue1-2026.js';
import { PREMIER_LEAGUE } from './premier-league-2026.js';
import { PRIMEIRA } from './primeira-2026.js';
import { SERIE_A } from './seriea-2026.js';
import type { DbLeague } from './types.js';

export const SEASON = 2026;

export const LEAGUES: DbLeague[] = [PREMIER_LEAGUE, LALIGA, BUNDESLIGA, SERIE_A, LIGUE1, PRIMEIRA];
