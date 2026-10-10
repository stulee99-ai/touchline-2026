/** Core data model. Everything here is plain JSON so a game can be saved as-is. */

export type Pos =
  | 'GK'
  | 'DL' | 'DC' | 'DR'
  | 'DM'
  | 'ML' | 'MC' | 'MR'
  | 'AML' | 'AMC' | 'AMR'
  | 'ST';

export const ALL_POS: Pos[] = ['GK', 'DL', 'DC', 'DR', 'DM', 'ML', 'MC', 'MR', 'AML', 'AMC', 'AMR', 'ST'];

/** All visible attributes run 1–20, like CM 01/02. */
export interface Attributes {
  // Technical
  crossing: number;
  dribbling: number;
  finishing: number;
  heading: number;
  longShots: number;
  marking: number;
  passing: number;
  setPieces: number;
  tackling: number;
  technique: number;
  // Mental
  aggression: number;
  anticipation: number;
  composure: number;
  creativity: number;
  decisions: number;
  determination: number;
  flair: number;
  offTheBall: number;
  positioning: number;
  teamwork: number;
  workRate: number;
  // Physical
  acceleration: number;
  agility: number;
  jumping: number;
  naturalFitness: number;
  pace: number;
  stamina: number;
  strength: number;
  // Goalkeeping
  handling: number;
  oneOnOnes: number;
  reflexes: number;
  aerialAbility: number;
  // Hidden (never shown directly, like the original)
  consistency: number;
  importantMatches: number;
  injuryProneness: number;
}

export type AttrKey = keyof Attributes;

export interface SeasonStats {
  apps: number;
  subApps: number;
  goals: number;
  assists: number;
  ratingSum: number;
  motm: number;
  yellow: number;
  red: number;
  cleanSheets: number;
  /** Minutes played (missing in saves from before it was counted). */
  mins?: number;
  /** International appearances and goals this season. */
  intlApps?: number;
  intlGoals?: number;
}

export interface CareerEntry {
  season: number;
  clubId: number;
  apps: number;
  goals: number;
  avgRating: number;
}

export interface Injury {
  name: string;
  /** Days until fit again. */
  days: number;
  /** The manager has been told about (and has acknowledged) a serious injury. */
  seen?: boolean;
  /** How a serious injury is being treated once the manager has decided, and how it went. */
  treated?: { how: 'rehab' | 'surgery' | 'specialist'; complication: boolean; lasting?: string };
}

export interface Player {
  id: number;
  firstName: string;
  lastName: string;
  nation: string;
  age: number;
  clubId: number | null;
  squadNo: number;
  foot: 'R' | 'L' | 'B';
  /** Positional familiarity: 20 natural, 15 accomplished, 10 unconvincing. Missing = awkward. */
  pos: Partial<Record<Pos, number>>;
  attrs: Attributes;
  /** Current ability, 1–200. */
  ca: number;
  /** Potential ability, 1–200. */
  pa: number;
  /** Match fitness, 0–100. */
  condition: number;
  /** Match sharpness, 0–100 (missing = 88). Built by training and games, lost on holiday and through injury. */
  sharp?: number;
  /** Individual training: an attribute to work on, or a position to learn. */
  train?: { attr: AttrKey } | { pos: Pos; progress: number };
  /** 0–100. 50 is okay, 80+ is superb. */
  morale: number;
  /** Most recent match ratings, newest last. */
  form: number[];
  injury: Injury | null;
  /** Matches left to serve. */
  suspended: number;
  /** Matches still to serve, per competition (see discipline.ts). `suspended` mirrors the next match's competition. */
  bans?: Record<string, number>;
  /** Yellow cards per competition. */
  ycs?: Record<string, number>;
  /** This season, all competitions. */
  stats: SeasonStats;
  /** This season, league games only (for the league's awards and statistics). */
  lstats?: SeasonStats;
  career: CareerEntry[];
  retiring?: boolean;
  /** Weekly wage in pounds. */
  wage: number;
  /** Year of the June his contract runs to (2029 = summer 2029). */
  contractEnd: number;
  /** Fee that obliges his club to let him talk to the bidder. */
  releaseClause: number | null;
  /** Unamortised transfer fee still on the books (the cost of a signing is spread over his contract). */
  bookValue: number;
  /** Listed by his club for sale or loan. */
  listed: 'transfer' | 'loan' | null;
  /** On loan: the parent club, who pays what share of his wage, and any option to buy. */
  loan: Loan | null;
  /** Has agreed to join another club when his contract runs out. */
  preContract: number | null;
  /** The terms of a pre-contract with the manager's club: what he signs for on 1 July. */
  preTerms?: { wage: number; years: number; clauseFee: number | null };
  /** Season he joined his current club. */
  joined: number;
  /** Day he became a free agent (only for players without a club). */
  freeSince?: number;
  /** International career: caps and goals (estimated for the years before 2026/27). */
  intl?: { caps: number; goals: number };
  /** Away with his national team (unavailable to his club) until this day. */
  away?: { nation: string; until: number; what: string; apps?: number; goals?: number } | null;
}

