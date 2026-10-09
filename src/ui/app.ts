import { confidenceWord } from '../engine/board.js';
import { trainActions, trainChangeActions, trainingScreen } from './trainingui.js';
import { search, searchBox } from './search.js';
import { compareActions, compareScreen } from './compare.js';
import { lineupBlockers, pendingDecisions, playUntilDecision } from '../engine/decisions.js';
import { dayLabel, targetText, seasonLabel, seasonOver, takeCharge, nextMatchDay, userClub, userNextFixture, userPlaysNext } from '../engine/game.js';
import { newGame } from '../engine/generate.js';
import { COUNTRY_NAMES, leagueCountry, tierOf } from '../engine/pyramid.js';
import { migrateSave } from '../engine/migrate.js';
import { available, BENCH_SIZE, pickBench, resolveBench, resolveLineup } from '../engine/tactics.js';
import { windowOpen } from '../engine/transfers.js';
import type { GameMode, GameState } from '../engine/types.js';
import { storyHtml } from './article.js';
import type { Action, Ctx, Screen, UiState } from './ctx.js';
import { clubStrip, esc, kit, starBar, starBarRaw } from './format.js';
import { finishLiveMatch, isLive, liveActions, liveChangeActions, liveDrop, liveFinished, matchScreen, resumeAfterRender, startLiveMatch } from './live.js';
import { installDragDrop } from './dnd.js';
import { landscape, shortContinue, shortDate, watchLandscape } from './layout.js';
import * as S from './screens.js';
import { injuryActions } from './injuryui.js';
import { financesScreen, marketActions, marketChangeActions, transfersScreen } from './market.js';
import { scoutActions, scoutingScreen } from './scoutui.js';
import { cupActions, cupsScreen } from './cupui.js';
import { stadiumActions } from './stadiumui.js';
import { intlActions, intlChangeActions, intlScreen, nationScreen } from './intlui.js';
import { confirmModal } from './modal.js';
import { fullScreenPanel, fullScreenPrompt } from './fullscreen.js';
import { describeSave, gunzip, gzip, makeSaveFile, offerFile, parseSaveFile, savePanel as savePanelHtml } from './saveio.js';

const SAVE_KEY = 'touchline.save.v3';
const OLD_KEYS = ['touchline.save.v2', 'touchline.save'];

interface Hot {
  data?: { game?: GameState | null; ui?: UiState };
  ready?: (fn: (data: Hot['data']) => void) => void;
  snapshot?: (fn: () => unknown) => void;
}
declare global {
  interface Window { claude?: { hot?: Hot; use?: (name: string) => Promise<unknown> } }
}

let game: GameState | null = null;
let ui: UiState = { screen: 'inbox' };
const backStack: UiState[] = [];
let setupSeed = Math.floor(Math.random() * 1e9);
let setupWorld: GameState | null = null;
/** Chosen on the first screen; null until the player picks Classic or Flying Ants. */
let setupMode: GameMode | null = null;
let managerName = 'The Gaffer';
let root: HTMLElement;

/* ───────────────────────── Saving ─────────────────────────
 * A six-league world is several megabytes of JSON, more than localStorage's usual 5 MB,
 * so saves are gzipped (CompressionStream) and stored as base64: roughly a tenth of the size.
 */

async function load(): Promise<GameState | null> {
  try {
    for (const k of OLD_KEYS) localStorage.removeItem(k);
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrateSave(JSON.parse(await gunzip(raw)));
  } catch {
    return null;
  }
}

let saving = false;
let saveAgain = false;
let saveWarned = false;

/** Save in the background. Calls made while a save is running collapse into one follow-up save. */
function save(): void {
  if (!game) return;
  if (saving) {
    saveAgain = true;
    return;
  }
  saving = true;
  const snapshot = JSON.stringify(game);
  const write = async () => {
    const data = typeof CompressionStream === 'function' ? await gzip(snapshot) : snapshot;
    if (!game) return; // a new game was started while compressing
    localStorage.setItem(SAVE_KEY, data);
  };
  write()
    .catch(() => {
      // Storage full or blocked: the game carries on in memory.
      if (!saveWarned) toast('Could not save – this browser is blocking storage');
      saveWarned = true;
    })
    .finally(() => {
      saving = false;
      if (saveAgain) {
        saveAgain = false;
        save();
      }
    });
}

function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

let toastTimer = 0;
function toast(msg: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}

