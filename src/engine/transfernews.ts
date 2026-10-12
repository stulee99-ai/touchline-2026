/**
 * Transfer news from around the world: fees near the world record, any move by one of the world's
 * fifty biggest names, a new world record, and a summary of the manager's league when a window shuts.
 */
import { isExtPlayer } from './ext.js';
import { fmtMoney } from './finance.js';
import { addNews, club, dateOf } from './game.js';
import { nationName } from './intl.js';
import type { GameState, Player, TransferRecord } from './types.js';

/** The record when a career starts: Neymar, Barcelona to Paris Saint-Germain, August 2017 (€222m). */
export const WORLD_RECORD_2017 = { fee: 198_000_000, name: 'Neymar', from: 'Barcelona', to: 'Paris Saint-Germain', year: 2017 };

/** Fees at least this share of the world record are news wherever they happen. */
const NEAR_RECORD = 0.75;
/** Moves by this many of the world's best-known players are news whatever the fee. */
const TOP_NAMES = 50;

export function worldRecord(state: GameState): NonNullable<GameState['worldRecord']> {
  return (state.worldRecord ??= { ...WORLD_RECORD_2017 });
}

/** How big a name a player is: ability, his awards and the club he plays for. */
function standing(state: GameState, p: Player): number {
  const rep = p.clubId ? club(state, p.clubId)?.reputation ?? 0 : 0;
  return p.ca + (p.fame ?? 0) * 4 + rep * 1.5;
}

let cache: { state: GameState; key: string; cut: number } | null = null;
/** The standing of the fiftieth biggest name today (cached per day). */
function topCut(state: GameState): number {
  const key = `${state.season}:${state.day}`;
  if (cache && cache.state === state && cache.key === key) return cache.cut;
  const all = Object.values(state.players).filter((p) => !isExtPlayer(p)).map((p) => standing(state, p)).sort((a, b) => b - a);
  const cut = all[Math.min(TOP_NAMES, all.length) - 1] ?? Infinity;
  cache = { state, key, cut };
  return cut;
}

/** Is this one of the world's fifty biggest names? */
export function topName(state: GameState, p: Player): boolean {
  return !isExtPlayer(p) && standing(state, p) >= topCut(state);
}

const clubName = (state: GameState, id: number | null): string => (id ? club(state, id)?.name ?? 'a club abroad' : 'no club');

/**
 * A completed move, before the player's club changes hands in the records: news if it's a record,
 * near the record, or one of the biggest names (moves involving the manager's club have their own news).
 */
export function bigMoveNews(state: GameState, p: Player, fromId: number | null, toId: number | null, fee: number, kind: TransferRecord['kind'], star: boolean): void {
  if (kind === 'loan-end' || kind === 'release' || !toId) return;
  const rec = worldRecord(state);
  const record = kind === 'transfer' && fee > rec.fee;
  const near = kind === 'transfer' && fee >= rec.fee * NEAR_RECORD;
  const mine = state.userClubId && (fromId === state.userClubId || toId === state.userClubId);
  const from = clubName(state, fromId);
  const to = clubName(state, toId);
  const year = dateOf(state.season, state.day).getUTCFullYear();
  if (record) {
    const old = { ...rec };
    state.worldRecord = { fee, name: `${p.firstName} ${p.lastName}`.trim(), from, to, year };
    addNews(state, {
      kind: 'headline',
      title: `World record: ${p.lastName} joins ${to} for ${fmtMoney(fee)}`,
      body: `${who(p)} has joined ${to} from ${from} for ${fmtMoney(fee)}, a new world record. The old record: ${fmtMoney(old.fee)} for ${old.name} (${old.from} to ${old.to}, ${old.year}).`,
      link: { label: 'View player', screen: 'player', playerId: p.id },
    });
    return;
  }
  if (mine || !(near || star)) return;
  const how = kind === 'loan' ? 'on loan' : kind === 'free' || !fee ? 'on a free transfer' : `for ${fmtMoney(fee)}`;
  addNews(state, {
    kind: 'transfer',
    title: `${p.lastName} joins ${to} ${how}`,
    body: `${who(p)} has joined ${to} from ${from} ${how}.${near ? ` World record: ${fmtMoney(rec.fee)} (${rec.name}, ${rec.year}).` : ''}`,
    link: { label: 'View player', screen: 'player', playerId: p.id },
  });
}

