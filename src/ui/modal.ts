import { esc } from './format.js';

export interface ConfirmSpec {
  title: string;
  /** Plain-text lines; escaped here. */
  lines: string[];
  ok: string;
  /** Label for the dismiss button (default "Not yet"). */
  cancel?: string;
  /** An optional third choice that closes the dialog and runs something else. */
  alt?: { label: string; run: () => void };
}

/** A small "are you sure?" dialog, built on its own so it survives the app re-rendering underneath it. */
export function confirmModal(spec: ConfirmSpec, onYes: () => void): void {
  document.getElementById('confirm-modal')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'confirm-modal';
  wrap.className = 'modal-back';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="cm-title">
    <h3 id="cm-title">${esc(spec.title)}</h3>
    ${spec.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    <div class="row-btns"><button class="btn primary" data-cm="yes">${esc(spec.ok)}</button>${spec.alt ? `<button class="btn" data-cm="alt">${esc(spec.alt.label)}</button>` : ''}<button class="btn ghost" data-cm="no">${esc(spec.cancel ?? 'Not yet')}</button></div>
  </div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === wrap || t.dataset.cm === 'no') close();
    else if (t.dataset.cm === 'yes') { close(); onYes(); }
    else if (t.dataset.cm === 'alt' && spec.alt) { close(); spec.alt.run(); }
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  (wrap.querySelector('[data-cm="no"]') as HTMLElement).focus();
}