function go(screen: Screen, extra: Partial<UiState> = {}): void {
  if ((ui.screen !== screen || (extra.clubId !== undefined && extra.clubId !== ui.clubId)) && screen !== 'match') backStack.push({ ...ui });
  if (backStack.length > 20) backStack.shift();
  const same = ui.screen === screen;
  const moved = (['playerId', 'clubId', 'fixtureId', 'nation'] as const).some((k) => k in extra && extra[k] !== ui[k]);
  ui = { ...ui, slot: null, benchSlot: null, confirm: null, ...extra, screen };
  moreOpen = false;
  keepScroll = same;
  keepMain = same && !moved;
  render();
  window.scrollTo({ top: 0 });
}

const ctx: Ctx = {
  get game() {
    return game!;
  },
  get ui() {
    return ui;
  },
  go,
  save,
  render,
  toast,
};

/* ───────────────────────── Setup (choose a club) ───────────────────────── */

let setupLeague = 'ENG';

/** The very first screen: Classic Mode, or the Flying Ants what-if. */
function modeScreen(): string {
  return `<div class="setup">
    <header class="setup-hero">
      <span class="brand">TOUCHLINE <b>2026</b></span>
      <p>A football management game in the spirit of the classics. Six countries and fourteen divisions, all playing at once: four English tiers and two each in Spain, Germany, Italy, France and Portugal, with promotion, relegation and play-offs. First, choose how you want to play.</p>
    </header>
    <section class="panel">
      <header class="strip"><h2>New Game <small>– Choose a mode</small></h2></header>
      <div class="mode-grid">
        <button class="mode-card" data-act="setup-mode" data-m="classic">
          <span class="mode-name">Classic Mode</span>
          <span class="mode-tag">The real world</span>
          <span class="mode-text">Squads, clubs and fixtures as they stand in September 2026. Pick any of 280 clubs, from the Premier League down to League Two or the second tier abroad, and take charge.</span>
          <span class="btn primary">Play Classic Mode ►</span>
        </button>
        <button class="mode-card ants" data-act="setup-mode" data-m="flying-ants">
          <span class="mode-name">Flying Ants Mode</span>
          <span class="mode-tag">A what-if · fictional</span>
          <span class="mode-text">Manchester City are gone, and their players are free agents. In their place a new club, Flying Ants, has appeared in the Premier League with ten scouted players and a ground of their own. Take them on, or manage anyone else and pick over the pieces.</span>
          <span class="btn primary">Play Flying Ants Mode ►</span>
        </button>
      </div>
    </section>
    <section class="panel"><div class="pad">${savePanelHtml(false)}${fullScreenPanel()}</div></section>
    <p class="disclaimer">This is an unofficial fan game with no connection to any league, club or player. Flying Ants Mode is a fictional scenario: none of it has happened.</p>
  </div>`;
}

