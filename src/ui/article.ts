import { posLabel } from '../engine/attributes.js';
import { dayLabel } from '../engine/game.js';
import { nationName } from '../engine/intl.js';
import { TRAIT_DEFS, traitsOf } from '../engine/traits.js';
import type { GameState, NewsItem } from '../engine/types.js';
import { esc, fullName } from './format.js';
import { linkify } from './linkify.js';

/**
 * One news story: an optional tag, the headline and date, the text in paragraphs, and (for
 * stories about particular players) a list of them with a note each. Used by the inbox and
 * by the front page on the new-game screen.
 */
export function storyHtml(g: GameState, n: NewsItem): string {
  const about = n.players?.map((x) => x.id) ?? [];
  const paras = n.body.split('\n\n').map((t) => `<p>${linkify(g, t, about)}</p>`).join('');
  const people = n.players?.length
    ? `<div class="story-players"><h4>NEWLY SCOUTED · READY FOR THE FIRST TEAM</h4><ul>${n.players.map(({ id, note }) => {
      const p = g.players[id];
      if (!p) return '';
      const traits = traitsOf(p).map((t) => `<span class="trait ${TRAIT_DEFS[t].good ? 'good' : 'bad'}" tabindex="0" role="note" data-tip="${esc(TRAIT_DEFS[t].blurb)}">${esc(TRAIT_DEFS[t].label)}</span>`).join('');
      return `<li><span class="sp-no">${p.squadNo}</span><div><div class="sp-head"><button class="link" data-act="player" data-id="${p.id}">${esc(fullName(p))}</button><span class="sp-meta">${esc(posLabel(p))} · age ${p.age}${p.nation !== 'ENG' ? ` · ${esc(nationName(p.nation))}` : ''}</span></div><div class="sp-note">${esc(note)}</div>${traits ? `<div class="sp-traits">${traits}</div>` : ''}</div></li>`;
    }).join('')}</ul></div>`
    : '';
  return `${n.tag ? `<p class="story-tag">${esc(n.tag)}</p>` : ''}<h3>${linkify(g, n.title, about)}</h3><p class="news-date">${dayLabel(n.season, n.day)}</p>${paras}${people}`;
}
