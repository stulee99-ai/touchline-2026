import type { DbPlayer } from './types.js';

/**
 * Well-known players without a club at the end of the summer 2026 window, from press lists of
 * the best free agents after deadline day. Ratings are Touchline's own estimates (older players
 * are rated on what they can still do). Row format as in premier-league-2026.ts.
 */
export const FREE_AGENTS_2026: DbPlayer[] = [
  [0, 'Jadon Sancho', 'AMR/AML/AMC', 'ENG', 200003, 150],
  [0, 'Paul Pogba', 'MC/DM', 'FRA', 199303, 138],
  [0, 'Karim Benzema', 'ST', 'FRA', 198712, 142],
  [0, 'Riyad Mahrez', 'AMR', 'ALG', 199102, 140],
  [0, 'Raheem Sterling', 'AML/AMR', 'ENG', 199412, 134],
  [0, 'Philippe Coutinho', 'AMC/AML', 'BRA', 199206, 126],
  [0, 'Dani Carvajal', 'DR', 'ESP', 199201, 148],
  [0, 'Jamie Vardy', 'ST', 'ENG', 198701, 122],
  [0, 'David Alaba', 'DC/DL', 'AUT', 199206, 148],
  [0, 'Sergio Ramos', 'DC', 'ESP', 198603, 126],
  [0, 'Oleksandr Zinchenko', 'DL/MC', 'UKR', 199612, 138],
  [0, 'Yves Bissouma', 'DM/MC', 'MLI', 199608, 146],
  [0, 'Tyrell Malacia', 'DL', 'NED', 199908, 128],
  [0, 'Wilfried Zaha', 'AML/AMR', 'CIV', 199211, 130],
  [0, 'Anthony Martial', 'ST/AML', 'FRA', 199512, 126],
  [0, 'Chris Smalling', 'DC', 'ENG', 198911, 122],
  [0, 'Renato Sanches', 'MC', 'POR', 199708, 138],
  [0, 'Raphaël Guerreiro', 'DL/MC', 'POR', 199312, 142],
  [0, 'Marcelo Brozović', 'DM/MC', 'CRO', 199211, 136],
  [0, 'James Rodríguez', 'AMC', 'COL', 199107, 128],
  [0, 'Neto', 'GK', 'BRA', 198907, 128],
  [0, 'Mauro Icardi', 'ST', 'ARG', 199302, 136],
  [0, 'Georginio Wijnaldum', 'MC', 'NED', 199011, 128],
  [0, 'Dele Alli', 'AMC/MC', 'ENG', 199604, 122],
];
