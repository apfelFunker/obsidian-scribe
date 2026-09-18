import { surfaceSize } from './surfaceSize';

interface Size {
  width: number;
  height: number;
}

/**
 * Gives an empty sheet a corner of its own, in Obsidian's image wrapper and
 * exactly where Obsidian puts its own. Dragging it sets width and height
 * freely, so the sheet can be brought into any shape before it is drawn on.
 */
export function addFreeGrip(
  wrapper: HTMLElement,
  image: HTMLImageElement,
  label: string,
  onSize: (size: Size) => void,
): HTMLElement | null {
  const already = wrapper.querySelector<HTMLElement>('.scribe-grip');
  if (already) return already;

  const grip = wrapper.ownerDocument.createElement('div');
  grip.className = 'image-resize-corner scribe-grip';
  grip.setAttribute('aria-label', label);
  wrapper.append(grip);

  let start: { x: number; y: number; width: number; height: number } | null = null;
  grip.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    start = { x: event.clientX, y: event.clientY, ...shownSize(image) };
    wrapper.classList.add('is-resizing');
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      // Capture only keeps the pointer with the corner; dragging works without it.
    }
  });
  grip.addEventListener('pointermove', (event) => {
    if (!start) return;
    const size = surfaceSize(start, { dx: event.clientX - start.x, dy: event.clientY - start.y });
    image.setAttribute('width', String(size.width));
    image.setAttribute('height', String(size.height));
  });
  const settle = (event: PointerEvent): void => {
    if (!start) return;
    start = null;
    wrapper.classList.remove('is-resizing');
    try {
      grip.releasePointerCapture(event.pointerId);
    } catch {
      // Never captured, so nothing to let go of.
    }
    onSize(shownSize(image));
  };
  grip.addEventListener('pointerup', settle);
  grip.addEventListener('pointercancel', settle);
  return grip;
}

/** The size the sheet is shown at, as the note has it. */
export function shownSize(image: HTMLImageElement): Size {
  const noted = { width: Number(image.getAttribute('width')), height: Number(image.getAttribute('height')) };
  if (noted.width > 0 && noted.height > 0) return noted;
  const box = image.getBoundingClientRect();
  return { width: Math.round(box.width), height: Math.round(box.height) };
}
