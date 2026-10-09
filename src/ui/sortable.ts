import type { Player } from '../engine/types.js';
import type { Action, Ctx } from './ctx.js';
import { esc } from './format.js';

/** A column on a sortable player table: click the heading to sort, again to reverse. */
export interface SCol {
  key: string;
  label: string;
  title?: string;
  num?: boolean;
  cls?: string;
  val: (p: Player) => number | string;
  html?: (p: Player) => string;
}

const TEXT_KEYS = new Set(['name', 'pos', 'nat', 'no', 'status']);

/** Sorts `players` by the table's chosen column and returns the header row and body rows. */
export function sortableTable(
  ctx: Ctx, id: string, cols: SCol[], players: Player[], def: { key: string; dir: 1 | -1 }, tie: (a: Player, b: Player) => number, limit = Infinity,
): { head: string; rows: string } {
  const st = ctx.ui.tsort?.[id] ?? def;
  const col = cols.find((c) => c.key === st.key) ?? cols[0];
  const sorted = [...players].sort((a, b) => {
    const va = col.val(a);
    const vb = col.val(b);
    const d = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return d * st.dir || tie(a, b);
  });
  const head = cols.map((x) => `<th class="${x.num ? 'n' : ''}${x.key === col.key ? ' sorted' : ''} ${x.cls ?? ''}"${x.title ? ` title="${esc(x.title)}"` : ''}><button data-act="tsort" data-t="${id}" data-key="${x.key}">${esc(x.label)}${x.key === col.key ? (st.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
  const rows = sorted.slice(0, limit).map((p) => `<tr>${cols.map((x) => `<td class="${x.num ? 'n' : ''} ${x.cls ?? ''}">${x.html ? x.html(p) : esc(String(x.val(p)))}</td>`).join('')}</tr>`).join('');
  return { head, rows };
}

export const sortActions: Record<string, Action> = {
  tsort: (ctx, el) => {
    const id = el.dataset.t!;
    const k = el.dataset.key!;
    const all = (ctx.ui.tsort ??= {});
    const cur = all[id];
    all[id] = cur && cur.key === k ? { key: k, dir: cur.dir === 1 ? -1 : 1 } : { key: k, dir: TEXT_KEYS.has(k) ? 1 : -1 };
    ctx.render();
  },
};