function setupScreen(): string {
  if (!setupMode) return modeScreen();
  if (!setupWorld) setupWorld = newGame(setupSeed, undefined, setupMode);
  const w = setupWorld;
  const ants = w.mode === 'flying-ants';
  const league = w.comps.find((c) => c.id === setupLeague) ?? w.comps[0];
  const clubs = league.clubIds.map((id) => w.clubs[id - 1]).sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name));
  const size = league.clubIds.length;
  const rows = clubs.map((c) => {
    const squad = c.playerIds.map((id) => w.players[id]).sort((a, b) => b.ca - a.ca);
    const first = squad.slice(0, 16);
    const avg = first.reduce((s, p) => s + p.ca, 0) / first.length;
    const star = squad[0];
    const target = targetText(w, c.id);
    const fresh = ants && c.id === w.scenario?.clubId;
    return `<tr${fresh ? ' class="new-club"' : ''}><td>${kit(c)}<b>${esc(c.name)}</b>${fresh ? ' <span class="chip new">New club</span>' : ''}</td><td class="hide-xs">${starBarRaw(c.reputation / 2, 'Reputation')}</td><td>${starBar(avg, 'Squad strength')}</td>
      <td class="hide-sm">${esc(`${star.firstName} ${star.lastName}`.trim())}</td><td class="hide-sm">${esc(target)}</td>
      <td class="r"><button class="btn small primary" data-act="setup-pick" data-id="${c.id}">Manage</button></td></tr>`;
  }).join('');
  // Two rows of tabs: the country, then that country's divisions (top division first).
  const countryOf = (c: { id: string }) => leagueCountry(c.id);
  const countries = [...new Set(w.comps.map(countryOf))];
  const country = countryOf(league);
  const countryTabs = countries.map((k) => `<button class="seg${k === country ? ' on' : ''}" data-act="setup-country" data-k="${k}" role="tab" aria-selected="${k === country}">${esc(COUNTRY_NAMES[k] ?? k)}</button>`).join('');
  const divisions = w.comps.filter((c) => countryOf(c) === country).sort((a, b) => tierOf(a.id) - tierOf(b.id));
  const tabs = divisions.map((c) => `<button class="seg${c.id === league.id ? ' on' : ''}" data-act="setup-league" data-c="${c.id}" role="tab" aria-selected="${c.id === league.id}">${esc(c.name)}</button>`).join('');
  const players = w.clubs.reduce((n, c) => n + c.playerIds.length, 0);
  // Flying Ants mode opens with the news: the reason there is a new club at all.
  const front = ants && w.news[0]
    ? `<section class="panel front-page"><header class="strip"><h2>Front page <small>– Breaking news</small></h2></header><article class="news-body story">${storyHtml(w, w.news[0])}<p class="small-note">Scroll down to choose a club. Flying Ants are in the Premier League tab.</p></article></section>`
    : '';
  return `<div class="setup">
    <header class="setup-hero">
      <span class="brand">TOUCHLINE <b>2026</b></span>
      <p>${ants ? 'Flying Ants Mode. ' : ''}Six countries and fourteen divisions: England's top four tiers, and the top two in Spain, Germany, Italy, France and Portugal, ${seasonLabel(w)}. ${w.clubs.length} clubs and ${players.toLocaleString('en-GB')} players, all playing at once. Choose a club, pick your side and press Continue.</p>
    </header>
    ${front}
    <section class="panel">
      <header class="strip"><h2>New Game <small>– Choose a club</small></h2><span class="strip-meta">${esc(COUNTRY_NAMES[country] ?? country)} · ${league.name} · ${size} clubs · ${(size - 1) * 2} matchdays</span><button class="btn small" data-act="setup-back">◄ Change mode</button></header>
      <div class="setup-form">
        <label for="mgr">Manager name</label><input id="mgr" maxlength="28" value="${esc(managerName)}" autocomplete="off">
      </div>
      <div class="pad-top setup-tabs">
        <div class="tab-row"><span class="tab-label">Country</span><div class="segs comp-tabs" role="tablist" aria-label="Country">${countryTabs}</div></div>
        <div class="tab-row"><span class="tab-label">League</span><div class="segs comp-tabs" role="tablist" aria-label="League">${tabs}</div></div>
      </div>
      <div class="scroll"><table class="grid setup-table"><thead><tr><th>Club</th><th class="hide-xs">Reputation</th><th>Squad</th><th class="hide-sm">Best player</th><th class="hide-sm">Board expectation</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="disclaimer">Squads as of September 2026. Player ratings are Touchline's own estimates. This is an unofficial fan game with no connection to any league, club or player.${ants ? ' Flying Ants Mode is a fictional scenario: none of it has happened.' : ''}</p>
    </section>
  </div>`;
}

const setupActions: Record<string, Action> = {
  'setup-mode': (_c, el) => {
    const m = el.dataset.m as GameMode;
    if (setupMode !== m) setupWorld = null;
    setupMode = m;
    setupLeague = 'ENG';
    render();
    window.scrollTo({ top: 0 });
  },
  'setup-back': () => {
    setupMode = null;
    setupWorld = null;
    render();
    window.scrollTo({ top: 0 });
  },
  'setup-country': (_c, el) => {
    const w = setupWorld;
    const top = w?.comps.filter((c) => leagueCountry(c.id) === el.dataset.k).sort((a, b) => tierOf(a.id) - tierOf(b.id))[0];
    if (top) setupLeague = top.id;
    render();
  },
  'setup-league': (_c, el) => {
    setupLeague = el.dataset.c!;
    render();
  },
  'setup-pick': (_c, el) => {
    const w = setupWorld ?? newGame(setupSeed, undefined, setupMode ?? 'classic');
    const name = managerName.trim() || 'The Gaffer';
    takeCharge(w, Number(el.dataset.id), name);
    game = w;
    setupWorld = null;
    setupMode = null;
    backStack.length = 0;
    ui = { screen: 'inbox' };
    save();
    render();
    window.scrollTo({ top: 0 });
  },
};

