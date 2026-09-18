/**
 * @jest-environment jsdom
 */
import { addFreeGrip } from '@/surfaceGrip';

/** The markup Obsidian builds around an image in a note. */
function embedWith(width: number, height: number): { wrapper: HTMLElement; image: HTMLImageElement } {
  document.body.innerHTML = `
    <div class="image-embed" style="width: 800px">
      <div class="image-wrapper">
        <img src="Blatt.png" width="${width}" height="${height}">
        <div class="image-resize-corner"></div>
      </div>
    </div>`;
  const wrapper = document.querySelector<HTMLElement>('.image-wrapper');
  const image = document.querySelector('img');
  if (!wrapper || !image) throw new Error('missing markup');
  return { wrapper, image };
}

function point(type: string, x: number, y: number): Event {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

describe('the corner of an empty sheet', () => {
  it('sits on the sheet, where Obsidian puts its own', () => {
    const { wrapper, image } = embedWith(640, 360);

    const grip = addFreeGrip(wrapper, image, 'Größe ziehen', () => undefined);

    expect(grip?.parentElement).toBe(wrapper);
    expect(grip?.classList.contains('image-resize-corner')).toBe(true);
    expect(grip?.getAttribute('aria-label')).toBe('Größe ziehen');
  });

  it('is put there once, however often the note is redrawn', () => {
    const { wrapper, image } = embedWith(640, 360);

    const first = addFreeGrip(wrapper, image, 'Größe ziehen', () => undefined);
    const again = addFreeGrip(wrapper, image, 'Größe ziehen', () => undefined);

    expect(again).toBe(first);
    expect(wrapper.querySelectorAll('.scribe-grip')).toHaveLength(1);
  });

  it('changes the sheet itself, and leaves the block around it alone', () => {
    const { wrapper, image } = embedWith(640, 360);
    const grip = addFreeGrip(wrapper, image, 'Größe ziehen', () => undefined);
    if (!grip) throw new Error('no grip');

    grip.dispatchEvent(point('pointerdown', 500, 400));
    grip.dispatchEvent(point('pointermove', 560, 300));

    expect(image.getAttribute('width')).toBe('700');
    expect(image.getAttribute('height')).toBe('260');
    expect(document.querySelector<HTMLElement>('.image-embed')?.style.height).toBe('');
  });

  it('says at the end how large the sheet was left', () => {
    const { wrapper, image } = embedWith(640, 360);
    const left: Array<{ width: number; height: number }> = [];
    const grip = addFreeGrip(wrapper, image, 'Größe ziehen', (size) => left.push(size));
    if (!grip) throw new Error('no grip');

    grip.dispatchEvent(point('pointerdown', 500, 400));
    grip.dispatchEvent(point('pointermove', 400, 500));
    grip.dispatchEvent(point('pointerup', 400, 500));
    // Moving on without holding the corner changes nothing more.
    grip.dispatchEvent(point('pointermove', 900, 900));

    expect(left).toEqual([{ width: 540, height: 460 }]);
    expect(image.getAttribute('width')).toBe('540');
  });
});
