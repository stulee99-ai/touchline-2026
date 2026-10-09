import type { GameState } from '../engine/types.js';
import { esc } from './format.js';

/**
 * Turns the players and clubs named in a piece of news into links: club names (in full) open
 * the club's page; players open their profile. A full name ("Kalvin Phillips") is always linked;
 * a surname on its own ("Phillips") only when it can mean one person: one player of that name
 * among the clubs the story mentions, the manager's own club, and the players the story is about.
 */

interface Index {
  players: number;
  clubRe: RegExp | null;
  clubByName: Map<string, number>;
  bySurname: Map<string, number[]>;
}

const cache = new WeakMap<GameState, Index>();

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function index(g: GameState): Index {
  const count = Object.keys(g.players).length;
  const hit = cache.get(g);
  if (hit && hit.players === count && hit.clubByName.size === g.clubs.length) return hit;
  const clubByName = new Map<string, number>();
  for (const c of g.clubs) clubByName.set(c.name, c.id);
  const names = [...clubByName.keys()].sort((a, b) => b.length - a.length).map(reEsc);
  const clubRe = names.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null;
  const bySurname = new Map<string, number[]>();
  for (const p of Object.values(g.players)) {
    if (!p.lastName) continue;
    const k = p.lastName.toLowerCase();
    const list = bySurname.get(k);
    if (list) list.push(p.id);
    else bySurname.set(k, [p.id]);
  }
  const idx = { players: count, clubRe, clubByName, bySurname };
  cache.set(g, idx);
  return idx;
}

/** Words that are also surnames but usually just words: never linked on their own. */
const COMMON = new Set(['the', 'a', 'he', 'his', 'they', 'we', 'will', 'may', 'long', 'young', 'king', 'best', 'little', 'white', 'green', 'brown', 'black', 'love', 'hope', 'rich', 'small', 'short', 'strong', 'good', 'well', 'west', 'north', 'south', 'east', 'city', 'united', 'town', 'park', 'man', 'can', 'lord', 'day', 'summer', 'winter', 'march', 'august', 'june', 'july', 'april', 'cup', 'league', 'final', 'goal', 'free', 'new', 'old', 'first', 'last', 'next', 'more', 'most', 'lee', 'case', 'hand', 'house', 'field', 'wood', 'hill', 'stone', 'cross', 'ward', 'page', 'price', 'cash', 'fee', 'gold', 'silver', 'bell', 'ball', 'hart', 'stone', 'smart', 'bright', 'rose', 'mark', 'paul', 'james', 'thomas', 'john', 'saint', 'santos', 'silva', 'costa']);

type Span = { start: number; end: number; html: string };

/** HTML for a piece of text with its players and clubs linked. `about` adds players the item is known to be about. */
export function linkify(g: GameState, text: string, about: number[] = []): string {
  const idx = index(g);
  const spans: Span[] = [];
  const taken = (s: number, e: number) => spans.some((x) => s < x.end && e > x.start);
  // Clubs, longest names first.
  const mentioned = new Set<number>([g.userClubId]);
  if (idx.clubRe) {
    idx.clubRe.lastIndex = 0;
    for (let m = idx.clubRe.exec(text); m; m = idx.clubRe.exec(text)) {
      const id = idx.clubByName.get(m[0]);
      if (id === undefined || taken(m.index, m.index + m[0].length)) continue;
      mentioned.add(id);
      spans.push({ start: m.index, end: m.index + m[0].length, html: `<button class="link news-link" data-act="club-view" data-id="${id}">${esc(m[0])}</button>` });
    }
  }
  // Players: runs of one to three words ending in a capitalised word, matched against surnames.
  const words: { w: string; s: number; e: number }[] = [];
  const wordRe = /[\p{L}][\p{L}'’\-]*/gu;
  for (let m = wordRe.exec(text); m; m = wordRe.exec(text)) words.push({ w: m[0], s: m.index, e: m.index + m[0].length });
  const relevant = (id: number) => {
    const p = g.players[id];
    return !!p && (about.includes(id) || (p.clubId !== null && mentioned.has(p.clubId)) || (p.loan ? mentioned.has(p.loan.parentId) : false));
  };
  for (let i = 0; i < words.length; i++) {
    for (let len = 3; len >= 1; len--) {
      const last = words[i + len - 1];
      if (!last || !/^\p{Lu}/u.test(last.w)) continue;
      // The words must be separated by single spaces.
      let ok = true;
      for (let k = i; k < i + len - 1; k++) if (text.slice(words[k].e, words[k + 1].s) !== ' ') ok = false;
      if (!ok) continue;
      const surname = text.slice(words[i].s, last.e);
      const ids = idx.bySurname.get(surname.toLowerCase());
      if (!ids) continue;
      // A first name just before it makes it a full name.
      const prev = words[i - 1];
      const full = prev && text.slice(prev.e, words[i].s) === ' ' ? ids.filter((id) => g.players[id].firstName && g.players[id].firstName === prev.w) : [];
      let id: number | undefined;
      let start = words[i].s;
      if (full.length) {
        id = full.find(relevant) ?? full[0];
        start = prev.s;
      } else {
        if (len === 1 && COMMON.has(surname.toLowerCase())) continue;
        const rel = ids.filter(relevant);
        if (rel.length === 1) id = rel[0];
      }
      if (id === undefined || taken(start, last.e)) continue;
      spans.push({ start, end: last.e, html: `<button class="link news-link" data-act="player" data-id="${id}">${esc(text.slice(start, last.e))}</button>` });
      i += len - 1;
      break;
    }
  }
  spans.sort((a, b) => a.start - b.start);
  let out = '';
  let at = 0;
  for (const s of spans) {
    out += esc(text.slice(at, s.start)) + s.html;
    at = s.end;
  }
  return out + esc(text.slice(at));
}
