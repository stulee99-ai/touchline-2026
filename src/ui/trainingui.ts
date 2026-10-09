import { ATTR_LABEL, GOALKEEPING, MENTAL, PHYSICAL, TECHNICAL } from '../engine/attributes.js';
import { CAMP_FROM, CAMP_TO, REPORT_DAY } from '../engine/calendar.js';
import { fmtMoney } from '../engine/finance.js';
import { userClub } from '../engine/game.js';
import { sharpOf } from '../engine/prep.js';
import {
  campMoney, CAMPS, campOf, canRetrain, confirmPreseason, DRILLS, famWith, firstCompetitiveDay, FOCUSES, individualCount,
  MAX_INDIVIDUAL, planOf, retrainMonths, retrainRate, setFocus, setIndividual, setWorkload, trainableAttrs, WORKLOADS,
} from '../engine/training.js';
import type { AttrKey, CampKey, GameState, Player, Pos, TeamFocus, Workload } from '../engine/types.js';
import type { Action, Ctx } from './ctx.js';
import { esc, fullName, pos, statusChips } from './format.js';
import { confirmModal } from './modal.js';
import { clubLink, dateOf, panel, playerLink, posOrder, segs } from './screens.js';
import { type SCol, sortableTable } from './sortable.js';

export const POS_NAMES: Record<Pos, string> = {
  GK: 'Goalkeeper', DR: 'Right back', DL: 'Left back', DC: 'Centre back', DM: 'Defensive midfield', MR: 'Right midfield',
  ML: 'Left midfield', MC: 'Central midfield', AMR: 'Right wing', AML: 'Left wing', AMC: 'Attacking midfield', ST: 'Striker',
};
const RETRAIN_POS: Pos[] = ['DR', 'DC', 'DL', 'DM', 'MR', 'MC', 'ML', 'AMR', 'AMC', 'AML', 'ST'];

const meter = (v: number, label: string, neutral = false): string => {
  const cls = neutral ? '' : v < 55 ? 'bad' : v < 72 ? 'warn' : '';
  return `<div class="meter" role="img" aria-label="${esc(label)} ${Math.round(v)} out of 100"><i class="${cls}" style="width:${Math.max(2, Math.min(100, v))}%"></i></div>`;
};

function phase(g: GameState): string {
  const first = firstCompetitiveDay(g);
  if (g.day < REPORT_DAY) return `The squad is on its summer break. Players report back for pre-season on ${dateOf(g.season, REPORT_DAY)}.`;
  if (g.day < first) return `Pre-season: ${first - g.day} days until your first competitive match on ${dateOf(g.season, first)}.`;
  return 'The season is under way. Training carries on between matches.';
}

function campBox(ctx: Ctx): string {
  const g = ctx.game;
  const me = userClub(g);
  const plan = planOf(g, me);
  const open = plan.confirmed < g.season && g.day <= CAMP_FROM;
  if (!open) {
    if (plan.confirmed >= g.season && g.day <= CAMP_TO + 1 && g.day >= REPORT_DAY - 20) {
      return `<div class="warnbox info"><b>Pre-season plan set.</b> ${esc(campOf(plan.camp).label)}${plan.camp === 'home' ? '' : `, from ${dateOf(g.season, CAMP_FROM)} to ${dateOf(g.season, CAMP_TO)}`}.</div>`;
    }
    return '';
  }
  const sel = (ctx.ui.trainCamp ?? plan.camp) as CampKey;
  const cards = CAMPS.map((c) => {
    const m = campMoney(g, me, c.key);
    const money = m.cost ? `Costs ${fmtMoney(m.cost)}${m.income ? `, brings in ${fmtMoney(m.income)}` : ''}` : 'Free';
    return `<label class="camp${c.key === sel ? ' on' : ''}"><input type="radio" name="camp" value="${c.key}" data-change="train-camp"${c.key === sel ? ' checked' : ''}>
      <span><b>${esc(c.label)}</b><small>${esc(c.note)}</small></span><em>${esc(money)}</em></label>`;
  }).join('');
  return `<div class="warnbox ${g.day >= REPORT_DAY ? 'urgent' : 'warn'}"><b>Choose your pre-season plan.</b> The camp runs from ${dateOf(g.season, CAMP_FROM)} to ${dateOf(g.season, CAMP_TO)}, with four friendlies before the season starts. The players have been on holiday and need work to get sharp.
    <div class="camps">${cards}</div>
    <div class="row-btns"><button class="btn primary" data-act="train-confirm">Confirm pre-season plan</button></div></div>`;
}

