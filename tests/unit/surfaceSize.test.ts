import { surfaceSize } from '@/surfaceSize';

const start = { width: 600, height: 400 };

describe('surfaceSize', () => {
  it('follows the pointer in both directions while the sheet is empty', () => {
    expect(surfaceSize(start, { dx: 100, dy: 50 }, false)).toEqual({ width: 700, height: 450 });
    expect(surfaceSize(start, { dx: -200, dy: 120 }, false)).toEqual({ width: 400, height: 520 });
  });

  it('keeps the shape once something is drawn on it', () => {
    expect(surfaceSize(start, { dx: 300, dy: 0 }, true)).toEqual({ width: 900, height: 600 });
    expect(surfaceSize(start, { dx: -300, dy: 400 }, true)).toEqual({ width: 300, height: 200 });
  });

  it('never shrinks below what can still be drawn on, on either side', () => {
    expect(surfaceSize(start, { dx: -5000, dy: -5000 }, false)).toEqual({ width: 80, height: 80 });

    // With the shape kept, the shorter side is the one that must stay usable.
    const tiny = surfaceSize(start, { dx: -5000, dy: -5000 }, true);
    expect(tiny).toEqual({ width: 120, height: 80 });
    expect(tiny.width / tiny.height).toBeCloseTo(1.5, 5);
  });

  it('rounds to whole pixels, because that is what the note keeps', () => {
    expect(surfaceSize({ width: 601, height: 399 }, { dx: 0.4, dy: -0.4 }, false)).toEqual({ width: 601, height: 399 });
    expect(surfaceSize({ width: 300, height: 200 }, { dx: 151, dy: 0 }, true)).toEqual({ width: 451, height: 301 });
  });
});
