/**
 * Full screen on phones. A web page can't hide the browser's address bar by itself:
 *  - Android (Chrome, Samsung Internet, Firefox): the page asks for full screen after a tap, or installs as an app
 *    that always opens full screen.
 *  - iPhone: Safari has no full screen for pages, so the only way is Add to Home Screen, which opens the game like
 *    an app with no address bar.
 * The game offers this once when it opens (unless the manager said not to), and from Club Info at any time.
 */
import { esc } from './format.js';

const NEVER_KEY = 'touchline-fullscreen-never';
let askedThisVisit = false;

/** Chrome's "install this app" offer, kept for when the manager taps Install. */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };
let installEvent: InstallPrompt | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the browser's own banner away; the game offers it in its own words
    installEvent = e as InstallPrompt;
  });
  window.addEventListener('appinstalled', () => { installEvent = null; });
}

const mm = (q: string): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(q).matches;

/** A phone: a touch screen with one short side. Tablets and computers aren't asked. */
export function onPhone(): boolean {
  return mm('(pointer: coarse) and (max-width: 520px)') || mm('(pointer: coarse) and (max-height: 520px)');
}

/** Already without an address bar: full screen now, or opened from the home screen. */
export function isFullScreen(): boolean {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  const nav = navigator as Navigator & { standalone?: boolean };
  return !!(d.fullscreenElement || d.webkitFullscreenElement) || mm('(display-mode: fullscreen)') || mm('(display-mode: standalone)') || nav.standalone === true;
}

type Way = 'fullscreen' | 'ios' | 'framed' | 'menu';

/** iPhone or iPod (iPads say they are Macs, but they aren't phones and aren't asked). */
const isIos = (): boolean => /iPhone|iPod/.test(navigator.userAgent);
const inFrame = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/** Which way to full screen this browser offers. */
function way(): Way {
  const d = document as Document & { webkitFullscreenEnabled?: boolean };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const api = typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
  const allowed = d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? api;
  if (api && allowed) return 'fullscreen';
  if (isIos()) return inFrame() ? 'framed' : 'ios';
  return inFrame() ? 'framed' : 'menu';
}

function never(): boolean {
  try {
    return localStorage.getItem(NEVER_KEY) === '1';
  } catch {
    return false;
  }
}
function setNever(on: boolean): void {
  try {
    if (on) localStorage.setItem(NEVER_KEY, '1');
    else localStorage.removeItem(NEVER_KEY);
  } catch {
    /* private browsing: the choice lasts for this visit only */
  }
}

/** Asks the browser for full screen. Must run from a tap. */
async function goFull(): Promise<boolean> {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (typeof el.requestFullscreen === 'function') await el.requestFullscreen({ navigationUI: 'hide' });
    else el.webkitRequestFullscreen?.();
    return true;
  } catch {
    return false;
  }
}

const SHARE_ICON = '<svg class="fs-ico" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6H3.5v8.5h9V6H11 M8 1.5v8 M5.5 4L8 1.5 10.5 4"/></svg>';
const ADD_ICON = '<svg class="fs-ico" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="2.5"/><path d="M8 5v6 M5 8h6"/></svg>';

/** The body of the dialog for this browser. */
function body(w: Way, hasGame: boolean): { title: string; html: string; ok: string | null } {
  if (w === 'fullscreen') {
    return {
      title: 'Play full screen?',
      html: `<p>Full screen hides the address bar and your phone's status bar, so the game gets the whole screen. It works best with the phone turned sideways.</p>
        <p class="small-note">Swipe in from the edge or press Back to leave full screen. Leaving or reloading the page ends it too, and the game will ask again next time.</p>
        ${installEvent ? '<p class="small-note">Or install Touchline as an app: it opens full screen every time, and your career carries on in it.</p>' : ''}`,
      ok: 'Go full screen',
    };
  }
  if (w === 'ios') {
    return {
      title: 'Play full screen on iPhone',
      html: `<p>Safari can't hide its address bar for a web page. Add Touchline to your Home Screen instead: it then opens like an app, with no address bar.</p>
        <ol class="fs-steps">
          <li>Tap <b>Share</b> ${SHARE_ICON} at the bottom of Safari. If you can't see it, tap <b>•••</b> first.</li>
          <li>Scroll down and tap <b>Add to Home Screen</b> ${ADD_ICON}. If there's an <b>Open as Web App</b> switch, leave it on.</li>
          <li>Tap <b>Add</b>, then open <b>Touchline</b> from your Home Screen.</li>
        </ol>
        ${hasGame ? '<p class="small-note fs-warn">The Home Screen app keeps its own saves, so your career here doesn\'t move across by itself. Export a save file first (Club Info, Save file), then load it in the app.</p>' : '<p class="small-note">Start your career in the Home Screen app: saves made here in Safari stay in Safari.</p>'}`,
      ok: null,
    };
  }
  if (w === 'framed') {
    return {
      title: 'Full screen',
      html: '<p>The game is showing inside another page, which doesn\'t let it go full screen. Open the game on its own page to play full screen.</p>',
      ok: null,
    };
  }
  return {
    title: 'Play full screen',
    html: `<p>This browser can't put a page full screen. Open its menu (usually <b>⋮</b> or <b>☰</b>) and choose <b>Add to Home screen</b> or <b>Install app</b>, then open Touchline from your home screen: it runs with no address bar.</p>`,
    ok: null,
  };
}

