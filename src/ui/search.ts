import { club } from '../engine/game.js';
import { isExtPlayer } from '../engine/ext.js';
import { nationName } from '../engine/intl.js';
import type { GameState } from '../engine/types.js';
import { esc, fullName, pos } from './format.js';

/** Lower-case, accent-free text so "odegaard" finds Ødegaard and "cote d'ivoire" finds Côte d'Ivoire. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/ß/g, 'ss').replace(/ł/gi, 'l').toLowerCase();
}

export interface Hit {
  kind: 'player' | 'club' | 'staff';
  score: number;
  html: string;
}

const MAX = 12;

/** Search players, clubs and scouts by name. Best matches (starts-with) first. */
export function search(g: GameState, query: string): Hit[] {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const words = q.split(/\s+/);
  const rank = (name: string): number => {
    const n = norm(name);
    if (!words.every((w) => n.includes(w))) return -1;
    const last = n.split(' ').slice(-1)[0];
    return n === q ? 4 : last.startsWith(words[words.length - 1]) || n.startsWith(q) ? 3 : n.split(' ').some((p) => p.startsWith(words[0])) ? 2 : 1;
  };
  const hits: Hit[] = [];
  for (const c of g.clubs) {
    const s = Math.max(rank(c.name), rank(c.short));
    if (s > 0) hits.push({ kind: 'club', score: s + 0.5, html: `<button class="hit" data-act="club-view" data-id="${c.id}"><span class="hk">Club</span><b>${esc(c.name)}</b><small>${esc(g.comps.find((x) => x.id === c.leagueId)?.name ?? '')}</small></button>` });
  }
  const sc = g.scouting;
  for (const s of [...sc.scouts, ...sc.pool]) {
    const r = rank(s.name);
    if (r > 0) hits.push({ kind: 'staff', score: r, html: `<button class="hit" data-act="search-scout" data-hired="${sc.scouts.includes(s) ? 1 : 0}"><span class="hk">Scout</span><b>${esc(s.name)}</b><small>${sc.scouts.includes(s) ? 'Your staff' : 'Available to hire'} · ${esc(nationName(s.nation))}</small></button>` });
  }
  for (const p of Object.values(g.players)) {
    if (isExtPlayer(p)) continue;
    const r = rank(`${p.firstName} ${p.lastName}`);
    if (r < 0) continue;
    const where = p.clubId ? club(g, p.clubId).name : 'Free agent';
    hits.push({ kind: 'player', score: r + p.ca / 1000, html: `<button class="hit" data-act="player" data-id="${p.id}"><span class="hk">${esc(pos(p).split(',')[0])}</span><b>${esc(fullName(p))}</b><small>${esc(where)} · ${p.age}</small></button>` });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, MAX);
}

export function searchBox(): string {
  return `<div class="search"><input id="gsearch" type="search" placeholder="Search players, staff, clubs…" autocomplete="off" aria-label="Search"><div id="search-results" class="search-results" hidden></div></div>`;
}
