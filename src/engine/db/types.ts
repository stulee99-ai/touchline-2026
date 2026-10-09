/** Shared shapes for the real-world database files. */

/** [shirt (0 = unknown), 'First Last' (or 'First|Last'), positions, nation, born YYYYMM, CA, PA?] */
export type DbPlayer = [number, string, string, string, number, number, number?];

export interface DbClub {
  name: string;
  short: string;
  colours: [string, string];
  stadium: string;
  capacity: number;
  /** 1–10, on one scale across all leagues. */
  reputation: number;
  formation: string;
  squad: DbPlayer[];
}

export interface DbLeague {
  /** Country code, also used as the league id: ENG, ESP, GER, ITA, FRA, POR. */
  id: string;
  name: string;
  country: string;
  /** Nationality code for youth intakes and generated players. */
  nation: string;
  clubs: DbClub[];
}