/**
 * Shows the dialog. `auto` is the offer when the game opens: it has a "don't ask again" button and is skipped when
 * it isn't needed. From Club Info it always shows.
 */
export function fullScreenPrompt(opts: { auto: boolean; hasGame: boolean; toast: (m: string) => void; after?: () => void }): void {
  const w = way();
  if (opts.auto) {
    if (askedThisVisit || !onPhone() || isFullScreen() || never() || w === 'framed') return;
    askedThisVisit = true;
  }
  if (!opts.auto && isFullScreen()) {
    opts.toast('You are already playing full screen.');
    return;
  }
  document.getElementById('fs-modal')?.remove();
  const b = body(w, opts.hasGame);
  const wrap = document.createElement('div');
  wrap.id = 'fs-modal';
  wrap.className = 'modal-back';
  const btns = [
    b.ok ? `<button class="btn primary" data-fs="go">${esc(b.ok)}</button>` : '',
    w === 'fullscreen' && installEvent ? '<button class="btn" data-fs="install">Install app</button>' : '',
    `<button class="btn${b.ok ? ' ghost' : ' primary'}" data-fs="no">${b.ok ? 'Not now' : 'Got it'}</button>`,
  ].join('');
  wrap.innerHTML = `<div class="modal fs-modal" role="dialog" aria-modal="true" aria-labelledby="fs-title">
    <h3 id="fs-title">${esc(b.title)}</h3>
    ${b.html}
    <div class="fs-foot">
      ${opts.auto ? '<button class="fs-never" data-fs="never">Don\'t ask again</button>' : never() ? '<button class="fs-never" data-fs="ask">Offer this when the game opens</button>' : '<span></span>'}
      <div class="row-btns">${btns}</div>
    </div>
  </div>`;
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    opts.after?.();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-fs]');
    if (e.target === wrap) return close();
    if (!t) return;
    const act = t.dataset.fs;
    if (act === 'go') {
      void goFull().then((ok) => { if (!ok) opts.toast("Your browser didn't allow full screen. Try its menu: Add to Home screen."); });
      close();
    } else if (act === 'install' && installEvent) {
      const ev = installEvent;
      installEvent = null;
      void ev.prompt().catch(() => opts.toast("Your browser didn't offer to install the app."));
      close();
    } else if (act === 'never') {
      setNever(true);
      opts.toast('The game won\'t ask again. Full screen is in Club Info whenever you want it.');
      close();
    } else if (act === 'ask') {
      setNever(false);
      opts.toast('The game will offer full screen when it opens.');
      close();
    } else close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  (wrap.querySelector('[data-fs="go"], [data-fs="no"]') as HTMLElement | null)?.focus();
}

/** A small panel for Club Info and the start screen: full screen whenever the manager wants it. */
export function fullScreenPanel(): string {
  if (!onPhone() && !isFullScreen()) return '';
  const full = isFullScreen();
  return `<div class="save-box fs-box">
    <h4>FULL SCREEN</h4>
    <p class="small-note">${full ? 'You are playing full screen, with no address bar.' : 'Hide the browser\'s address bar so the game gets the whole screen.'}</p>
    ${full ? '' : '<div class="row-btns"><button class="btn" data-act="fullscreen">Play full screen…</button></div>'}
  </div>`;
}