export interface Loan {
  parentId: number;
  /** Share of his wage paid by the club he's on loan at, 0–1. */
  wageShare: number;
  /** Fee to make the move permanent, if agreed. */
  optionFee: number | null;
  /** A summer loan with a clause letting the parent club recall him in the January window. */
  recall?: boolean;
}

/* ───────────────────────── Money ───────────────────────── */

/** One season's accounts. Money in and out of the bank, plus the accounting items behind profit and loss. */
export interface Ledger {
  gate: number;
  tv: number;
  prize: number;
  sponsorship: number;
  merchandise: number;
  /** Transfer fees received. */
  sales: number;
  loanFeesIn: number;
  wages: number;
  /** Transfer fees paid. */
  purchases: number;
  operating: number;
  loanFeesOut: number;
  /** Payoffs for released players. */
  severance: number;
  /** Scouts' wages and travel. */
  scouting: number;
  /** Non-cash: each signing's fee spread over his contract. */
  amortisation: number;
  /** Non-cash: fee received minus the player's remaining book value. */
  saleProfit: number;
  /** Stadium building and loan repayments (outside the spending rules, as infrastructure is). */
  stadium?: number;
}

export interface Finance {
  /** Cash in the bank, pounds. */
  balance: number;
  transferBudget: number;
  /** Weekly wage budget. */
  wageBudget: number;
  /** Annual commercial income (sponsorship and merchandise). */
  commercial: number;
  /** Annual share of the league's TV deal paid in instalments; merit money comes at the end. */
  tvShare: number;
  /** Average ticket price for home games. */
  ticketPrice: number;
  /** The club's pay scale relative to the market (big payers above 1). */
  wageScale: number;
  ledger: Ledger;
  lastLedger?: Ledger;
  /** Profit or loss of recent seasons, newest last (for spending rules). */
  history: { season: number; profit: number; revenue: number }[];
  /** Points deducted this season for breaking spending rules. */
  deduction: number;
  /** Parachute payments after relegation from the Premier League: the seasons left (1-3). */
  parachute?: number;
  /** Travel budget for scouting assignments this season. */
  scoutBudget?: number;
  /** The wage budget the board set at the start of the season (it never drops below this). */
  wageBase?: number;
  /** The manager's own moves between the transfer and wage budgets this season (pounds a week). */
  wageShift?: number;
}

/* ───────────────────────── Scouting ───────────────────────── */

export interface Scout {
  id: number;
  name: string;
  nation: string;
  age: number;
  /** How well he judges current ability and potential, 1–20. */
  judgeAbility: number;
  judgePotential: number;
  /** League he knows best: assignments there are quicker and sharper. */
  speciality: string;
  /** Weekly wage. */
  wage: number;
}

