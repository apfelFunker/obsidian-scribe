import type { SketchElement } from '@/sketch/elements';
import { collectSnapTargets, snapAngle, snapPoint, snapRect, snapSquare } from '@/sketch/snapping';

describe('snapping', () => {
  it('pulls a line within a few degrees of a 45° step onto it, or onto the nearest step when forced', () => {
    expect(snapAngle({ x: 0, y: 0 }, { x: 100, y: 7 }, false)).toEqual({ x: 100, y: 0 });
    const diagonal = snapAngle({ x: 0, y: 0 }, { x: 100, y: 96 }, false);
    expect(diagonal.x).toBeCloseTo(98);
    expect(diagonal.y).toBeCloseTo(98);
    expect(snapAngle({ x: 0, y: 0 }, { x: 100, y: 20 }, false)).toEqual({ x: 100, y: 20 });
    expect(snapAngle({ x: 0, y: 0 }, { x: 100, y: 30 }, true)).toEqual({ x: 100, y: 0 });
  });

  it('pulls a nearly square box to a square in the direction it is dragged', () => {
    expect(snapSquare({ x: 0, y: 0 }, { x: 100, y: 95 }, false)).toEqual({ x: 100, y: 100 });
    expect(snapSquare({ x: 50, y: 50 }, { x: -50, y: 146 }, false)).toEqual({ x: -50, y: 150 });
    expect(snapSquare({ x: 0, y: 0 }, { x: 100, y: 80 }, false)).toEqual({ x: 100, y: 80 });
    expect(snapSquare({ x: 0, y: 0 }, { x: 100, y: 50 }, true)).toEqual({ x: 100, y: 100 });
  });

  it('lines a moving box up with the image centre and with the edges and centre of another element', () => {
    const other: SketchElement = { id: 'o', type: 'rectangle', x: 600, y: 300, width: 100, height: 100, color: '#000000', strokeWidth: 2 };
    const targets = collectSnapTargets([other], null, { width: 1000, height: 800 });

    expect(snapRect({ x: 420, y: 100, width: 150, height: 50 }, targets, 8)).toEqual({
      dx: 5,
      dy: 0,
      guides: [{ axis: 'x', position: 500, start: 0, end: 800 }],
    });
    expect(snapRect({ x: 596, y: 500, width: 50, height: 50 }, targets, 8)).toEqual({
      dx: 4,
      dy: 0,
      guides: [
        { axis: 'x', position: 600, start: 300, end: 550 },
        { axis: 'x', position: 650, start: 300, end: 550 },
      ],
    });
    expect(snapRect({ x: 800, y: 322, width: 40, height: 60 }, targets, 8)).toEqual({
      dx: 0,
      dy: -2,
      guides: [{ axis: 'y', position: 350, start: 600, end: 840 }],
    });
  });

  it('pulls a point onto guide lines near it on each axis and ignores the element being edited', () => {
    const edited: SketchElement = { id: 'self', type: 'rectangle', x: 490, y: 700, width: 20, height: 20, color: '#000000', strokeWidth: 2 };
    const targets = collectSnapTargets([edited], 'self', { width: 1000, height: 800 });

    expect(snapPoint({ x: 504, y: 797 }, targets, 8)).toEqual({
      point: { x: 500, y: 800 },
      guides: [
        { axis: 'x', position: 500, start: 0, end: 800 },
        { axis: 'y', position: 800, start: 0, end: 1000 },
      ],
    });
  });
});
