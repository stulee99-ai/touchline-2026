/**
 * Phone held sideways: a short, wide screen with a touch pointer. Only then does the game switch to the
 * landscape layout (a menu strip down the left edge, fixed panels). Portrait phones, tablets and PCs keep
 * the normal layout.
 */
const QUERY = '(orientation: landscape) and (max-height: 520px) and (pointer: coarse)';

let mq: MediaQueryList | null = null;

function query(): MediaQueryList | null {
  if (mq) return mq;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  mq = window.matchMedia(QUERY);
  return mq;
}

/** True while the landscape phone layout is in use. */
export function landscape(): boolean {
  return !!query()?.matches;
}

/** Calls `fn` whenever the phone turns between portrait and landscape (after updating the root class). */
export function watchLandscape(fn: () => void): void {
  const q = query();
  const sync = () => document.documentElement.classList.toggle('ls', !!q?.matches);
  sync();
  if (!q) return;
  const on = () => {
    sync();
    fn();
  };
  if (typeof q.addEventListener === 'function') q.addEventListener('change', on);
  else q.addListener(on);
}

/** "Sat, 25 Jul 2026" -> ["Sat", "25 Jul"] for the narrow menu strip. */
export function shortDate(label: string): [string, string] {
  const m = label.match(/^(\w{3}),?\s+(\d{1,2}\s+\w{3})/);
  return m ? [m[1], m[2]] : ['', label];
}

/** Continue labels short enough for the menu strip. */
export function shortContinue(label: string): string {
  if (label.startsWith('Respond first')) return label.replace('Respond first', 'Respond');
  if (label === 'Match in progress') return 'In play';
  if (label === 'Kick off ►') return 'Kick off';
  if (label === 'Choose a new club') return 'New club';
  return label;
}
