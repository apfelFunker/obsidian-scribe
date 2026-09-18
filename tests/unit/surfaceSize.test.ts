import { surfaceSize } from '@/surfaceSize';

const start = { width: 640, height: 360 };

describe('surfaceSize', () => {
  it('follows the pointer in both directions, so an empty sheet takes any shape', () => {
    expect(surfaceSize(start, { dx: 100, dy: 50 })).toEqual({ width: 740, height: 410 });
    expect(surfaceSize(start, { dx: -200, dy: 120 })).toEqual({ width: 440, height: 480 });
  });

  it('never shrinks below what can still be drawn on, on either side', () => {
    expect(surfaceSize(start, { dx: -5000, dy: -5000 })).toEqual({ width: 80, height: 80 });
  });

  it('rounds to whole pixels, because that is what the note keeps', () => {
    expect(surfaceSize({ width: 601, height: 399 }, { dx: 0.4, dy: -0.4 })).toEqual({ width: 601, height: 399 });
  });
});