export type AssignmentKind = 'player' | 'club' | 'league';

export interface Assignment {
  id: number;
  scoutId: number;
  kind: AssignmentKind;
  /** Player id, club id, or league id. */
  target: number | string;
  /** League assignments: what to look for. */
  focus?: 'best' | 'young' | 'value';
  startDay: number;
  endDay: number;
  season: number;
  cost: number;
}

/** A scout's verdict on a player, frozen at the time of writing. */
export interface ScoutReport {
  playerId: number;
  scoutId: number;
  scoutName: string;
  season: number;
  day: number;
  /** The scout's estimates (not the truth). */
  estCA: number;
  estPA: number;
  verdict: 'sign' | 'consider' | 'future' | 'squad' | 'no';
  notes: string[];
  /** Club he was at when watched. */
  clubId: number | null;
}

export interface Scouting {
  scouts: Scout[];
  /** Scouts available to hire. */
  pool: Scout[];
  assignments: Assignment[];
  reports: Record<number, ScoutReport>;
  /** Knowledge gained on top of what's common knowledge, 0–100, by player id. */
  known: Record<number, number>;
  /** Players who have been at the manager's club (loans too): known completely, for good. */
  former?: number[];
  shortlist: number[];
  nextId: number;
}

export type OfferKind = 'transfer' | 'loan' | 'precontract';

/**
 * The manager's assistant. Two ratings, 1–20: reading the game (the half-time card, the debrief and
 * his changes when the manager skips to full time) and judging players (picking the XI and bench, and
 * who he brings on). A caretaker (the youth coach) stands in while the job is vacant.
 */
export interface Assistant {
  id: number;
  name: string;
  nation: string;
  age: number;
  read: number;
  judge: number;
  /** Weekly wage. */
  wage: number;
  /** Season he joined (or became available). */
  joined: number;
  caretaker?: boolean;
}

/** Candidates for the assistant's job, and when the list was last drawn up. */
export interface StaffMarket {
  pool: Assistant[];
  season: number;
  day: number;
  nextId: number;
}

/**
 * A bid for a player. `status` walks through: pending (with the selling club) →
 * accepted / countered / rejected → terms (personal terms agreed) → done, or
 * withdrawn / expired / collapsed.
 */
export interface Offer {
  id: number;
  kind: OfferKind;
  playerId: number;
  /** Bidding club. */
  buyerId: number;
  /** Club that owns the player. */
  sellerId: number;
  fee: number;
  /** Loans: share of wages the borrower pays, 0–1, and an optional fee to buy at the end. */
  wageShare?: number;
  optionFee?: number | null;
  /** Loans: a January recall clause agreed (or asked for), and whether the borrower refused one. */
  recall?: boolean;
  recallRefused?: boolean;
  /** Personal terms: the release clause asked for (a choice key) and the fee agreed (null = none). */
  clause?: string;
  clauseFee?: number | null;
  status: 'pending' | 'accepted' | 'countered' | 'rejected' | 'terms' | 'done' | 'withdrawn' | 'expired' | 'collapsed';
  counterFee?: number;
  /** Personal terms agreed (weekly wage, contract years). */
  wage?: number;
  years?: number;
  /** Terms the player has asked for in talks. */
  demand?: { wage: number; years: number };
  /** Free agents: he has said yes to the terms; the manager still has to confirm the signing. */
  agreed?: boolean;
  /** Rounds of wage talks so far; players walk away after three. */
  talks?: number;
  /** AI bidders: the most they'll pay if the manager asks for more (hidden). */
  limit?: number;
  day: number;
  season: number;
  note?: string;
}

/** A completed move, for the transfer news and player histories. */
export interface TransferRecord {
  season: number;
  day: number;
  playerId: number;
  name: string;
  fromId: number | null;
  toId: number | null;
  fee: number;
  kind: 'transfer' | 'loan' | 'free' | 'loan-end' | 'release';
}

