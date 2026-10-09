import { assistantName, debrief, type HalfTimeReport, type Suggestion, type Tone } from '../engine/analysis.js';
import { club } from '../engine/game.js';
import type { Club, GameState, NewsItem } from '../engine/types.js';
import { storyHtml } from './article.js';
import { esc } from './format.js';
import { linkify } from './linkify.js';

/**
 * The assistant manager on screen: the half-time card on the live match screen and the
 * debrief message in the inbox after the final whistle.
 */

const initials = (name: string): string => name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();

function head(name: string, sub: string, label: string, tone: Tone, title?: string): string {
  return `<div class="asst-head"><div class="asst-av" aria-hidden="true">${esc(initials(name))}</div><div class="asst-who"><b>${esc(title ?? name)}</b><small>${esc(sub)}</small></div><span class="asst-badge ${tone}">${esc(label)}</span></div>`;
}

const TAG: Record<Suggestion['kind'], [string, string]> = {
  sub: ['Sub', 'sub'],
  mentality: ['Tactic', 'tac'],
  instr: ['Tactic', 'tac'],
  run: ['Player', 'tac'],
};

/** The half-time card: verdict, what he has seen, and his changes with one-tap buttons. */
export function htCardHtml(g: GameState, me: Club, rep: HalfTimeReport, applied: Set<number>): string {
  const name = assistantName(g, me);
  const obs = rep.observations.map((o) => `<li class="${o.tone}">${esc(o.text)}<small>${esc(o.evidence)}</small></li>`).join('');
  const rows = rep.suggestions.map((s, i) => {
    const done = applied.has(i);
    const [tag, cls] = TAG[s.kind];
    return `<div class="asst-sugg${done ? ' done' : ''}"><div class="t"><span class="asst-tag ${cls}">${tag}</span>${esc(s.text)}<small>${esc(s.why)}</small></div>${done ? '<span class="asst-done">Done ✓</span>' : `<button class="btn small primary" data-act="ht-apply" data-i="${i}">${s.kind === 'sub' ? 'Make it' : 'Apply'}</button>`}</div>`;
  }).join('');
  const left = rep.suggestions.filter((_, i) => !applied.has(i)).length;
  const what = rep.suggestions.length
    ? `<div class="asst-sec">What I'd do</div>${rows}`
    : `<div class="asst-sec">What I'd do</div><p class="asst-keep">Nothing. ${esc(rep.keep.replace(/^Or leave it: /, '').replace(/^Or leave it as it is\.$/, 'Leave it as it is.'))}</p>`;
  const foot = `<div class="asst-foot">${left > 1 ? `<button class="btn small" data-act="ht-apply-all">${left === rep.suggestions.length ? (left === 2 ? 'Apply both' : `Apply all ${left}`) : `Apply the other ${left === 2 ? 'two' : left}`}</button>` : ''}<button class="btn small ghost" data-act="ht-dismiss">${applied.size ? 'Close' : 'Thanks, leave it'}</button></div>`;
  return `<section class="asst-card ht" aria-label="Half-time notes">
    ${head(name, 'Assistant manager · half-time notes', rep.label, rep.tone)}
    <p class="asst-verdict">"${esc(rep.verdict)}"</p>
    <ol class="asst-list">${obs}</ol>
    <p class="asst-shape"><b>They're playing</b> ${esc(rep.shape)}</p>
    ${what}${foot}
  </section>`;
}

/** Shots per 15 minutes for both sides, as two rows of bars. */
function spellsHtml(ours: number[], theirs: number[], codes: [string, string], colours: [string, string]): string {
  const max = Math.max(1, ...ours, ...theirs);
  const bars = (v: number[], c: string) => v.map((n) => `<span style="height:${Math.max(3, (n / max) * 100)}%;background:${c}" title="${n} shot${n === 1 ? '' : 's'}"><i>${n || ''}</i></span>`).join('');
  const marks = ['0', '15', '30', '45', '60', '75', '90', ...(ours.length > 6 ? ['ET'] : [])];
  return `<div class="asst-spells"><span>${esc(codes[0])}</span><div class="asst-bars">${bars(ours, colours[0])}</div>
    <span>${esc(codes[1])}</span><div class="asst-bars">${bars(theirs, colours[1])}</div>
    <span></span><div class="asst-marks">${marks.map((m) => `<i>${m}</i>`).join('')}</div></div>`;
}

