import { ATTR_LABEL, GOALKEEPING, MENTAL, PHYSICAL, TECHNICAL } from '../engine/attributes.js';
import { club } from '../engine/game.js';
import { fmtMoney, fmtWage } from '../engine/finance.js';
import { nationName } from '../engine/intl.js';
import { attrRange, knowledge } from '../engine/scouting.js';
import { TRAIT_DEFS, traitsOf } from '../engine/traits.js';
import { valueOf } from '../engine/transfers.js';
import type { AttrKey, GameState, Player } from '../engine/types.js';
import type { Action, Ctx } from './ctx.js';
import { attrClass, esc, fullName, pos } from './format.js';
import { abilityStars, scoutWords } from './scoutui.js';
import { panel, playerLink } from './screens.js';

export const MAX_COMPARE = 3;

/** The comparison list, dropping anyone who has since left the game. */
export function compareList(ctx: Ctx): Player[] {
  const ids = (ctx.ui.compare ??= []).filter((id) => ctx.game.players[id]);
  ctx.ui.compare = ids;
  return ids.map((id) => ctx.game.players[id]);
}

/** Buttons for the player profile's title bar. */
export function compareButtons(ctx: Ctx, p: Player): string {
  const ids = ctx.ui.compare ?? [];
  const inList = ids.includes(p.id);
  const add = inList
    ? `<button class="btn small" data-act="compare-remove" data-id="${p.id}">Remove from comparison</button>`
    : ids.length >= MAX_COMPARE
      ? `<button class="btn small" disabled title="Comparison is full: remove someone first">Compare (full)</button>`
      : `<button class="btn small" data-act="compare-add" data-id="${p.id}">Compare</button>`;
  const view = ids.length >= 2 ? `<button class="btn small primary" data-act="compare-open">View comparison (${ids.length}) ►</button>` : '';
  return `${add} ${view}`;
}

/** Shown value of an attribute for the comparison: the exact number if known, else the middle of the range. */
function attrValue(g: GameState, p: Player, k: AttrKey): { text: string; mid: number; exact: boolean } {
  const [lo, hi] = attrRange(g, p, k);
  return lo === hi ? { text: String(lo), mid: lo, exact: true } : { text: `${lo}-${hi}`, mid: (lo + hi) / 2, exact: false };
}

export function compareScreen(ctx: Ctx): string {
  const g = ctx.game;
  const players = compareList(ctx);
  const me = club(g, g.userClubId);
  if (players.length < 2) {
    return panel(me, 'Compare players', `<p class="pad">Open a player's profile and press <b>Compare</b> to add him (up to ${MAX_COMPARE}). Add at least two to compare them side by side.</p>${players.length ? `<p class="pad">${players.map((p) => playerLink(p)).join(', ')} waiting.</p>` : ''}`, '<button class="btn small" data-act="back">◄ Back</button>');
  }
  const head = players.map((p) => `<th class="cmp-col"><div>${playerLink(p)}</div><div class="small-note">${esc(p.clubId ? club(g, p.clubId).name : 'Free agent')}</div><button class="btn tiny" data-act="compare-remove" data-id="${p.id}" data-stay="1">Remove</button></th>`).join('');
  const row = (label: string, cell: (p: Player) => string) => `<tr><th scope="row">${label}</th>${players.map((p) => `<td>${cell(p)}</td>`).join('')}</tr>`;
  const known = (p: Player) => knowledge(g, p) >= 100;
  const facts = [
    row('Position', (p) => esc(pos(p))),
    row('Age', (p) => String(p.age)),
    row('Nationality', (p) => esc(nationName(p.nation))),
    row('Preferred foot', (p) => (p.foot === 'B' ? 'Either' : p.foot === 'L' ? 'Left' : 'Right')),
    row('Ability', (p) => abilityStars(g, p)),
    row('Assessment', (p) => `<span class="report-word">${esc(scoutWords(g, p).ability)}</span>`),
    row('Potential', (p) => `<span class="report-word">${esc(scoutWords(g, p).potential)}</span>`),
    row('Value', (p) => fmtMoney(valueOf(g, p))),
    row('Wage', (p) => (p.clubId ? fmtWage(p.wage) : '-')),
    row('Contract', (p) => (p.clubId ? `to ${p.contractEnd}` : 'Free agent')),
    row('Traits', (p) => (known(p) ? (traitsOf(p).map((id) => `<span class="trait ${TRAIT_DEFS[id].good ? 'good' : 'bad'}" tabindex="0" data-tip="${esc(TRAIT_DEFS[id].blurb)}">${esc(TRAIT_DEFS[id].label)}</span>`).join(' ') || '<span class="small-note">None</span>') : '<span class="small-note">Not known well enough</span>')),
  ].join('');
  const anyGK = players.some((p) => (p.pos.GK ?? 0) >= 15);
  const group = (title: string, keys: AttrKey[]) => {
    const rows = [...keys].sort((a, b) => ATTR_LABEL[a].localeCompare(ATTR_LABEL[b])).map((k) => {
      const vals = players.map((p) => attrValue(g, p, k));
      const best = Math.max(...vals.map((v) => v.mid));
      const contested = new Set(vals.map((v) => v.mid)).size > 1;
      return `<tr><th scope="row">${ATTR_LABEL[k]}</th>${vals.map((v) => `<td class="${attrClass(Math.round(v.mid))}${contested && v.mid === best ? ' cmp-best' : ''}">${v.text}</td>`).join('')}</tr>`;
    }).join('');
    return `<tr class="sub-row"><td colspan="${players.length + 1}">${title}</td></tr>${rows}`;
  };
  const table = `<div class="scroll"><table class="grid cmp"><thead><tr><th></th>${head}</tr></thead><tbody>
    ${facts}${group('Technical', TECHNICAL)}${group('Mental', MENTAL)}${group('Physical', PHYSICAL)}${anyGK ? group('Goalkeeping', GOALKEEPING) : ''}
  </tbody></table></div><p class="pad small-note">The highlighted figure is the best of the group. Ranges mean you don't know that player well yet; scouting narrows them.</p>`;
  return panel(me, 'Compare players', table, '<button class="btn small" data-act="back">◄ Back</button>');
}

export const compareActions: Record<string, Action> = {
  'compare-add': (ctx, el) => {
    const id = Number(el.dataset.id);
    const list = (ctx.ui.compare ??= []);
    if (!list.includes(id) && list.length < MAX_COMPARE) list.push(id);
    ctx.toast(list.length >= 2 ? 'Added. Press "View comparison" to see them side by side.' : 'Added. Open another player and press Compare.');
    ctx.render();
  },
  'compare-remove': (ctx, el) => {
    ctx.ui.compare = (ctx.ui.compare ?? []).filter((id) => id !== Number(el.dataset.id));
    ctx.render();
  },
  'compare-open': (ctx) => ctx.go('compare'),
};

void fullName;
