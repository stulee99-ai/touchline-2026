import { expectedRevenue, fmtMoney } from '../engine/finance.js';
import { userClub } from '../engine/game.js';
import {
  boardObjection, fansOf, fundingPlan, readyText, requestStadium, stadiumDemand, stadiumOptions, worksProgress,
} from '../engine/stadium.js';
import type { Action, Ctx } from './ctx.js';
import { esc } from './format.js';
import { confirmModal } from './modal.js';

/**
 * The manager's ground on Club Info: how full it is, works under way, and plans to put to
 * the board (two sizes of new stand, or a new stadium with a name of your own or a sponsor's).
 */
export function stadiumTab(ctx: Ctx): string {
  const g = ctx.game;
  const c = userClub(g);
  const home = g.fixtures.filter((f) => f.result && f.homeId === c.id && !f.neutral && f.comp !== 'FRI');
  const avg = home.length ? Math.round(home.reduce((n, f) => n + f.result!.attendance, 0) / home.length) : 0;
  const full = home.filter((f) => f.result!.attendance >= c.capacity * 0.96).length;
  const demand = stadiumDemand(g, c);
  const w = c.stadiumWorks;
  const loan = c.stadiumLoan;
  const facts = `<dl class="facts">
      <div><dt>Ground</dt><dd>${esc(c.stadium)}</dd></div>
      <div><dt>Capacity</dt><dd>${c.capacity.toLocaleString('en-GB')}${w?.kind === 'expand' ? ` <span class="small-note">(${(w.before - c.capacity).toLocaleString('en-GB')} closed for works)</span>` : ''}</dd></div>
      <div><dt>Average crowd</dt><dd>${avg ? `${avg.toLocaleString('en-GB')} · ${full} of ${home.length} sold out` : 'No home games yet'}</dd></div>
      <div><dt>Wanting tickets this season</dt><dd>about ${demand.toLocaleString('en-GB')}</dd></div>
      <div><dt>Ticket price</dt><dd>${fmtMoney(c.finance.ticketPrice)}</dd></div>
    </dl>`;
  const works = w ? `<div class="stadium-works"><b>${w.kind === 'new' ? `New stadium: ${esc(w.name ?? '')}` : 'Expansion'} · ${w.capacity.toLocaleString('en-GB')} seats</b>
      <span class="meter"><i style="width:${Math.round(worksProgress(g, w) * 100)}%"></i></span>
      <span class="small-note">${Math.round(worksProgress(g, w) * 100)}% done · ready ${readyText(w)} · cost ${fmtMoney(w.cost)}${w.namingRights ? ` · naming rights ${fmtMoney(w.namingRights)} a year` : ''}</span></div>` : '';
  const loanLine = loan ? `<p class="pad small-note"><b>Stadium loan:</b> ${fmtMoney(loan.remaining)} left, ${fmtMoney(loan.monthly)} a month for ${Math.ceil(loan.monthsLeft / 12)} more year${loan.monthsLeft > 12 ? 's' : ''}. Repayments come out of the bank balance but don't count towards the spending rules.</p>` : '';
  let plans = '';
  if (!w) {
    const opts = stadiumOptions(g, c);
    const games = (g.comps.find((x) => x.id === c.leagueId)?.clubIds.length ?? 20) - 1;
    const rows = opts.map((o, i) => {
      const plan = fundingPlan(g, c, o);
      const no = boardObjection(g, c, o);
      const sold = Math.min(o.capacity, demand) - Math.min(c.capacity, demand);
      const gate = Math.max(0, sold) * c.finance.ticketPrice * games;
      return `<tr><td><b>${esc(o.label)}</b><br><span class="small-note">${o.kind === 'expand' ? `+${o.added.toLocaleString('en-GB')} seats, about 10 months` : `${o.capacity.toLocaleString('en-GB')} seats, 3 seasons`}</span></td>
        <td class="n money">${fmtMoney(o.cost)}<br><span class="small-note">${plan.loan ? `loan ${fmtMoney(plan.monthly)}/month` : 'paid in cash'}</span></td>
        <td class="n hide-xs">${gate ? `+${fmtMoney(gate)}` : '-'}</td>
        <td class="r"><button class="btn small${no ? ' ghost' : ' primary'}" data-act="stadium-ask" data-i="${i}" title="${esc(no ?? 'The board should agree')}">Ask the board</button>${no ? '<br><span class="small-note st-no">Likely no</span>' : ''}</td></tr>`;
    }).join('');
    plans = `<div class="sub-head">Plans for the board</div>
      <p class="pad small-note">The board decide on their confidence in you, whether the club could fill the seats, and whether it can pay: cash they can spare first, the rest on a loan (8 years for a stand, 25 for a new ground, at 5%). The extra gate is a full season of league games at today's demand; a new ground also adds 8% to commercial income. Expected revenue this season: ${fmtMoney(expectedRevenue(g, c))}.</p>
      <div class="stadium-name"><label>New stadium name <input class="cm" id="st-name" maxlength="40" placeholder="${esc(c.name)} Stadium" autocomplete="off"></label>
        <label class="check"><input type="checkbox" id="st-rights"> Sell the naming rights instead</label></div>
      <div class="scroll"><table class="grid compact stadium-plans"><thead><tr><th>Plan</th><th class="n">Cost</th><th class="n hide-xs">Extra gate a season</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  return `<div class="club-grid">${facts}<div>${works}${loanLine}</div></div>${plans}
    <p class="pad small-note">Your fan base: about ${Math.round(fansOf(c)).toLocaleString('en-GB')} for a typical league game. A good season brings more, a bad one loses some; a high league position or a European campaign lifts demand for this season on top.</p>`;
}

export const stadiumActions: Record<string, Action> = {
  'stadium-ask': (ctx, el) => {
    const g = ctx.game;
    const c = userClub(g);
    const o = stadiumOptions(g, c)[Number(el.dataset.i)];
    if (!o) return;
    const name = (document.getElementById('st-name') as HTMLInputElement | null)?.value ?? '';
    const rights = !!(document.getElementById('st-rights') as HTMLInputElement | null)?.checked;
    const plan = fundingPlan(g, c, o);
    confirmModal({
      title: 'Put this to the board?',
      lines: [
        `${o.label}: ${o.capacity.toLocaleString('en-GB')} seats for ${fmtMoney(o.cost)}${o.kind === 'new' ? `, named ${rights ? 'after a sponsor (naming rights sold)' : name.trim() || `${c.name} Stadium`}` : ''}.`,
        plan.loan ? `${plan.cash ? `${fmtMoney(plan.cash)} from the bank, ` : ''}a ${fmtMoney(plan.loan)} loan over ${plan.years} years: ${fmtMoney(plan.monthly)} a month.` : 'Paid in cash from the bank balance.',
        boardObjection(g, c, o) ? 'The board may well say no, and they won\'t look at new plans for two months if they do.' : 'The board look likely to agree.',
      ],
      ok: 'Ask the board',
    }, () => {
      const r = requestStadium(g, o, name, rights);
      ctx.save();
      ctx.toast(r.ok ? r.message : 'The board said no. See your inbox.');
      ctx.render();
    });
  },
};