export type Mentality = 'defensive' | 'balanced' | 'attacking';
export type Passing = 'short' | 'mixed' | 'long';
export type Tackling = 'easy' | 'normal' | 'hard';
export type ClosingDown = 'own-half' | 'mixed' | 'all-over';

/** Arrows on the tactics board: a player who runs with the ball, and one who makes forward runs without it. */
export interface RunFlags {
  ball?: boolean;
  off?: boolean;
}

/** Team instructions, in the style of the CM 01/02 tactics screen. */
export interface Tactics {
  formation: string;
  mentality: Mentality;
  passing: Passing;
  tackling: Tackling;
  closingDown: ClosingDown;
  counterAttack: boolean;
  offsideTrap: boolean;
}

/* ───────────────────────── Internationals ───────────────────────── */

export interface IntlMatch {
  id: number;
  day: number;
  home: string;
  away: string;
  /** Competition id (UNL, AFCQ, CNL, FR, AC for the Asian Cup, EQ28…) and group or stage. */
  comp: string;
  group?: string;
  stage?: string;
  /** Two-legged and knockout ties. */
  tie?: string;
  leg?: 1 | 2;
  ko?: boolean;
  neutral?: boolean;
  result: { hg: number; ag: number; pens?: [number, number]; aet?: boolean; scorers: [number, 0 | 1][] } | null;
}

/** A group competition that can run over several seasons (qualifying groups). */
export interface IntlGroupComp {
  id: string;
  name: string;
  confed: string;
  groups: { name: string; teams: string[]; rounds: [string, string][][]; next: number }[];
}

export interface IntlState {
  season: number;
  matches: IntlMatch[];
  elo: Record<string, number>;
  /** Players called up for the current window or tournament, by nation. */
  squads: Record<string, number[]>;
  comps: IntlGroupComp[];
  /** Trophies decided (Nations League, Asian Cup…), newest last. */
  winners: { season: number; comp: string; nation: string }[];
  nextId: number;
}

/* ───────────────────────── Cups ───────────────────────── */

export interface CupRound {
  name: string;
  /** Season day of each leg (one entry for a single match, two for home and away). */
  days: number[];
  /** Kick-off time(s) (local). */
  time: string;
  /** Extra time before penalties in the deciding match (else straight to penalties). */
  extraTime: boolean;
  /** Clubs entering at this round (before the draw). */
  entrants: number[];
  /** Who plays at home: the lower-division club, the club drawn first, the seed, a neutral ground, or as set by the bracket. */
  host: 'lower' | 'drawn' | 'seed' | 'neutral' | 'fixed';
  venue?: string;
  /** Prize money: UEFA pays for reaching the round, domestic cups for winning a tie in it. */
  prize?: number;
}

export interface Tie {
  id: number;
  round: number;
  /** Seeded/home club and the other one; null until known (bracket slots fill as ties are decided). */
  homeId: number | null;
  awayId: number | null;
  /** Bracket: this tie's clubs come from the winners of these ties. */
  fromHome?: number;
  fromAway?: number;
  fixtureIds: number[];
  winnerId: number | null;
}

/** A knockout cup or a UEFA competition (league phase, then knockouts). */
export interface Cup {
  id: string;
  name: string;
  short: string;
  kind: 'cup' | 'euro';
  /** Country id for domestic cups (ENG…), 'EU' for UEFA. */
  country: string;
  rounds: CupRound[];
  ties: Tie[];
  /** UEFA: clubs in the league phase, its matchday days, and whether it's finished. */
  phaseClubs?: number[];
  phaseDays?: number[][];
  phaseDone?: boolean;
  /** Ties drawn up to (exclusive) this round index. */
  drawn: number;
  winnerId: number | null;
  /** Prize money per win / draw in the league phase, and for each place in the final table (1st first). */
  phaseWin?: number;
  phaseDraw?: number;
  winnerPrize?: number;
  runnerUpPrize?: number;
}