const rgb = (c: string): [number, number, number] => {
  const h = c.replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.padEnd(6, '0');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0) as [number, number, number];
};
const lum = (c: string): number => { const [r, g, b] = rgb(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const near = (a: string, b: string): boolean => { const x = rgb(a); const y = rgb(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 90; };

/** A club colour that shows up as a bar on the dark panels (not black, not white), else a fallback. */
function barColour(c: Club, fallback: string): string {
  return c.colours.find((x) => { const l = lum(x); return l > 0.2 && l < 0.9; }) ?? fallback;
}

/** The debrief message: the full card while the fixture is kept, else the text it was sent with. */
export function debriefHtml(g: GameState, n: NewsItem): string {
  const f = g.fixtures.find((x) => x.id === n.debrief);
  const d = f ? debrief(g, f) : null;
  if (!f || !d) return storyHtml(g, n);
  const me = club(g, g.userClubId);
  const side = f.homeId === g.userClubId ? 0 : 1;
  const opp = club(g, side === 0 ? f.awayId : f.homeId);
  const name = assistantName(g, me);
  const ourCol = barColour(me, '#4f7be0');
  let theirCol = barColour(opp, '#f0a500');
  if (near(ourCol, theirCol)) theirCol = near(ourCol, '#f0a500') ? '#d9e4fb' : '#f0a500';
  const players = d.players.map((p) => `<tr><td><button class="link" data-act="player" data-id="${p.id}">${esc(p.name)}</button>${p.motm ? ' <span class="asst-star" title="Man of the match">★</span>' : ''}</td><td>${p.rating.toFixed(1)}</td><td>${p.kp}</td><td>${p.sh}</td><td>${p.tk}</td></tr>`).join('');
  const changes = d.changes.length
    ? `<div class="asst-sec">Changes during the match</div><ul class="asst-changes">${d.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>${d.turning ? `<p class="asst-keep">${esc(d.turning)}</p>` : ''}`
    : '';
  return `<section class="asst-card debrief">
    ${head(name, `${name}, assistant manager`, d.label, d.tone, n.title.replace(/^Debrief: /, ''))}
    <ol class="asst-list">${d.points.map((p) => `<li>${linkify(g, p)}</li>`).join('')}</ol>
    <div class="asst-two">
      <div class="asst-box good"><h5>What worked</h5><ul>${d.positives.map((p) => `<li>${linkify(g, p)}</li>`).join('')}</ul></div>
      <div class="asst-box bad"><h5>What didn't</h5><ul>${d.concerns.map((p) => `<li>${linkify(g, p)}</li>`).join('')}</ul></div>
    </div>
    <div class="asst-sec">Shots by 15 minutes</div>
    ${spellsHtml(d.spells.ours, d.spells.theirs, d.codes, [ourCol, theirCol])}
    ${changes}
    <div class="asst-sec">Player notes</div>
    <div class="scroll"><table class="asst-tbl"><thead><tr><th>Player</th><th>Rat</th><th>Key passes</th><th>Shots</th><th>Tackles</th></tr></thead><tbody>${players}</tbody></table></div>
    ${d.nextLabel !== 'Next' ? `<div class="asst-sec">Looking ahead</div><p class="asst-ahead"><b>${linkify(g, d.nextLabel)}</b>${d.next.length ? ` ${linkify(g, d.next.join(' '))}` : ''}</p>` : ''}
    <div class="asst-foot"><button class="btn small" data-act="report" data-id="${f.id}">Match report ►</button></div>
  </section>`;
}
