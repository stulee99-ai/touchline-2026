import { nationName } from '../engine/intl.js';
import { posLabel } from '../engine/attributes.js';
import type { Club, Player } from '../engine/types.js';

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function fullName(p: Player): string {
  return p.firstName ? `${p.firstName} ${p.lastName}` : p.lastName;
}

/** Short name as used on team sheets: "B. Saka" (single-name players stay as they are). */
export function shortName(p: Player): string {
  return p.firstName ? `${p.firstName[0]}. ${p.lastName}` : p.lastName;
}

/** The assistant's star rating: 0.5–5 stars relative to this league. */
export function stars(ability: number): number {
  return Math.max(0.5, Math.min(5, Math.round(((ability - 90) / 16) * 2) / 2));
}

export function starBar(ability: number, label = 'Ability'): string {
  return starBarRaw(stars(ability), label);
}

/** A 0.5–5 star bar from an already-computed star count. */
export function starBarRaw(s: number, label: string): string {
  const v = Math.max(0.5, Math.min(5, Math.round(s * 2) / 2));
  return `<span class="stars" role="img" aria-label="${label}: ${v} of 5 stars"><span style="width:${(v / 5) * 100}%"></span></span>`;
}

export function attrClass(v: number): string {
  if (v >= 16) return 'a-hi';
  if (v >= 11) return 'a-good';
  if (v >= 6) return 'a-mid';
  return 'a-low';
}

export function moraleWord(m: number): string {
  if (m >= 88) return 'Superb';
  if (m >= 75) return 'Very Good';
  if (m >= 60) return 'Good';
  if (m >= 45) return 'Okay';
  if (m >= 30) return 'Poor';
  return 'Very Poor';
}

export function avgRating(p: Player): string {
  const apps = p.stats.apps + p.stats.subApps;
  return apps ? (p.stats.ratingSum / apps).toFixed(2) : '-';
}

export function formAvg(p: Player): string {
  return p.form.length ? (p.form.reduce((a, b) => a + b, 0) / p.form.length).toFixed(1) : '-';
}

export function pos(p: Player): string {
  return posLabel(p);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Club colours for a title strip, with a readable text colour. */
export function clubStrip(c: Club): string {
  const [bg, fg] = c.colours;
  const text = contrast(bg, fg) >= 3.5 ? fg : contrast(bg, '#ffffff') > contrast(bg, '#0b0f17') ? '#ffffff' : '#0b0f17';
  return `--strip-bg:${bg};--strip-fg:${text}`;
}

export function kit(c: Club): string {
  return `<span class="kit" style="--k1:${c.colours[0]};--k2:${c.colours[1]}" aria-hidden="true"></span>`;
}

/** Condition bands: fresh, a little tired, tired. */
export function condClass(c: number): string {
  return c >= 85 ? 'c-good' : c >= 70 ? 'c-ok' : 'c-low';
}

/** Condition as a coloured figure, e.g. in a squad list. */
export function condPill(c: number): string {
  return `<span class="cpill ${condClass(c)}" title="Condition ${Math.round(c)}%">${Math.round(c)}%</span>`;
}

/** A thin condition bar for a shirt on the pitch or bench. */
export function condBar(c: number): string {
  return `<span class="cbar ${condClass(c)}" title="Condition ${Math.round(c)}%"><i style="width:${Math.max(4, Math.min(100, c))}%"></i></span>`;
}

export function statusChips(p: Player): string {
  const out: string[] = [];
  if (p.injury) out.push(`<span class="chip bad" title="${esc(p.injury.name)}, ${injuryWeeks(p)} wk">INJ ${injuryWeeks(p)}w</span>`);
  if (p.suspended) out.push(`<span class="chip warn" title="Suspended for ${p.suspended} match(es)">SUS ${p.suspended}</span>`);
  if (p.away) out.push(`<span class="chip intl" title="Away with ${esc(nationName(p.away.nation))} (${esc(p.away.what)})">INT ${esc(p.away.nation)}</span>`);
  return out.join(' ');
}

export function resultChip(us: number, them: number): string {
  const r = us > them ? 'W' : us < them ? 'L' : 'D';
  return `<span class="res res-${r}">${r}</span>`;
}

/** A match minute as shown: 90+3', 105' in extra time, "Pens" in a shoot-out. */
export function minuteLabel(m: number, stage?: 'et' | 'pens' | boolean): string {
  if (stage === 'pens') return 'Pens';
  if (stage) return m > 120 ? `120+${m - 120}'` : `${m}'`;
  return m > 90 ? `90+${m - 90}'` : `${m}'`;
}

/** The coach's verdict on a player's current ability, in the old CM style. */
export function abilityWord(ca: number): string {
  if (ca >= 172) return 'World class';
  if (ca >= 162) return 'Excellent';
  if (ca >= 152) return 'Very good';
  if (ca >= 142) return 'Good';
  if (ca >= 130) return 'Decent';
  if (ca >= 115) return 'Average';
  if (ca >= 95) return 'Limited';
  return 'Poor';
}

export function potentialWord(p: { ca: number; pa: number; age: number }): string {
  if (p.age >= 29 || p.pa - p.ca < 4) return 'At his peak';
  if (p.pa >= 175) return 'Could be world class';
  if (p.pa >= 162) return 'Could be excellent';
  if (p.pa >= 150) return 'Could be very good';
  if (p.pa >= 138) return 'Could be a good player';
  return 'Could be a squad player';
}

export function injuryWeeks(p: Player): number {
  return p.injury ? Math.max(1, Math.ceil(p.injury.days / 7)) : 0;
}

/** A nation's code (or name) as a link to its national team page. */
export function nationLink(code: string, label = code): string {
  return `<button class="link nat-link" data-act="nation" data-n="${esc(code)}" title="National team">${esc(label)}</button>`;
}