/** A club outside the six playable leagues (lower divisions and the rest of Europe). Squads are generated when needed. */
export interface ExternalInfo {
  country: string;
  /** Division label, e.g. "Championship" or "Süper Lig". */
  division: string;
  /** Rough level, 0–10 on the same scale as club reputation. */
  tier: number;
  /** Played the manager's club this season (its squad is kept for the match reports). */
  metUser?: boolean;
}

export type Workload = 'light' | 'normal' | 'heavy';
export type DrillKey = 'passing' | 'pressing' | 'counter' | 'offside' | 'tackling';
export type TeamFocus = 'balanced' | 'fitness' | 'tactics' | DrillKey;
export type CampKey = 'home' | 'spain' | 'austria' | 'tour';

export interface TrainingPlan {
  workload: Workload;
  focus: TeamFocus;
  camp: CampKey;
  /** The season whose pre-season plan the manager has confirmed. */
  confirmed: number;
  /** Familiarity (0–100) with each formation the club has used or trained. */
  fam: Record<string, number>;
  /** How well drilled the side is in each instruction (0–100, 50 = a normal side). */
  drills: Record<DrillKey, number>;
}

export interface Club {
  id: number;
  name: string;
  short: string;
  colours: [string, string];
  /** 1–10. Drives squad strength, expectations and youth quality. */
  reputation: number;
  stadium: string;
  capacity: number;
  /** Domestic league competition id. */
  leagueId: string;
  playerIds: number[];
  tactics: Tactics;
  /** The manager's club only: his assistant. */
  assistant?: Assistant;
  /** Chosen starting XI in formation-slot order. null = let the assistant pick. */
  lineup: number[] | null;
  /** Chosen substitutes (up to 9). null = let the assistant pick. */
  bench: number[] | null;
  /** Run arrows by player id (the manager's club only). */
  runs?: Record<number, RunFlags>;
  finance: Finance;
  /** Set for clubs outside the six leagues. */
  external?: ExternalInfo;
  /** Training programme (the manager's club only; AI clubs train at a standard level). */
  training?: TrainingPlan;
  /** Cups and European trophies won, newest last. */
  honours?: { season: number; cup: string }[];
  /** Supporters wanting a ticket for a typical league game (the manager's club; others sell out). */
  fans?: number;
  /** Stadium works under way (the manager's club). */
  stadiumWorks?: StadiumWorks | null;
  /** The loan paying for stadium works. */
  stadiumLoan?: StadiumLoan | null;
  /** When the board last turned down a stadium request (season, day), so it isn't asked every week. */
  stadiumAsked?: { season: number; day: number };
}

export interface StadiumWorks {
  kind: 'expand' | 'new';
  /** Capacity when the works are finished. */
  capacity: number;
  /** Capacity before the works (an expansion closes some of it meanwhile). */
  before: number;
  /** A new ground's name, and naming rights sold with it (pounds a year). */
  name?: string;
  namingRights?: number;
  cost: number;
  startSeason: number;
  startDay: number;
  readySeason: number;
  readyDay: number;
}

export interface StadiumLoan {
  remaining: number;
  monthly: number;
  monthsLeft: number;
}

export type EventKind = 'goal' | 'pen' | 'og' | 'yellow' | 'red' | 'injury' | 'sub' | 'penmiss';

export interface MatchEvent {
  minute: number;
  kind: EventKind;
  side: 0 | 1;
  playerId: number;
  /** Assister for goals, the player coming on for subs. */
  otherId?: number;
  /** Happened in extra time. */
  et?: boolean;
}

export interface MatchStats {
  possession: [number, number];
  shots: [number, number];
  onTarget: [number, number];
  corners: [number, number];
  fouls: [number, number];
  offsides: [number, number];
}

