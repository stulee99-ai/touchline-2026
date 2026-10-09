/**
 * The league pyramids: which divisions each country plays, and the rules for moving between them.
 * Pure data and lookups (no imports), so any module can use it.
 *
 * Only the top flight and the divisions listed here are played in full. Below the last of them is
 * a pool of clubs that isn't played (`state.pools`): it supplies the clubs that come up and takes
 * the ones that go down.
 */
export interface LevelSpec {
  id: string;
  country: string;
  tier: number;
  name: string;
  /** Short label for tabs and play-off names. */
  short: string;
  /** Division name in the club database (`LOWER[country]`). */
  division?: string;
  /** Number of clubs, when the database lists fewer or more than the division plays. */
  size?: number;
  /** Clubs left out of the division (reserve sides that can't be promoted). */
  exclude?: string[];
  /** Automatic promotion places, then the play-off places (1-based, inclusive), then relegation places. */
  up: number;
  playoff?: [number, number];
  down: number;
}

export interface PyramidSpec {
  country: string;
  /** Nationality of most generated players. */
  nation: string;
  imports: string[];
  /** What the unplayed division below the pyramid is called. */
  pool: string;
  /** Reputation range of a club that has just come up from the pool into the last played division. */
  entryRep: [number, number];
  levels: LevelSpec[];
}

export const PYRAMIDS: PyramidSpec[] = [
  {
    country: 'ENG', nation: 'ENG', imports: ['NGA', 'SEN', 'FRA', 'POR', 'ESP', 'NED', 'SCO', 'IRL', 'JAM', 'WAL'], pool: 'National League', entryRep: [1.3, 2.1],
    levels: [
      { id: 'ENG', country: 'ENG', tier: 1, name: 'Premier League', short: 'Premier League', up: 0, down: 3 },
      { id: 'EN2', country: 'ENG', tier: 2, name: 'Championship', short: 'Champ.', division: 'Championship', up: 2, playoff: [3, 6], down: 3 },
      { id: 'EN3', country: 'ENG', tier: 3, name: 'League One', short: 'L1', division: 'League One', up: 2, playoff: [3, 6], down: 4 },
      { id: 'EN4', country: 'ENG', tier: 4, name: 'League Two', short: 'L2', division: 'League Two', up: 3, playoff: [4, 7], down: 2 },
    ],
  },
  {
    country: 'ESP', nation: 'ESP', imports: ['FRA', 'POR', 'BRA', 'SEN', 'NGA', 'ITA', 'GER', 'NED'], pool: 'Primera Federación', entryRep: [2.3, 3.1],
    levels: [
      { id: 'ESP', country: 'ESP', tier: 1, name: 'La Liga', short: 'La Liga', up: 0, down: 3 },
      { id: 'ES2', country: 'ESP', tier: 2, name: 'Segunda División', short: 'Segunda', division: 'Segunda División', up: 2, playoff: [3, 6], down: 4 },
    ],
  },
  {
    country: 'GER', nation: 'GER', imports: ['TUR', 'POL', 'CRO', 'SRB', 'FRA', 'NGA', 'NED', 'CZE'], pool: '3. Liga', entryRep: [2.6, 3.4],
    levels: [
      { id: 'GER', country: 'GER', tier: 1, name: 'Bundesliga', short: 'Bundesliga', up: 0, down: 2 },
      { id: 'DE2', country: 'GER', tier: 2, name: '2. Bundesliga', short: '2. BL', division: '2. Bundesliga', up: 2, down: 3 },
    ],
  },
  {
    country: 'ITA', nation: 'ITA', imports: ['FRA', 'BRA', 'SEN', 'NGA', 'CRO', 'SRB', 'ESP', 'POR'], pool: 'Serie C', entryRep: [2.3, 3.1],
    levels: [
      { id: 'ITA', country: 'ITA', tier: 1, name: 'Serie A', short: 'Serie A', up: 0, down: 3 },
      { id: 'IT2', country: 'ITA', tier: 2, name: 'Serie B', short: 'Serie B', division: 'Serie B', up: 2, playoff: [3, 6], down: 4 },
    ],
  },
  {
    country: 'FRA', nation: 'FRA', imports: ['SEN', 'NGA', 'BRA', 'POR', 'ESP', 'ITA', 'GRE', 'NED'], pool: 'National', entryRep: [2.1, 2.9],
    levels: [
      { id: 'FRA', country: 'FRA', tier: 1, name: 'Ligue 1', short: 'Ligue 1', up: 0, down: 2 },
      { id: 'FR2', country: 'FRA', tier: 2, name: 'Ligue 2', short: 'Ligue 2', division: 'Ligue 2', up: 2, down: 3 },
    ],
  },
  {
    country: 'POR', nation: 'POR', imports: ['BRA', 'NGA', 'SEN', 'ESP', 'FRA', 'GRE', 'UKR', 'ITA'], pool: 'Liga 3', entryRep: [1.4, 2.2],
    levels: [
      { id: 'POR', country: 'POR', tier: 1, name: 'Primeira Liga', short: 'Primeira Liga', up: 0, down: 2 },
      { id: 'PT2', country: 'POR', tier: 2, name: 'Liga Portugal 2', short: 'Liga 2', division: 'Liga Portugal 2', size: 18, exclude: ['Benfica B', 'Porto B', 'Sporting CP B'], up: 2, down: 3 },
    ],
  },
];

/** Every division that is played, top flight first within each country. */
export const LEVELS: LevelSpec[] = PYRAMIDS.flatMap((p) => p.levels);

export const level = (id: string): LevelSpec | undefined => LEVELS.find((l) => l.id === id);
export const pyramidOf = (country: string): PyramidSpec | undefined => PYRAMIDS.find((p) => p.country === country);
/** A division's level in its country's pyramid (1 for a top flight). */
export const tierOf = (leagueId: string): number => level(leagueId)?.tier ?? 1;
/** True for every division below a top flight. */
export const isLowerLeague = (leagueId: string): boolean => tierOf(leagueId) > 1;
/** Display names for the country codes leagues are grouped under. */
export const COUNTRY_NAMES: Record<string, string> = { ENG: 'England', ESP: 'Spain', GER: 'Germany', ITA: 'Italy', FRA: 'France', POR: 'Portugal' };
export const leagueCountry = (leagueId: string): string => level(leagueId)?.country ?? leagueId;