function who(p: Player): string {
  return `${`${p.firstName} ${p.lastName}`.trim()} (${p.age}, ${nationName(p.nation)})`;
}

/** The first day of the window that has just shut. */
function windowStart(state: GameState, open: (season: number, day: number) => boolean): number {
  let d = state.day - 1;
  while (open(state.season, d - 1)) d--;
  return d;
}

/** When a window shuts: the manager's league in numbers, and its biggest deals. */
export function windowSummary(state: GameState, open: (season: number, day: number) => boolean): void {
  if (!state.userClubId) return;
  const me = club(state, state.userClubId);
  const comp = state.comps.find((c) => c.id === me.leagueId);
  if (!comp) return;
  const ids = new Set(comp.clubIds);
  const from = windowStart(state, open);
  const moves = state.transfers.filter((t) => t.season === state.season && t.day >= from && t.day < state.day && (t.kind === 'transfer' || t.kind === 'free' || t.kind === 'loan') && ((t.toId !== null && ids.has(t.toId)) || (t.fromId !== null && ids.has(t.fromId))));
  const january = dateOf(state.season, state.day).getUTCMonth() <= 1;
  const title = `${january ? 'January' : 'Summer'} window: ${comp.name} round-up`;
  if (!moves.length) {
    addNews(state, { kind: 'transfer', title, body: `The window has shut. No ${comp.name} club made a signing.` });
    return;
  }
  const spent = new Map<number, number>();
  const got = new Map<number, number>();
  for (const t of moves) {
    if (t.toId !== null && ids.has(t.toId)) spent.set(t.toId, (spent.get(t.toId) ?? 0) + t.fee);
    if (t.fromId !== null && ids.has(t.fromId)) got.set(t.fromId, (got.get(t.fromId) ?? 0) + t.fee);
  }
  const total = [...spent.values()].reduce((a, b) => a + b, 0);
  const signings = moves.filter((t) => t.toId !== null && ids.has(t.toId));
  const net = comp.clubIds.map((id) => ({ id, net: (spent.get(id) ?? 0) - (got.get(id) ?? 0) })).sort((a, b) => b.net - a.net);
  const top = [...signings].filter((t) => t.kind === 'transfer' && t.fee > 0).sort((a, b) => b.fee - a.fee).slice(0, 5);
  const yours = { in: signings.filter((t) => t.toId === me.id).length, out: moves.filter((t) => t.fromId === me.id).length };
  const lines = [
    `The window has shut. Spent: ${fmtMoney(total)} on ${signings.length} signing${signings.length === 1 ? '' : 's'} (loans and frees included).`,
    `Biggest net spenders: ${net.slice(0, 3).filter((x) => x.net > 0).map((x) => `${club(state, x.id).name} ${fmtMoney(x.net)}`).join(', ') || 'none'}.`,
    `Biggest net sellers: ${net.slice(-3).reverse().filter((x) => x.net < 0).map((x) => `${club(state, x.id).name} ${fmtMoney(-x.net)}`).join(', ') || 'none'}.`,
    `${me.name}: ${yours.in} in, ${yours.out} out, net ${fmtMoney((spent.get(me.id) ?? 0) - (got.get(me.id) ?? 0))}.`,
  ];
  addNews(state, {
    kind: 'transfer',
    title,
    body: lines.join(' '),
    playersTitle: 'The biggest deals',
    players: top.filter((t) => state.players[t.playerId]).map((t) => ({ id: t.playerId, note: `${fmtMoney(t.fee)} · ${clubName(state, t.fromId)} → ${clubName(state, t.toId)}` })),
    link: { label: 'Latest transfers', screen: 'transfers', tab: 'news' },
  });
}