/** The assistant's numbers for one side (the manager's matches only). */
export interface SideNumbers {
  goals: number;
  shots: number;
  onTarget: number;
  /** Minutes on the ball. */
  poss: number;
  corners: number;
  crosses: number;
  /** Crosses that found a team-mate. */
  crossesDone: number;
  aerialsWon: number;
  /** Minutes on the ball by channel: left, centre, right. */
  flank: [number, number, number];
  /** Shots by channel (where the move came from): left, centre, right. */
  shotFlank: [number, number, number];
  /** Shots by 15-minute spell (index 6 = extra time). */
  periods: number[];
  /** Shots by kind of chance (through, cross, counter, long, box, corner, freekick, penalty). */
  kinds: Record<string, number>;
}

export interface MatchAnalysis {
  /** Full match, and the score sheet at half time. */
  sides: [SideNumbers, SideNumbers];
  half: [SideNumbers, SideNumbers] | null;
  /** Per player: key passes, shots, tackles and interceptions. */
  players: Record<number, { kp: number; sh: number; tk: number }>;
  /** Team instructions the managers changed during the match. */
  changes: { minute: number; side: 0 | 1; key: string; value: string }[];
  /** How well the manager's assistant reads a game (1–20), for the debrief. Absent: 20. */
  read?: number;
}

export interface MatchSummary {
  hg: number;
  ag: number;
  events: MatchEvent[];
  stats: MatchStats;
  /** playerId -> rating (1–10). */
  ratings: Record<number, number>;
  lineups: [number[], number[]];
  motm: number;
  attendance: number;
  /** Knockout matches: went to extra time; penalty shoot-out score (home, away) and its kicks in order. */
  aet?: boolean;
  pens?: [number, number];
  kicks?: { side: 0 | 1; playerId: number; scored: boolean }[];
  /** Neutral venue (cup semi-finals and finals). */
  venue?: string;
  /** Full text commentary, kept only for the manager's own matches. */
  commentary?: CommentaryLine[];
  /** The assistant's numbers, kept only for the manager's own matches. */
  analysis?: MatchAnalysis;
}

export interface CommentaryLine {
  minute: number;
  text: string;
  /** Visual weight in the UI. */
  tone: 'plain' | 'chance' | 'goal' | 'card' | 'info' | 'var';
  side?: 0 | 1;
  /** Extra time or the penalty shoot-out (for the minute shown). */
  stage?: 'et' | 'pens';
}

export interface Fixture {
  id: number;
  /** Competition id, e.g. 'ENG' for the Premier League. */
  comp: string;
  /** Matchday within the competition (0-based). */
  round: number;
  /** Day of the season the match is played on (days since 1 August). */
  day: number;
  /** The Saturday of the weekend the match belongs to; `day` may be Friday to Monday. */
  weekend: number;
  /** Kick-off time, e.g. '15:00'. */
  time: string;
  /** Kick-off still to be confirmed by the TV picks (matches are confirmed about five weeks ahead). */
  tbc: boolean;
  homeId: number;
  awayId: number;
  result: MatchSummary | null;
  /** Cup ties: which tie, which leg, and whether it's at a neutral ground. */
  tieId?: number;
  leg?: 1 | 2;
  neutral?: string;
}

export interface Competition {
  id: string;
  name: string;
  kind: 'league';
  country: string;
  /** Nationality code used for youth intakes and generated players. */
  nation: string;
  clubIds: number[];
  /** Level in the country's pyramid: 1 for a top flight (absent = 1). */
  tier?: number;
}

/** A club outside the pyramid (the National League in England) that can be promoted into the last played division. */
export interface NonLeagueClub {
  name: string;
  short: string;
  colours: [string, string];
  stadium: string;
  capacity: number;
  /** Reputation on the club scale. */
  rep: number;
}

