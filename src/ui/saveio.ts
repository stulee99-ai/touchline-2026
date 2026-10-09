import { SAVE_VERSION } from '../engine/generate.js';
import { migrateSave } from '../engine/migrate.js';
import type { GameState } from '../engine/types.js';

/**
 * Save files. A career is stored in the browser automatically; a save file lets the player keep a backup,
 * move a career to another device, or share it. The file is JSON with a small header, and the game inside
 * it is gzipped and base64 encoded, the same as the browser copy, so it is a few hundred kilobytes.
 * Older files are upgraded on the way in, exactly as the browser copy is.
 */

export const SAVE_FORMAT = 'touchline-save';

/* ───────────────────────── Compression ───────────────────────── */

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function gzip(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return 'gz:' + toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function gunzip(data: string): Promise<string> {
  if (!data.startsWith('gz:')) return data;
  const stream = new Blob([fromBase64(data.slice(3)) as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/* ───────────────────────── Writing a file ───────────────────────── */

const slug = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'club';

export interface SaveFile {
  filename: string;
  text: string;
}

export async function makeSaveFile(g: GameState, clubName: string, now = new Date()): Promise<SaveFile> {
  const json = JSON.stringify(g);
  const data = typeof CompressionStream === 'function' ? await gzip(json) : json;
  const header = { format: SAVE_FORMAT, version: g.version, exportedAt: now.toISOString(), manager: g.managerName, club: clubName, season: g.season, day: g.day, data };
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  return { filename: `touchline-${slug(clubName)}-${g.season}-${String((g.season + 1) % 100).padStart(2, '0')}-${stamp}.json`, text: JSON.stringify(header) };
}

interface DownloadsCap {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}

/** Hand the file to the player: through the page host's save prompt when there is one, else a plain browser download. */
export async function offerFile(f: SaveFile): Promise<'saved' | 'declined' | 'failed'> {
  try {
    const cap = (await window.claude?.use?.('downloads')) as DownloadsCap | null | undefined;
    if (cap) {
      try {
        await cap.save({ filename: f.filename, data: f.text });
        return 'saved';
      } catch (e) {
        if ((e as { code?: string })?.code === 'declined') return 'declined';
        // Any other refusal: try an ordinary download below.
      }
    }
    const url = URL.createObjectURL(new Blob([f.text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = f.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

/* ───────────────────────── Reading a file ───────────────────────── */

export interface Parsed {
  game?: GameState;
  error?: string;
  /** What the file says it is, for the confirmation. */
  info?: { club: string; manager: string; season: number; exportedAt?: string };
}

/** Does this look like a whole game, and not something else that happens to be JSON? */
function looksLikeGame(g: unknown): g is GameState {
  const s = g as GameState | null;
  return !!s && typeof s === 'object' && Array.isArray(s.clubs) && s.clubs.length > 10 && !!s.players && typeof s.players === 'object'
    && Array.isArray(s.fixtures) && Array.isArray(s.comps) && typeof s.userClubId === 'number' && typeof s.season === 'number'
    && s.clubs.some((c) => c.id === s.userClubId);
}

export async function parseSaveFile(text: string): Promise<Parsed> {
  const t = text.replace(/^﻿/, '').trim();
  if (!t) return { error: 'That file is empty.' };
  let inner: unknown;
  let exportedAt: string | undefined;
  try {
    if (t.startsWith('gz:')) inner = JSON.parse(await gunzip(t));
    else {
      const top = JSON.parse(t) as Record<string, unknown>;
      if (top && top.format === SAVE_FORMAT && typeof top.data === 'string') {
        inner = JSON.parse(await gunzip(top.data));
        if (typeof top.exportedAt === 'string') exportedAt = top.exportedAt;
      } else inner = top;
    }
  } catch {
    return { error: "That isn't a Touchline save file, or it has been damaged." };
  }
  const v = (inner as { version?: unknown } | null)?.version;
  if (typeof v !== 'number') return { error: "That isn't a Touchline save file." };
  if (v > SAVE_VERSION) return { error: 'That save was made by a newer version of Touchline. Open this page again in a fresh tab, or update the game, then try again.' };
  let g: GameState | null = null;
  try {
    g = migrateSave(inner);
  } catch {
    g = null;
  }
  if (!g) return { error: `That save is from an older version of the game (version ${v}) that can't be upgraded.` };
  if (!looksLikeGame(g)) return { error: 'That save is incomplete or damaged.' };
  const c = g.clubs.find((x) => x.id === g.userClubId)!;
  return { game: g, info: { club: c.name, manager: g.managerName, season: g.season, exportedAt } };
}

/* ───────────────────────── The panel ───────────────────────── */

/** Export and import buttons, with a copy-and-paste fallback for hosts that block files. */
export function savePanel(hasGame: boolean): string {
  return `<div class="save-box">
    <h4>SAVE FILE</h4>
    <p class="small-note">${hasGame ? 'Your career is kept in this browser as you play. A save file is a backup you can keep, move to another device or share.' : 'Carry on a career from a save file exported earlier, on this device or another.'}</p>
    <div class="row-btns">${hasGame ? '<button class="btn" data-act="save-export">Export save file</button>' : ''}<button class="btn" data-act="save-pick">Load save file…</button></div>
    <input type="file" id="save-file" accept=".json,.txt,application/json,text/plain" hidden data-change="save-file" aria-label="Save file to load">
    <details class="save-paste"><summary>Copy or paste instead</summary>
      <p class="small-note">If your browser blocks files, ${hasGame ? 'copy the save text here and keep it somewhere safe, and ' : ''}paste a save's text to load it.</p>
      <textarea id="save-paste" rows="4" spellcheck="false" placeholder="Paste the contents of a save file here" aria-label="Save text"></textarea>
      <div class="row-btns">${hasGame ? '<button class="btn small" data-act="save-copy">Copy save text</button>' : ''}<button class="btn small" data-act="save-paste">Load pasted save</button></div>
    </details>
  </div>`;
}

/** One line for the confirmation dialog. */
export const describeSave = (p: NonNullable<Parsed['info']>): string =>
  `${p.club} (manager ${p.manager}), season ${p.season}/${String((p.season + 1) % 100).padStart(2, '0')}${p.exportedAt ? `, exported ${p.exportedAt.slice(0, 10)}` : ''}`;
