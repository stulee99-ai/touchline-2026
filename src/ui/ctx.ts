import type { GameState } from '../engine/types.js';

export type Screen =
  | 'inbox' | 'squad' | 'player' | 'tactics' | 'fixtures' | 'table' | 'stats' | 'club' | 'report' | 'match' | 'season-end' | 'prematch'
  | 'transfers' | 'finances' | 'scouting' | 'cups' | 'intl' | 'compare' | 'training' | 'nation';

export interface UiState {
  screen: Screen;
  playerId?: number;
  fixtureId?: number;
  newsId?: number;
  /** Round shown on the results screen. */
  round?: number;
  fixturesView?: 'mine' | 'round';
  /** League shown on the table, results and statistics screens. */
  compId?: string;
  /** The league open in the League Table screen's "Around the world" section. */
  worldComp?: string;
  /** Sort state of the sortable player tables (other clubs' squads, contracts), by table id. */
  /** Player ids picked for the side-by-side comparison. */
  compare?: number[];
  /** The match report was opened straight after playing: Continue goes to the inbox first. */
  afterMatch?: boolean;
  tsort?: Record<string, { key: string; dir: 1 | -1 }>;
  sortKey?: string;
  sortDir?: 1 | -1;
  /** Tactics screen: slot index waiting for a player. */
  slot?: number | null;
  /** Tactics/pre-match squad list: sort by suitability for this position (when no slot is picked). */
  sortPos?: string | null;
  pickSort?: 'asc' | 'desc' | null;
  /** Which column the tactics squad list is sorted by (with pickSort as the direction). */
  pickCol?: 'picked' | 'pos';
  /** Training screen: tab, and the camp ticked before it is confirmed. */
  trainTab?: 'team' | 'players';
  trainCamp?: string;
  /** Landscape tactics: which tab is open beside the pitch. */
  tacTab?: 'squad' | 'bench' | 'shape';
  /** Tactics screen: bench place waiting for a player. */
  benchSlot?: number | null;
  /** Club screen: which club (defaults to the manager's own) and which tab. */
  clubId?: number;
  clubTab?: 'info' | 'squad' | 'fixtures' | 'transfers' | 'stadium';
  clubSeason?: number;
  statsTab?: 'goals' | 'assists' | 'rating' | 'clean';
  squadFilter?: 'all' | 'gk' | 'def' | 'mid' | 'att' | 'avail';
  newsFilter?: 'all' | 'result' | 'squad' | 'board';
  /** Squad screen: selection overview or contracts and wages. */
  squadView?: 'overview' | 'form' | 'contracts';
  /** Scouting screen tab. */
  scoutTab?: 'staff' | 'reports' | 'shortlist' | 'hire';
  /** Transfers screen. */
  transferTab?: 'search' | 'listed' | 'free' | 'offers' | 'news';
  listedKind?: 'all' | 'transfer' | 'loan';
  tf?: { pos: string; league: string; maxValue: number; maxAge: number; sort: 'value' | 'ca' | 'age' | 'wage' | 'contract'; name: string; natural?: boolean;
    /** Up to five attribute minimums, judged on what the manager knows (the middle of each scouting range). */
    attrs?: [string, number][] };
  /** Find Players: page shown (0-based). */
  tfPage?: number;
  /** Player screen: which deal form is open, and the last reply from the other side. */
  deal?: 'bid' | 'loan' | 'renew' | null;
  dealMsg?: string | null;
  /** The last contract offered on the renewal form (player, wage in thousands, years, clause), kept for the next try. */
  renewDraft?: { id: number; wage: number; years: number; clause: string } | null;
  /** Cups screen: which competition, league phase or knockouts, and the matchday shown. */
  cupId?: string;
  cupView?: 'phase' | 'ko';
  cupMd?: number;
  /** Internationals screen: tab, window shown, competition shown, all games or just your nations'. */
  intlTab?: 'players' | 'squads' | 'fixtures' | 'tables';
  intlNation?: string;
  /** The national team page: which nation, and which tab. */
  nation?: string;
  nationTab?: 'squad' | 'fixtures';
  intlWin?: string;
  intlComp?: string;
  intlAll?: boolean;
  /** Inline confirmation waiting on an answer. */
  confirm?: string | null;
}

export interface Ctx {
  game: GameState;
  ui: UiState;
  go(screen: Screen, extra?: Partial<UiState>): void;
  save(): void;
  render(): void;
  toast(msg: string): void;
}

/** A click handler bound to `data-act="name"`. The clicked element carries its own data-* args. */
export type Action = (ctx: Ctx, el: HTMLElement) => void;