/** What one promotion and relegation round did, for the news and the season review. */
export interface Movement {
  season: number;
  /** Club names moved: [name, fromComp, toComp]. */
  moves: [string, string, string][];
  /** Play-off winners by division. */
  playoffs: Record<string, string>;
}

export interface NewsItem {
  id: number;
  season: number;
  day: number;
  title: string;
  body: string;
  kind: 'result' | 'board' | 'injury' | 'award' | 'squad' | 'season' | 'training' | 'fixture' | 'transfer' | 'finance' | 'cup' | 'headline';
  read: boolean;
  /** A small label above the story, e.g. that a scenario is fictional. */
  tag?: string;
  /** Players the story is about, shown as a list under it with a note each. */
  players?: { id: number; note: string }[];
  /** A button on the message that takes the manager somewhere, e.g. to an offer. */
  link?: { label: string; screen: string; playerId?: number; tab?: string };
  /** The assistant's debrief of this match (fixture id): shown in full while the fixture is kept. */
  debrief?: number;
}

export interface SeasonRecord {
  season: number;
  /** Competition id -> champion club id. */
  champions: Record<string, number>;
  userClubId: number;
  userComp: string;
  userPosition: number;
  userPoints: number;
  topScorerName: string;
  topScorerClubId: number;
  topScorerGoals: number;
  /** Cup id -> winner's name. */
  cups?: Record<string, string>;
}

/** Game modes: the real world as it stands, or a what-if that changes the Premier League before day one. */
export type GameMode = 'classic' | 'flying-ants';

/** What a scenario changed, kept so cups, news and later seasons can account for it. */
export interface Scenario {
  id: 'flying-ants';
  /** The new club, which takes over the liquidated club's place (and id) in the league. */
  clubId: number;
  /** Liquidated club -> its replacement, for cup and European draws that name the old club. */
  replaced: Record<string, string>;
  /** Outside clubs that no longer exist and are left out of the cup draws. */
  gone: string[];
  /** The liquidated club's cash, and each Premier League club's equal share of it. */
  cash: number;
  share: number;
  /** Players released as free agents. */
  freed: number;
  /** The manager has been told about the new club's signings (the second story). */
  welcomed: boolean;
}

export interface GameState {
  /** The manager has been told which of his players have release clauses. */
  clauseNotice?: boolean;
  version: number;
  /** Absent in older saves: classic. */
  mode?: GameMode;
  scenario?: Scenario;
  seed: number;
  rngState: number;
  /** Starting year, e.g. 2026 for the 2026/27 season. */
  season: number;
  /** Today: days since 1 August of the season year. */
  day: number;
  userClubId: number;
  managerName: string;
  comps: Competition[];
  clubs: Club[];
  players: Record<number, Player>;
  fixtures: Fixture[];
  news: NewsItem[];
  history: SeasonRecord[];
  nextPlayerId: number;
  offers: Offer[];
  scouting: Scouting;
  /** Assistant managers looking for a job (absent in older saves). */
  staffMarket?: StaffMarket;
  cups: Cup[];
  nextTieId: number;
  /** Clubs from outside the six leagues taking part in this season's cups. */
  extClubs: Club[];
  nextExtId: number;
  /** Last season's final league order (club ids) and cup winners, for seeding and European places. */
  lastRanks?: Record<string, number[]>;
  /** Next season's European entrants, decided at the end of this one: cup id -> club names. */
  europe?: Record<string, string[]>;
  /** The unplayed division below each country's pyramid (the National League in England): clubs that could be promoted, by country. */
  pools?: Record<string, NonLeagueClub[]>;
  /** Promotion and relegation of each finished season, newest last. */
  movements?: Movement[];
  /** National teams: fixtures, ratings, call-ups. */
  intl: IntlState;
  transfers: TransferRecord[];
  nextOfferId: number;
  nextNewsId: number;
  /** The board's confidence in the manager, and the sack (see board.ts). */
  board?: import('./board.js').Board;
}
