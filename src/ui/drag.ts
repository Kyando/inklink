export interface DragHandlers {
  onTap(): void;
  onStart(): void;
  onMove(x: number, y: number): void;
  /** `ghostRect` is where the dragged copy was released, for the landing animation. */
  onDrop(x: number, y: number, ghostRect: DOMRect): void;
}

const DRAG_THRESHOLD = 6;

/** Pointer-based drag (mouse, touch and pen) with a floating ghost; short presses count as taps. */
export function makeDraggable(el: HTMLElement, handlers: DragHandlers): void {
  el.addEventListener('pointerdown', (down) => {
    if (down.button !== 0) return;
    down.preventDefault();
    const rect = el.getBoundingClientRect();
    const offsetX = down.clientX - rect.left;
    const offsetY = down.clientY - rect.top;
    let ghost: HTMLElement | null = null;
    el.setPointerCapture(down.pointerId);

    const place = (e: PointerEvent) => {
      ghost!.style.transform = `translate(${e.clientX - offsetX}px, ${e.clientY - offsetY}px)`;
    };

    const move = (e: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < DRAG_THRESHOLD) return;
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.classList.add('ghost');
        ghost.classList.remove('is-selected', 'pop', 'nudge');
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        document.body.append(ghost);
        el.classList.add('is-lifted');
        handlers.onStart();
      }
      place(e);
      handlers.onMove(e.clientX, e.clientY);
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      if (!ghost) {
        if (!cancelled) handlers.onTap();
        return;
      }
      const ghostRect = ghost.getBoundingClientRect();
      ghost.remove();
      el.classList.remove('is-lifted');
      // A cancelled gesture drops "nowhere", which animates the piece back home.
      handlers.onDrop(cancelled ? -1 : e.clientX, cancelled ? -1 : e.clientY, ghostRect);
    };
    const up = (e: PointerEvent) => finish(e, false);
    const cancel = (e: PointerEvent) => finish(e, true);

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  });
}
