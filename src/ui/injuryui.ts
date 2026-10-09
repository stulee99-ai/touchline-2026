import { fmtMoney } from '../engine/finance.js';
import { canTreat, surgeryOptions, treatInjury, type Treatment } from '../engine/surgery.js';
import type { GameState, Player } from '../engine/types.js';
import type { Action } from './ctx.js';
import { esc, fullName } from './format.js';
import { confirmModal } from './modal.js';

const wk = (d: number) => Math.max(1, Math.round(d / 7));

/** How a serious injury is being treated, once decided. */
export function treatedNote(p: Player): string {
  const t = p.injury?.treated;
  if (!t) return '';
  const how = t.how === 'rehab' ? 'Rehabilitation' : t.how === 'surgery' ? 'Operated on' : 'Operated on by a specialist';
  return `${how}${t.complication ? ', with complications' : ''}${t.lasting ? ' (may have lost pace)' : ''}`;
}

/**
 * The choice for a serious injury: rehabilitation, the club's surgeon, or a top specialist, with the cost,
 * the time out and the risk of complications for each. Nothing if there is nothing to decide.
 */
export function surgeryPanel(g: GameState, p: Player | undefined): string {
  if (!p) return '';
  const opts = surgeryOptions(g, p.id);
  if (!opts.length) return p.injury?.treated ? `<p class="small-note surgery-done">Treatment: ${esc(treatedNote(p))}.</p>` : '';
  const rows = opts.map((o) => `<tr>
      <td><b>${esc(o.label)}</b><br><span class="small-note">${esc(o.blurb)}</span></td>
      <td class="n">${o.cost ? fmtMoney(o.cost) : 'Free'}</td>
      <td class="n">${o.days[0] === o.days[1] ? `${wk(o.days[0])} wk` : `${wk(o.days[0])}-${wk(o.days[1])} wk`}</td>
      <td class="n" title="Chance of a complication, which adds about a third to the time out">${Math.round(o.risk * 100)}%</td>
      <td class="r"><button class="btn small${o.how === 'surgery' ? ' primary' : ''}" data-act="treat" data-id="${p.id}" data-how="${o.how}">Choose</button></td>
    </tr>`).join('');
  return `<div class="surgery">
    <div class="sub-head">Treatment for ${esc(p.lastName)}: ${esc(p.injury!.name.toLowerCase())}, about ${wk(p.injury!.days)} weeks</div>
    <table class="grid compact"><thead><tr><th>Option</th><th class="n">Cost</th><th class="n">Back in</th><th class="n" title="Chance of a complication">Risk</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p class="small-note">You decide once, and the outcome is known straight away. A complication adds about a third to the time out, and for the worst injuries can take a little pace for good.</p>
  </div>`;
}

export const injuryActions: Record<string, Action> = {
  treat: (ctx, el) => {
    const id = Number(el.dataset.id);
    const how = el.dataset.how as Treatment;
    const p = ctx.game.players[id];
    const opt = surgeryOptions(ctx.game, id).find((o) => o.how === how);
    if (!p || !opt || !canTreat(ctx.game, p)) return ctx.toast('That injury can no longer be treated.');
    const go = () => {
      const r = treatInjury(ctx.game, id, how);
      ctx.save();
      ctx.toast(r.ok ? 'Treatment arranged. See your inbox.' : r.message);
      ctx.render();
    };
    if (how === 'rehab') return go();
    confirmModal({
      title: 'Confirm treatment',
      lines: [
        `${opt.label} for ${fullName(p)}: ${opt.cost ? fmtMoney(opt.cost) : 'free'}.`,
        `He should be back in ${wk(opt.days[0])}-${wk(opt.days[1])} weeks, with a ${Math.round(opt.risk * 100)}% chance of a complication.`,
        'This can\'t be changed afterwards.',
      ],
      ok: 'Yes, go ahead',
    }, go);
  },
};