function teamTab(ctx: Ctx): string {
  const g = ctx.game;
  const me = userClub(g);
  const plan = planOf(g, me);
  const squad = me.playerIds.map((id) => g.players[id]).filter(Boolean);
  const avg = squad.reduce((s, p) => s + sharpOf(p), 0) / Math.max(1, squad.length);
  const low = squad.filter((p) => sharpOf(p) < 70).length;
  const fams = Object.entries(plan.fam).sort((a, b) => b[1] - a[1]);
  if (!(me.tactics.formation in plan.fam)) fams.push([me.tactics.formation, famWith(plan, me.tactics.formation)]);
  const famRows = fams.map(([f, v]) => `<div class="prep-row"><span>${esc(f)}${f === me.tactics.formation ? ' <small>(current)</small>' : ''}</span>${meter(v, `Familiarity with ${f}`)}<b>${Math.round(v)}%</b></div>`).join('');
  const drillRows = DRILLS.map((d) => `<div class="prep-row" title="${esc(d.note)}"><span>${esc(d.label)}</span>${meter(plan.drills[d.key], d.label, true)}<b>${Math.round(plan.drills[d.key])}%</b></div>`).join('');
  const focus = FOCUSES.find((f) => f.key === plan.focus)!;
  const wl = WORKLOADS.find((w) => w.key === plan.workload)!;
  const friendlies = g.fixtures.filter((f) => f.comp === 'FRI').sort((a, b) => a.day - b.day);
  const fx = friendlies.length
    ? `<div class="sub-head">Pre-season friendlies</div><div class="scroll"><table class="grid compact"><tbody>${friendlies.map((f) => `<tr><td>${dateOf(g.season, f.day)}</td><td>${clubLink(g, f.homeId)}</td><td class="n">${f.result ? `${f.result.hg} - ${f.result.ag}` : 'v'}</td><td>${clubLink(g, f.awayId)}</td></tr>`).join('')}</tbody></table></div>`
    : '';
  return `${campBox(ctx)}
    <div class="train-grid">
      <div>
        <div class="sub-head">Weekly programme</div>
        <div class="pad-top"><b>Workload</b> ${segs(WORKLOADS.map((w) => [w.key, w.label] as [string, string]), plan.workload, 'train-work', 'w')}</div>
        <p class="pad small-note">${esc(wl.note)}</p>
        <div class="pad-top"><label for="tfocus"><b>Team focus</b></label>
          <select class="cm" id="tfocus" data-change="train-focus">${FOCUSES.map((f) => `<option value="${f.key}"${f.key === plan.focus ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select></div>
        <p class="pad small-note">${esc(focus.note)}</p>
      </div>
      <div>
        <div class="sub-head">Match sharpness</div>
        <div class="prep-row"><span>Squad average</span>${meter(avg, 'Average sharpness')}<b>${Math.round(avg)}%</b></div>
        <p class="pad small-note">${low ? `${low} player${low > 1 ? 's are' : ' is'} below 70%: ` : 'Everyone is above 70%. '}Sharper players play better, tire less and get hurt less. Games count for a lot, and a long injury takes it away again.</p>
        <div class="sub-head">Tactical familiarity</div>
        ${famRows}
        <p class="pad small-note">A side plays best in a shape it knows. A formation you haven't used starts at 60%.</p>
        <div class="sub-head">Drills</div>
        ${drillRows}
        <p class="pad small-note">50% is a normal side. Drills only help when your tactics use the instruction. Untrained drills fade back towards 50%.</p>
      </div>
    </div>
    ${fx}`;
}

function playersTab(ctx: Ctx): string {
  const g = ctx.game;
  const me = userClub(g);
  const squad = me.playerIds.map((id) => g.players[id]).filter(Boolean);
  const n = individualCount(g);
  const progNote = (p: Player): string => {
    const t = p.train;
    if (!t) return '';
    if ('attr' in t) return `${ATTR_LABEL[t.attr]}: ${p.attrs[t.attr]}`;
    const months = Math.max(1, Math.ceil((20 - t.progress) / retrainRate(p)));
    return `${t.pos}: ${Math.floor(t.progress)}/20 · about ${months} month${months > 1 ? 's' : ''} left`;
  };
  const select = (p: Player): string => {
    const t = p.train;
    const cur = !t ? '' : 'attr' in t ? `a:${t.attr}` : `p:${t.pos}`;
    const group = (label: string, keys: AttrKey[]) => {
      const ok = keys.filter((k) => trainableAttrs(p).includes(k) && (p.attrs[k] < 20 || cur === `a:${k}`));
      return ok.length ? `<optgroup label="${label}">${ok.map((k) => `<option value="a:${k}"${cur === `a:${k}` ? ' selected' : ''}>${ATTR_LABEL[k]} (${p.attrs[k]})</option>`).join('')}</optgroup>` : '';
    };
    const pos = RETRAIN_POS.filter((k) => !canRetrain(p, k)).map((k) => `<option value="p:${k}"${cur === `p:${k}` ? ' selected' : ''}>${POS_NAMES[k]} (${k}) · about ${retrainMonths(p, k)} months</option>`).join('');
    const keeper = (p.pos.GK ?? 0) >= 15;
    return `<select class="cm tsel" data-change="train-ind" data-id="${p.id}" aria-label="Individual programme for ${esc(fullName(p))}">
      <option value="">No individual programme</option>
      ${group('Technical', TECHNICAL)}${group('Mental', MENTAL)}${group('Physical', PHYSICAL)}${keeper ? group('Goalkeeping', GOALKEEPING) : ''}
      ${pos ? `<optgroup label="Learn a new position">${pos}</optgroup>` : ''}</select>`;
  };
  const cols: SCol[] = [
    { key: 'name', label: 'Name', val: (p) => p.lastName, html: (p) => `${playerLink(p)} ${statusChips(p)}` },
    { key: 'pos', label: 'Position', cls: 'hide-xs', val: (p) => posOrder(p), html: (p) => esc(pos(p)) },
    { key: 'age', label: 'Age', num: true, cls: 'hide-xs', val: (p) => p.age },
    { key: 'sharp', label: 'Sharp', title: 'Match sharpness', num: true, val: (p) => sharpOf(p), html: (p) => `<span class="cond ${sharpOf(p) < 70 ? 'low' : ''}">${Math.round(sharpOf(p))}%</span>` },
    { key: 'prog', label: 'Individual programme', val: (p) => (p.train ? ('attr' in p.train ? ATTR_LABEL[p.train.attr] : p.train.pos) : 'zzz'), html: select },
    { key: 'progress', label: 'Progress', cls: 'hide-sm', val: (p) => (p.train ? 0 : 1), html: (p) => `<span class="small-note">${esc(progNote(p))}</span>` },
  ];
  const { head, rows } = sortableTable(ctx, 'train-players', cols, squad, { key: 'prog', dir: 1 }, (a, b) => posOrder(a) - posOrder(b) || b.ca - a.ca);
  return `<p class="pad small-note">Your coaches can give <b>${MAX_INDIVIDUAL}</b> players individual work at once (${n} of ${MAX_INDIVIDUAL} used). Pick an attribute to improve, or teach a player a new position: a full retraining takes a season or two, and younger, quicker-learning players get there sooner. Older players find physical attributes almost impossible to improve.</p>
    <div class="scroll"><table class="grid squad"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function trainingScreen(ctx: Ctx): string {
  const g = ctx.game;
  const me = userClub(g);
  const tab = ctx.ui.trainTab ?? 'team';
  const body = `<p class="pad">${esc(phase(g))}</p>
    <div class="pad-top">${segs([['team', 'Team'], ['players', 'Individual and positions']], tab, 'train-tab', 't')}</div>
    ${tab === 'team' ? teamTab(ctx) : playersTab(ctx)}`;
  return panel(me, 'Training', body);
}

const focusFrom = (v: string): TeamFocus => v as TeamFocus;

export const trainActions: Record<string, Action> = {
  'train-tab': (ctx, el) => { ctx.ui.trainTab = el.dataset.t as 'team' | 'players'; ctx.render(); },
  'train-work': (ctx, el) => { setWorkload(ctx.game, el.dataset.w as Workload); ctx.save(); ctx.render(); },
  'train-confirm': (ctx) => {
    const g = ctx.game;
    const me = userClub(g);
    const key = (ctx.ui.trainCamp ?? planOf(g, me).camp) as CampKey;
    const camp = campOf(key);
    const m = campMoney(g, me, key);
    confirmModal({
      title: 'Confirm pre-season plan',
      lines: [camp.label, m.cost ? `The trip costs ${fmtMoney(m.cost)}${m.income ? ` and brings in ${fmtMoney(m.income)}` : ''}.` : 'It costs nothing.', 'You can\'t change the camp once it is booked.'],
      ok: 'Yes, book it',
    }, () => {
      const err = confirmPreseason(g, key);
      if (err) ctx.toast(err);
      ctx.ui.trainCamp = undefined;
      ctx.save();
      ctx.render();
    });
  },
};

export const trainChangeActions: Record<string, (ctx: Ctx, el: HTMLSelectElement) => void> = {
  'train-camp': (ctx, el) => { ctx.ui.trainCamp = el.value as CampKey; ctx.render(); },
  'train-focus': (ctx, el) => { setFocus(ctx.game, focusFrom(el.value)); ctx.save(); ctx.render(); },
  'train-ind': (ctx, el) => {
    const id = Number(el.dataset.id);
    const v = el.value;
    let err: string | null;
    if (!v) err = setIndividual(ctx.game, id, null);
    else if (v.startsWith('a:')) err = setIndividual(ctx.game, id, { attr: v.slice(2) as AttrKey });
    else err = setIndividual(ctx.game, id, { pos: v.slice(2) as Pos, progress: 0 });
    if (err) ctx.toast(err);
    ctx.save();
    ctx.render();
  },
};