/* ───────────────────────── Shell ───────────────────────── */

const NAV: [Screen, string][] = [
  ['inbox', 'Inbox'], ['squad', 'Squad'], ['tactics', 'Tactics'], ['training', 'Training'], ['fixtures', 'Fixtures'], ['table', 'League Table'], ['cups', 'Cups'], ['intl', 'Internationals'], ['stats', 'Statistics'], ['transfers', 'Transfers'], ['scouting', 'Scouting'], ['finances', 'Finances'], ['club', 'Club Info'],
];

function continueLabel(): { label: string; disabled: boolean } {
  const g = game!;
  if (isLive()) return liveFinished() ? { label: 'Continue', disabled: false } : { label: 'Match in progress', disabled: true };
  if (g.board?.sacked) return { label: 'Choose a new club', disabled: true };
  const waiting = pendingDecisions(g).length;
  if (waiting) return { label: `Respond first (${waiting})`, disabled: false };
  if (ui.screen === 'prematch' && lineupBlockers(g).length) return { label: 'Fix your XI', disabled: false };
  if (seasonOver(g)) return { label: ui.screen === 'season-end' ? 'Next season' : 'Season review', disabled: false };
  return { label: ui.screen === 'prematch' ? 'Kick off ►' : 'Continue', disabled: false };
}

function mainScreen(): string {
  if (game?.board?.sacked && !isLive()) return S.sackedScreen(ctx);
  switch (ui.screen) {
    case 'compare': return compareScreen(ctx);
    case 'training': return trainingScreen(ctx);
    case 'squad': return S.squad(ctx);
    case 'player': return S.player(ctx);
    case 'tactics': return S.tactics(ctx);
    case 'fixtures': return S.fixtures(ctx);
    case 'table': return S.table(ctx);
    case 'stats': return S.stats(ctx);
    case 'club': return S.clubScreen(ctx);
    case 'report': return S.report(ctx);
    case 'season-end': return S.seasonEnd(ctx);
    case 'match': return matchScreen(ctx);
    case 'prematch': return S.prematch(ctx);
    case 'transfers': return transfersScreen(ctx);
    case 'finances': return financesScreen(ctx);
    case 'scouting': return scoutingScreen(ctx);
    case 'cups': return cupsScreen(ctx);
    case 'intl': return intlScreen(ctx);
    case 'nation': return nationScreen(ctx);
    default: return S.inbox(ctx);
  }
}

function shell(): string {
  const g = game!;
  const c = userClub(g);
  const main = mainScreen();
  const unread = g.news.filter((n) => !n.read).length;
  const live = isLive();
  const cont = continueLabel();
  const nf = userNextFixture(g);
  const date = seasonOver(g) ? `End of season ${seasonLabel(g)}` : dayLabel(g.season, ui.screen === 'prematch' && nf ? nf.day : g.day);
  const nav = NAV.map(([s, label]) => `<button class="menu-btn${ui.screen === s ? ' on' : ''}" data-act="nav" data-s="${s}" ${live ? 'disabled' : ''}>${label}${s === 'inbox' && unread ? `<span class="badge">${unread}</span>` : ''}</button>`).join('');
  return `<header class="toolbar">
      <div class="tb-nav">
        <button class="bevel" data-act="back" title="Back" ${live ? 'disabled' : ''}>◄<span class="label"> Back</span></button>
        <button class="bevel" data-act="nav" data-s="inbox" title="Home" ${live ? 'disabled' : ''}>⌂<span class="label"> Home</span></button>
      </div>
      <span class="brand">TOUCHLINE <b>2026</b></span>
      <div class="tb-info"><span class="date">${date}${windowOpen(g) ? ' <span class="chip tv" title="Transfer window open">Window open</span>' : ''}</span><span class="mgr">${esc(g.managerName)} · ${esc(c.name)} · Board: ${esc(confidenceWord(g.board?.confidence ?? 60))}</span></div>
      ${searchBox()}
      <button class="btn continue" data-act="continue" title="Continue (Space)" ${cont.disabled ? 'disabled' : ''}>${cont.label}</button>
    </header>
    <nav class="menubar" style="${clubStrip(c)}" aria-label="Main">${nav}</nav>
    <main class="main">${main}</main>`;
}

/* ── Landscape phones: a menu strip down the left edge, Continue at its foot, and panels that scroll on their own ── */

