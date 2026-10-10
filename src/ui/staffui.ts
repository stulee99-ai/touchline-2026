import { fmtMoney, fmtWage } from '../engine/finance.js';
import { dayLabel, userClub } from '../engine/game.js';
import {
  assistantOf, assistantQuality, hireAssistant, maxQualityFor, ratingWord, sackAssistant, sackCost, searchCandidates, searchWait, willJoin,
} from '../engine/staff.js';
import type { Assistant } from '../engine/types.js';
import type { Action, Ctx } from './ctx.js';
import { esc, nationLink } from './format.js';
import { confirmModal } from './modal.js';

/**
 * Club Info › Staff: the assistant manager (his two ratings and what they do), sacking him, and the
 * candidates for the job.
 */

/** A 1–20 rating as a short bar with the number and a word. */
function ratingBar(v: number, label: string): string {
  const cls = v >= 15 ? 'hi' : v >= 10 ? 'mid' : 'lo';
  return `<span class="st-rate ${cls}" role="img" aria-label="${esc(label)}: ${v} out of 20, ${ratingWord(v).toLowerCase()}"><i style="width:${(v / 20) * 100}%"></i></span><b class="st-num">${v}</b>`;
}

/** A rating as a coloured number, for the candidates table. */
function pill(v: number, label: string): string {
  const cls = v >= 15 ? 'hi' : v >= 10 ? 'mid' : 'lo';
  return `<b class="st-pill ${cls}" title="${esc(label)}: ${ratingWord(v).toLowerCase()}">${v}</b>`;
}

function card(ctx: Ctx, a: Assistant): string {
  const g = ctx.game;
  const c = userClub(g);
  const cost = sackCost(a);
  return `<div class="st-card">
    <div class="st-who"><div class="asst-av" aria-hidden="true">${esc(a.name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase())}</div>
      <div><b>${esc(a.name)}</b><small>${a.caretaker ? 'Caretaker: the youth team coach, standing in' : 'Assistant manager'} · ${nationLink(a.nation)} · age ${a.age}${a.caretaker ? '' : ` · ${fmtWage(a.wage)} · joined ${a.joined}/${String((a.joined + 1) % 100).padStart(2, '0')}`}</small></div></div>
    <div class="st-ratings">
      <div class="st-row"><span class="st-lab">Reading the game</span>${ratingBar(a.read, 'Reading the game')}<span class="st-word">${ratingWord(a.read)}</span>
        <p class="small-note">His half-time notes and the debrief after the match (how much he spots, and how good his advice is), and his changes when you skip to full time.</p></div>
      <div class="st-row"><span class="st-lab">Judging players</span>${ratingBar(a.judge, 'Judging players')}<span class="st-word">${ratingWord(a.judge)}</span>
        <p class="small-note">The XI and bench he picks when you let him (he has his favourites), and who he brings on.</p></div>
    </div>
    ${a.caretaker
      ? `<p class="deal-msg">There's no assistant manager at the moment. ${esc(a.name)} is helping out until you appoint one from the list below.</p>`
      : `<div class="row-btns"><button class="btn ghost" data-act="asst-sack">Sack him…</button></div><p class="small-note">Sacking him costs ${fmtMoney(cost)} (six months' wages). The youth team coach stands in until you appoint someone.</p>`}
    <p class="small-note">A world-class assistant makes the calls a good manager would; a poor one makes more mistakes. ${esc(c.name)} can attract assistants rated up to about ${Math.min(20, Math.floor(maxQualityFor(c)))} out of 20.</p>
  </div>`;
}

export function staffTab(ctx: Ctx): string {
  const g = ctx.game;
  const c = userClub(g);
  const a = assistantOf(g);
  const pool = g.staffMarket?.pool ?? [];
  const wait = searchWait(g);
  const rows = pool.map((x) => {
    const ok = willJoin(x, c);
    const better = assistantQuality(x) > assistantQuality(a);
    return `<tr class="${ok ? '' : 'st-out'}"><td><b>${esc(x.name)}</b><small class="st-sub">${esc(x.nation)} · ${x.age}</small></td>
      <td class="n">${pill(x.read, 'Reading the game')}</td><td class="n">${pill(x.judge, 'Judging players')}</td>
      <td class="n">${fmtWage(x.wage).replace(' p/w', '')}</td>
      <td class="r">${ok ? `<button class="btn small${better ? ' primary' : ''}" data-act="asst-hire" data-id="${x.id}">Appoint…</button>` : '<span class="chip" title="He would only join a bigger club">Not interested</span>'}</td></tr>`;
  }).join('');
  return `${card(ctx, a)}
    <div class="sub-head">Find an assistant</div>
    <p class="pad small-note">Candidates for the job. The best only join big clubs; the list is drawn up afresh each month.</p>
    <div class="scroll"><table class="grid compact st-table"><thead><tr><th>Name</th><th class="n" title="Reading the game">Reads</th><th class="n" title="Judging players">Judges</th><th class="n" title="Weekly wage">Wage p/w</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="pad">Nobody available.</td></tr>'}</tbody></table></div>
    <div class="row-btns pad"><button class="btn" data-act="asst-search" ${wait ? 'disabled' : ''}>Search again</button>${wait ? `<span class="small-note">New names on ${esc(dayLabel(g.season, g.day + wait))}.</span>` : ''}</div>`;
}

export const staffActions: Record<string, Action> = {
  'asst-sack': (ctx) => {
    const a = assistantOf(ctx.game);
    if (a.caretaker) return;
    confirmModal({
      title: `Sack ${a.name}?`,
      lines: [`Paying up his contract costs ${fmtMoney(sackCost(a))} (six months' wages).`, 'The youth team coach stands in until you appoint someone, and he isn\'t up to much.'],
      ok: 'Sack him',
    }, () => {
      const err = sackAssistant(ctx.game);
      ctx.toast(err ?? `${a.name} has gone.`);
      ctx.save();
      ctx.render();
    });
  },
  'asst-hire': (ctx, el) => {
    const g = ctx.game;
    const x = g.staffMarket?.pool.find((p) => p.id === Number(el.dataset.id));
    if (!x) return;
    const old = assistantOf(g);
    confirmModal({
      title: `Appoint ${x.name}?`,
      lines: [
        `Reading the game ${x.read}, judging players ${x.judge}. ${fmtWage(x.wage)}.`,
        old.caretaker ? `${old.name} goes back to the youth team.` : `${old.name} leaves: paying up his contract costs ${fmtMoney(sackCost(old))}.`,
      ],
      ok: 'Appoint him',
    }, () => {
      const err = hireAssistant(g, x.id);
      ctx.toast(err ?? `${x.name} is your new assistant.`);
      ctx.save();
      ctx.render();
    });
  },
  'asst-search': (ctx) => {
    const err = searchCandidates(ctx.game);
    ctx.toast(err ?? 'A new list of candidates.');
    ctx.save();
    ctx.render();
  },
};
