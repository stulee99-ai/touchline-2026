/**
 * Drag and drop for team selection, built on pointer events so it works with a mouse,
 * a pen or a finger.
 *
 * Draggable elements carry data-drag="xi" (a shirt on the pitch), data-drag="bench" (a
 * substitute) or data-drag="squad" (a row in the squad list) plus data-id. Drop targets
 * carry data-drop-slot (a shirt), data-drop-bench (a place on the bench) or
 * data-drop-player (a squad row). A press that doesn't move is left alone, so the
 * existing click-to-select behaviour still works. On touch screens, squad rows only
 * start a drag from their grip handle, so the list can still be scrolled.
 */

export interface DragSource {
  kind: 'xi' | 'squad' | 'bench';
  playerId: number;
  slot: number | null;
  bench: number | null;
}

export interface DropTarget {
  slot: number | null;
  playerId: number | null;
  bench: number | null;
}

interface Pending {
  el: HTMLElement;
  src: DragSource;
  x: number;
  y: number;
  pointerId: number;
}

const THRESHOLD = 6;

export function installDragDrop(root: HTMLElement, onDrop: (src: DragSource, target: DropTarget) => void): { consumeClick(): boolean } {
  let pending: Pending | null = null;
  let ghost: HTMLElement | null = null;
  let hover: HTMLElement | null = null;
  let suppressClick = false;
  let lastY = 0;
  let scroller: number | null = null;

  // While dragging, holding the pointer near the top or bottom edge scrolls the page.
  const autoScroll = () => {
    const edge = 70;
    const h = window.innerHeight;
    const dy = lastY < edge ? -Math.ceil((edge - lastY) / 5) : lastY > h - edge ? Math.ceil((lastY - (h - edge)) / 5) : 0;
    if (dy) window.scrollBy(0, dy);
    scroller = ghost ? requestAnimationFrame(autoScroll) : null;
  };

  const targetAt = (x: number, y: number): HTMLElement | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest<HTMLElement>('[data-drop-slot], [data-drop-player], [data-drop-bench]') ?? null;
  };

  const cleanup = () => {
    if (scroller !== null) cancelAnimationFrame(scroller);
    scroller = null;
    ghost?.remove();
    ghost = null;
    hover?.classList.remove('drop-hover');
    hover = null;
    pending?.el.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    pending = null;
  };

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]');
    if (!el) return;
    const kind = el.dataset.drag as DragSource['kind'];
    // Touch: a squad row only drags from its grip, so the list can still scroll.
    if (e.pointerType !== 'mouse' && kind === 'squad' && !(e.target as HTMLElement).closest('.grip')) return;
    if ((e.target as HTMLElement).closest('select, input')) return;
    pending = {
      el,
      src: {
        kind,
        playerId: Number(el.dataset.id),
        slot: el.dataset.dropSlot !== undefined ? Number(el.dataset.dropSlot) : null,
        bench: el.dataset.dropBench !== undefined ? Number(el.dataset.dropBench) : null,
      },
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
  });

  root.addEventListener('pointermove', (e) => {
    if (!pending || e.pointerId !== pending.pointerId) return;
    if (!ghost) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < THRESHOLD) return;
      // Start dragging: a floating label follows the pointer.
      ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      const name = pending.el.querySelector('.tname')?.textContent ?? pending.el.querySelector('.link')?.textContent ?? pending.el.dataset.name ?? '';
      ghost.textContent = name.trim();
      document.body.appendChild(ghost);
      pending.el.classList.add('dragging');
      document.body.classList.add('is-dragging');
      try { pending.el.setPointerCapture(e.pointerId); } catch { /* not all elements can capture */ }
      scroller = requestAnimationFrame(autoScroll);
    }
    lastY = e.clientY;
    e.preventDefault();
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
    const t = targetAt(e.clientX, e.clientY);
    const valid = t && t !== pending.el && !(pending.src.kind === 'squad' && t.dataset.dropPlayer !== undefined);
    const next = valid ? t : null;
    if (next !== hover) {
      hover?.classList.remove('drop-hover');
      next?.classList.add('drop-hover');
      hover = next;
    }
  });

  const finish = (e: PointerEvent) => {
    if (!pending || e.pointerId !== pending.pointerId) return;
    if (ghost) {
      const t = hover;
      const src = pending.src;
      // Swallow the click the browser may send after the drop, but only that one.
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 60);
      cleanup();
      if (t) {
        onDrop(src, {
          slot: t.dataset.dropSlot !== undefined ? Number(t.dataset.dropSlot) : null,
          playerId: t.dataset.dropPlayer !== undefined ? Number(t.dataset.dropPlayer) : null,
          bench: t.dataset.dropBench !== undefined ? Number(t.dataset.dropBench) : null,
        });
      }
    } else {
      pending = null;
    }
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', (e) => {
    if (pending && e.pointerId === pending.pointerId) cleanup();
  });

  return {
    /** True once after a drag, so the click that follows the drop is ignored. */
    consumeClick() {
      const s = suppressClick;
      suppressClick = false;
      return s;
    },
  };
}