const RAIL: [Screen, string, string][] = [
  ['inbox', 'Inbox', 'M2 3.5h12v9H2z M2.5 4.5L8 9l5.5-4.5'],
  ['squad', 'Squad', 'M3.7 5.5a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0 M2 13c0-2.4 1.8-4 4-4s4 1.6 4 4 M11 9.2c1.8 0 3 1.4 3 3.3 M9.7 6a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0'],
  ['tactics', 'Tactics', 'M2 2h12v12H2z M2 8h12 M6 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0'],
  ['fixtures', 'Fixtures', 'M2 3h12v11H2z M2 6.5h12 M5 1.5v3 M11 1.5v3'],
  ['table', 'Table', 'M2 3.5h12 M2 8h12 M2 12.5h12 M5 2v12'],
  ['transfers', 'Transfers', 'M2 5h10L9.5 2.5 M14 11H4l2.5 2.5'],
];
const svgIcon = (d: string, w = 1.6) => `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
/** The "More" menu on the landscape strip: every other screen, Back and search. */
let moreOpen = false;

function railShell(): string {
  const g = game!;
  const c = userClub(g);
  const live = isLive();
  const cont = continueLabel();
  const unread = g.news.filter((n) => !n.read).length;
  const nf = userNextFixture(g);
  const [dow, dm] = seasonOver(g) ? ['End of', seasonLabel(g)] : shortDate(dayLabel(g.season, ui.screen === 'prematch' && nf ? nf.day : g.day));
  const inRail = new Set(RAIL.map((r) => r[0]));
  const items = RAIL.map(([s, label, d]) => `<button class="rail-btn${ui.screen === s ? ' on' : ''}" data-act="nav" data-s="${s}" ${live ? 'disabled' : ''} aria-label="${label}${s === 'inbox' && unread ? `, ${unread} unread` : ''}">${svgIcon(d)}<span>${label}</span>${s === 'inbox' && unread ? `<b class="badge">${unread}</b>` : ''}</button>`).join('');
  const moreOn = moreOpen || !inRail.has(ui.screen) && ui.screen !== 'match' && ui.screen !== 'prematch';
  const more = `<button class="rail-btn${moreOn ? ' on' : ''}" data-act="ls-more" ${live ? 'disabled' : ''} aria-expanded="${moreOpen}" aria-label="More screens">${svgIcon('M3 8h0.5 M7.75 8h0.5 M12.5 8h0.5', 2.8)}<span>More</span></button>`;
  const contIcon = cont.disabled ? '<i class="rail-live" aria-hidden="true"></i>' : '<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M2.5 2.5l6 5.5-6 5.5zM8.5 2.5l6 5.5-6 5.5z"/></svg>';
  const menu = moreOpen && !live
    ? `<div class="more-back" data-act="ls-more"></div><div class="more-menu" role="dialog" aria-label="All screens">
        <div class="more-top"><button class="btn" data-act="back">◄ Back</button><div class="more-info"><b>${esc(c.name)} · ${esc(dayLabel(g.season, g.day))}</b><span>${esc(g.managerName)} · Board: ${esc(confidenceWord(g.board?.confidence ?? 60))}${windowOpen(g) ? ' · <span class="chip tv">Window open</span>' : ''}</span></div></div>
        ${searchBox()}
        <div class="more-grid">${NAV.map(([s, label]) => `<button class="menu-btn${ui.screen === s ? ' on' : ''}" data-act="nav" data-s="${s}">${label}</button>`).join('')}</div>
      </div>`
    : '';
  return `<div class="ls-shell">
      <nav class="rail" style="${clubStrip(c)}" aria-label="Main">
        <div class="rail-date" title="${esc(dayLabel(g.season, g.day))}"><span>${esc(dow)}</span><b>${esc(dm)}</b></div>
        ${items}${more}
        <button class="rail-go" data-act="continue" title="Continue" ${cont.disabled ? 'disabled' : ''}>${contIcon}<span>${esc(shortContinue(cont.label))}</span></button>
      </nav>
      <main class="main" id="main">${mainScreen()}</main>
      ${menu}
    </div>`;
}

/** Scroll positions to keep across a re-render of the same screen (the page itself doesn't scroll in landscape). */
let keepScroll = true;
/** False when the same screen opens on a different player, club or match: the page goes back to the top. */
let keepMain = true;
function scrollState(): Map<string, number> {
  const m = new Map<string, number>();
  root.querySelectorAll<HTMLElement>(keepMain ? '#main, [data-keep-scroll]' : '[data-keep-scroll]').forEach((el) => {
    const key = el.id || el.dataset.keepScroll || '';
    if (key && el.scrollTop) m.set(key, el.scrollTop);
  });
  return m;
}

function render(): void {
  if (!root) return;
  const mgr = document.getElementById('mgr') as HTMLInputElement | null;
  if (mgr) managerName = mgr.value;
  const ls = landscape() && !!game;
  const kept = ls && keepScroll ? scrollState() : null;
  keepScroll = true;
  keepMain = true;
  root.innerHTML = game ? (ls ? railShell() : shell()) : setupScreen();
  if (kept?.size) {
    root.querySelectorAll<HTMLElement>('#main, [data-keep-scroll]').forEach((el) => {
      const v = kept.get(el.id || el.dataset.keepScroll || '');
      if (v) el.scrollTop = v;
    });
  }
  if (game && ui.screen === 'match') resumeAfterRender(ctx);
}

/* ───────────────────────── Actions ───────────────────────── */

const coreActions: Record<string, Action> = {
  nav: (_c, el) => {
    backStack.length = 0;
    go(el.dataset.s as Screen, { sortKey: ui.sortKey, sortDir: ui.sortDir, clubId: undefined, clubTab: undefined });
  },
  back: () => {
    const prev = backStack.pop();
    moreOpen = false;
    if (prev) {
      ui = { ...prev, confirm: null, compare: ui.compare }; // the comparison list survives going back
      keepScroll = false;
      render();
    } else go('inbox');
  },
  'ls-more': () => {
    moreOpen = !moreOpen;
    render();
    if (moreOpen) (document.querySelector('.more-menu .menu-btn.on, .more-menu .menu-btn') as HTMLElement | null)?.focus();
  },
  continue: () => {
    const g = game!;
    if (isLive()) {
      if (liveFinished()) finishLiveMatch(ctx);
      return;
    }
    if (seasonOver(g)) {
      if (ui.screen === 'season-end') S.screenActions['next-season'](ctx, document.body);
      else go('season-end');
      return;
    }
    if (ui.screen === 'report' && ui.afterMatch) {
      go('inbox', { afterMatch: false });
      return;
    }
    // Continue plays through days when the manager's club is idle (the other leagues, or
    // his own league's rest weeks), then stops at the pre-match screen; from there it kicks off.
    // Never more than a week at a time: a long gap (a winter break, an international break)
    // stops each week at the inbox so the manager sees the news as it happens.
    if (ui.screen !== 'prematch') {
      if (blockedByDecision()) return;
      if (playUntilDecision(g, 7) > 0) save();
      if (blockedByDecision()) return;
      if (seasonOver(g)) go('season-end');
      else if (userPlaysNext(g) && g.day === nextMatchDay(g)) go('prematch');
      else {
        const next = userNextFixture(g);
        const days = next ? next.day - g.day : 0;
        if (next && days > 0) toast(`A week goes by. Your next match is in ${days} day${days > 1 ? 's' : ''}.`);
        if (ui.screen === 'inbox') render();
        else go('inbox');
      }
    } else kickoff();
  },
  kickoff: () => kickoff(),
  fullscreen: () => fullScreenPrompt({ auto: false, hasGame: !!game, toast }),
  'kickoff-confirm': () => {
    ui.confirm = null;
    startLiveMatch(ctx);
  },
  newgame: () => {
    clearSave();
    game = null;
    ui = { screen: 'inbox' };
    setupSeed = Math.floor(Math.random() * 1e9);
    setupWorld = null;
    setupMode = null;
    render();
  },
};

/** Something needs an answer: take the manager to the list of what's waiting instead of moving on. */
function blockedByDecision(): boolean {
  const n = pendingDecisions(game!).length;
  if (!n) return false;
  toast(`${n} thing${n > 1 ? 's' : ''} need${n > 1 ? '' : 's'} your answer first.`);
  if (ui.screen !== 'inbox') go('inbox');
  else render();
  return true;
}

/** Kick off the manager's next match (playing through idle days first if need be). */
function kickoff(): void {
  const g = game!;
  if (blockedByDecision()) return;
  // Plays any idle days first and brings the calendar up to the match day itself. If that
  // moved the calendar on (players back from international duty, injuries healed), show
  // the pre-match screen again so the manager sees the squad he actually has.
  const before = g.day;
  if (playUntilDecision(g) > 0) save();
  if (blockedByDecision()) return;
  if (seasonOver(g)) return go('season-end');
  if (!userPlaysNext(g) || (g.day !== before && ui.screen === 'prematch')) {
    if (g.day !== before) toast('The squad is updated for match day.');
    return ui.screen === 'prematch' ? render() : go('prematch');
  }
  const problems = lineupBlockers(g);
  if (problems.length) {
    toast(problems[0]);
    if (ui.screen !== 'prematch') go('prematch');
    else render();
    return;
  }
  ui.confirm = null;
  const short = benchShortfall(g);
  if (short) {
    if (ui.screen !== 'prematch') go('prematch');
    const { named, room } = short;
    confirmModal({
      title: named === 0 ? 'Your bench is empty' : 'Your bench isn\'t full',
      lines: [
        named === 0
          ? 'You have not named any substitutes. If someone is injured or tiring, you will have nobody to bring on.'
          : `You have named ${named} of ${BENCH_SIZE} substitutes, and ${room} more ${room > 1 ? 'players are' : 'player is'} fit to name.`,
        'Kick off anyway, or sort the bench first?',
      ],
      ok: 'Kick off anyway',
      cancel: 'Back to tactics',
      alt: { label: 'Fill it for me', run: fillBench },
    }, () => { ui.confirm = null; startLiveMatch(ctx); });
    return;
  }
  startLiveMatch(ctx);
}

/** How short the manager's bench is of what he could name (null when it is full or nobody else is fit). */
function benchShortfall(g: GameState): { named: number; room: number } | null {
  const c = userClub(g);
  const xi = resolveLineup(c, g.players);
  const named = resolveBench(c, g.players, xi).length;
  const fit = c.playerIds.filter((id) => g.players[id] && available(g.players[id]) && !xi.includes(id)).length;
  const room = Math.min(BENCH_SIZE, fit) - named;
  return room > 0 ? { named, room } : null;
}

/** Keep the substitutes already named and let the assistant add the rest. */
function fillBench(): void {
  const g = game!;
  const c = userClub(g);
  const xi = resolveLineup(c, g.players);
  const have = resolveBench(c, g.players, xi);
  const extra = pickBench(c, g.players, [...xi, ...have]);
  c.bench = [...have, ...extra].slice(0, BENCH_SIZE);
  ui = { ...ui, benchSlot: null };
  save();
  render();
  toast(`Bench filled: ${c.bench.length} substitutes named.`);
}

coreActions['search-scout'] = (_c, el) => go('scouting', { scoutTab: el.dataset.hired === '1' ? 'staff' : 'hire' });

/* ───────────────────────── Save files ───────────────────────── */

async function importText(text: string): Promise<void> {
  const r = await parseSaveFile(text);
  if (!r.game || !r.info) return toast(r.error ?? 'That save could not be loaded.');
  const loaded = r.game;
  const adopt = () => {
    game = loaded;
    setupWorld = null;
    backStack.length = 0;
    ui = { screen: 'inbox' };
    save();
    render();
    window.scrollTo({ top: 0 });
    toast('Save loaded');
  };
  if (!game) return adopt();
  confirmModal({
    title: 'Load this save?',
    lines: [describeSave(r.info), `It replaces your current career (${userClub(game).name}, season ${seasonLabel(game)}). Export your current career first if you want to keep it.`],
    ok: 'Yes, load it',
  }, adopt);
}

const saveActions: Record<string, Action> = {
  'save-export': async () => {
    if (!game) return;
    const f = await makeSaveFile(game, userClub(game).name);
    const r = await offerFile(f);
    if (r === 'saved') toast('Save file ready');
    else if (r === 'failed') toast("Your browser wouldn't save the file. Use Copy or paste instead.");
  },
  'save-pick': () => (document.getElementById('save-file') as HTMLInputElement | null)?.click(),
  'save-copy': async () => {
    if (!game) return;
    const f = await makeSaveFile(game, userClub(game).name);
    const box = document.getElementById('save-paste') as HTMLTextAreaElement | null;
    if (box) { box.value = f.text; box.select(); }
    try {
      await navigator.clipboard.writeText(f.text);
      toast('Save text copied');
    } catch {
      toast('Copy the selected text by hand');
    }
  },
  'save-paste': () => {
    const box = document.getElementById('save-paste') as HTMLTextAreaElement | null;
    if (!box?.value.trim()) return toast('Paste the save text first.');
    void importText(box.value);
  },
};

const saveChangeActions: Record<string, (c: Ctx, el: HTMLSelectElement) => void> = {
  'save-file': (_c, el) => {
    const input = el as unknown as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    file.text().then((t) => importText(t), () => toast("That file couldn't be read.")).finally(() => { input.value = ''; });
  },
};

const actions: Record<string, Action> = { ...saveActions, ...injuryActions, ...trainActions, ...compareActions, ...coreActions, ...S.screenActions, ...liveActions, ...setupActions, ...marketActions, ...scoutActions, ...cupActions, ...intlActions, ...stadiumActions };

async function start(data?: Hot['data']): Promise<void> {
  root = document.getElementById('app')!;
  root.innerHTML = '<p class="loading">Loading…</p>';
  game = (data?.game && migrateSave(data.game)) || (await load());
  if (data?.ui && data.ui.screen !== 'match') ui = data.ui;
  const dnd = installDragDrop(root, (src, target) => {
    if (isLive()) {
      liveDrop(ctx, src, target);
      return;
    }
    let changed = false;
    if (target.slot !== null) {
      if (src.kind === 'xi' && src.slot !== null) changed = S.swapSlots(ctx, src.slot, target.slot);
      else if (src.kind === 'bench' && src.bench !== null) changed = S.benchToXi(ctx, src.bench, target.slot);
      else changed = S.placePlayer(ctx, target.slot, src.playerId);
    } else if (target.bench !== null) {
      changed = S.placeOnBench(ctx, target.bench, src.playerId);
    } else if (target.playerId !== null) {
      if (src.kind === 'xi' && src.slot !== null) changed = S.placePlayer(ctx, src.slot, target.playerId);
      else if (src.kind === 'bench' && src.bench !== null) changed = S.placeOnBench(ctx, src.bench, target.playerId);
    }
    if (changed) {
      ui.confirm = null;
      render();
    }
  });
  root.addEventListener('click', (e) => {
    if (dnd.consumeClick()) return;
    if (!(e.target as HTMLElement).closest('.search')) { const r = document.getElementById('search-results'); if (r) r.hidden = true; }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const fn = actions[el.dataset.act!];
    if (fn) fn(ctx, el);
  });
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLSelectElement;
    const key = el.dataset?.change;
    if (!key) return;
    const fn = S.changeActions[key] ?? liveChangeActions[key] ?? marketChangeActions[key] ?? trainChangeActions[key] ?? intlChangeActions[key] ?? saveChangeActions[key];
    if (fn) fn(ctx, el);
  });
  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'mgr') managerName = t.value;
    if (t.id === 'gsearch' && game) {
      const box = document.getElementById('search-results')!;
      const hits = search(game, t.value);
      box.hidden = t.value.trim().length < 2;
      box.innerHTML = hits.length ? hits.map((h) => h.html).join('') : '<p class="small-note pad">No matches.</p>';
    }
  });
  // Space bar presses Continue (on a keyboard), unless you're typing or a dialog is open.
  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('.modal-back')) return;
    const btn = document.querySelector<HTMLButtonElement>('.btn.continue, .rail-go');
    if (!game || !btn || btn.disabled) return;
    e.preventDefault();
    btn.click();
  });
  // ...and doesn't also press whichever button last had the focus (buttons fire on key-up).
  document.addEventListener('keyup', (e) => {
    if (e.key !== ' ') return;
    const t = e.target as HTMLElement | null;
    if (!t?.closest('input, textarea, select, [contenteditable="true"]') && !document.querySelector('.modal-back') && game) e.preventDefault();
  });
  window.claude?.hot?.snapshot?.(() => ({ game, ui: { ...ui, screen: ui.screen === 'match' ? 'inbox' : ui.screen } }));
  // Turning the phone switches between the normal layout and the landscape one.
  watchLandscape(() => {
    moreOpen = false;
    keepScroll = false;
    render();
  });
  // Going in or out of full screen changes the screen's size and the Club Info note.
  document.addEventListener('fullscreenchange', () => render());
  render();
  // On a phone with the address bar showing, offer full screen when the game opens.
  fullScreenPrompt({ auto: true, hasGame: !!game, toast });
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready((d) => void start(d));
else void start(hot?.data ?? {});
