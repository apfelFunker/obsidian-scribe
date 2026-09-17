import {
  elementAt,
  elementBounds,
  hitTest,
  moveElement,
  resizeElement,
  type SketchElement,
} from '@/sketch/elements';

const red = '#e03131';

describe('sketch elements', () => {
  it('measures the box a stroke, an arrow, and a text cover', () => {
    const stroke: SketchElement = {
      id: 's', type: 'stroke', points: [{ x: 10, y: 20 }, { x: 40, y: 5 }, { x: 25, y: 60 }], color: red, strokeWidth: 4,
    };
    const arrow: SketchElement = {
      id: 'a', type: 'arrow', start: { x: 100, y: 50 }, end: { x: 20, y: 80 }, color: red, strokeWidth: 4,
    };
    const text: SketchElement = {
      id: 't', type: 'text', x: 5, y: 6, width: 55, height: 25, text: 'Jahre', fontSize: 20, color: red,
    };

    expect(elementBounds(stroke)).toEqual({ x: 10, y: 5, width: 30, height: 55 });
    expect(elementBounds(arrow)).toEqual({ x: 20, y: 50, width: 80, height: 30 });
    expect(elementBounds(text)).toEqual({ x: 5, y: 6, width: 55, height: 25 });
  });

  it('hits lines and outlines near their stroke, and texts anywhere inside', () => {
    const line: SketchElement = {
      id: 'l', type: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, color: red, strokeWidth: 4,
    };
    const box: SketchElement = { id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: red, strokeWidth: 4 };
    const ellipse: SketchElement = { id: 'e', type: 'ellipse', x: 0, y: 0, width: 100, height: 50, color: red, strokeWidth: 4 };
    const text: SketchElement = { id: 't', type: 'text', x: 0, y: 0, width: 30, height: 25, text: 'Hi', fontSize: 20, color: red };

    expect(hitTest(line, { x: 50, y: 5 }, 4)).toBe(true);
    expect(hitTest(line, { x: 50, y: 20 }, 4)).toBe(false);
    expect(hitTest(box, { x: 100, y: 25 }, 4)).toBe(true);
    expect(hitTest(box, { x: 50, y: 25 }, 4)).toBe(false);
    expect(hitTest(ellipse, { x: 50, y: 0 }, 4)).toBe(true);
    expect(hitTest(ellipse, { x: 50, y: 25 }, 4)).toBe(false);
    expect(hitTest(text, { x: 15, y: 12 }, 0)).toBe(true);
    expect(hitTest(text, { x: 45, y: 12 }, 0)).toBe(false);
  });

  it('picks the topmost element under the pointer', () => {
    const below: SketchElement = { id: 'below', type: 'text', x: 0, y: 0, width: 40, height: 40, text: 'A', fontSize: 20, color: red };
    const above: SketchElement = { id: 'above', type: 'text', x: 20, y: 20, width: 40, height: 40, text: 'B', fontSize: 20, color: red };

    expect(elementAt([below, above], { x: 30, y: 30 }, 0)?.id).toBe('above');
    expect(elementAt([below, above], { x: 5, y: 5 }, 0)?.id).toBe('below');
    expect(elementAt([below, above], { x: 90, y: 90 }, 0)).toBeNull();
  });

  it('moves elements and fits them into a new box', () => {
    const stroke: SketchElement = {
      id: 's', type: 'stroke', points: [{ x: 0, y: 0 }, { x: 100, y: 50 }], color: red, strokeWidth: 4,
    };
    const box: SketchElement = { id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: red, strokeWidth: 4 };

    expect(moveElement(box, 5, -5)).toEqual({ ...box, x: 5, y: -5 });
    expect(resizeElement(box, { x: 10, y: 10, width: 200, height: 100 })).toEqual({ ...box, x: 10, y: 10, width: 200, height: 100 });
    expect(resizeElement(stroke, { x: 10, y: 10, width: 50, height: 25 })).toEqual({
      ...stroke,
      points: [{ x: 10, y: 10 }, { x: 60, y: 35 }],
    });
  });
});
