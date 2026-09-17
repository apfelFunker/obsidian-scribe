import { SketchInteraction } from '@/editor/SketchInteraction';
import type { SketchElement } from '@/sketch/elements';

const red = '#e03131';
const metrics = { tolerance: 4, handleSize: 10, padding: 0, snap: 8, spacing: 1, tap: 2 };

function createInteraction(elements: SketchElement[] = []): SketchInteraction {
  let next = 0;
  return new SketchInteraction(elements, () => {
    next += 1;
    return `e${next}`;
  });
}

function drag(interaction: SketchInteraction, points: Array<[number, number]>) {
  const [first, ...rest] = points;
  interaction.pointerDown({ x: first[0], y: first[1] }, metrics);
  for (const [x, y] of rest) interaction.pointerMove({ x, y });
  const last = points[points.length - 1];
  return interaction.pointerUp({ x: last[0], y: last[1] });
}

describe('SketchInteraction', () => {
  it('draws a rectangle by dragging, and undoes and redoes it', () => {
    const interaction = createInteraction();
    interaction.setTool('rectangle');
    interaction.setStyle({ color: red, strokeWidth: 4 });

    drag(interaction, [[10, 10], [40, 30], [60, 40]]);

    const rectangle = { id: 'e1', type: 'rectangle', x: 10, y: 10, width: 50, height: 30, color: red, strokeWidth: 4 };
    expect(interaction.elements).toEqual([rectangle]);
    interaction.undo();
    expect(interaction.elements).toEqual([]);
    interaction.redo();
    expect(interaction.elements).toEqual([rectangle]);
  });

  it('keeps a finished freehand stroke exactly as it looked while drawing and ignores a tap with a shape tool', () => {
    const interaction = createInteraction();
    interaction.setTool('pen');
    interaction.setStyle({ color: red, strokeWidth: 3 });

    interaction.pointerDown({ x: 0, y: 0 }, metrics);
    for (const [x, y] of [[0, 20], [1, 40], [20, 41], [40, 40]]) interaction.pointerMove({ x, y });
    const drawn = interaction.draft;
    interaction.pointerUp({ x: 40, y: 40 });
    interaction.setTool('ellipse');
    drag(interaction, [[80, 80], [80, 80]]);

    expect(drawn?.type).toBe('stroke');
    expect(interaction.elements).toEqual([{ ...drawn, id: 'e1' }]);
  });

  it('edits a text clicked with the text tool instead of putting a new one on top', () => {
    const label: SketchElement = { id: 't', type: 'text', x: 10, y: 10, width: 60, height: 30, text: 'Jahre', fontSize: 24, color: red };
    const interaction = createInteraction([label]);
    interaction.setTool('text');

    expect(drag(interaction, [[20, 20], [20, 20]])).toEqual({ kind: 'edit-text', element: label });
    expect(interaction.selected?.id).toBe('t');
    expect(drag(interaction, [[25, 20], [25, 20]])).toEqual({ kind: 'edit-text', element: label });
    expect(drag(interaction, [[200, 200], [200, 200]])).toEqual({ kind: 'create-text', point: { x: 200, y: 200 } });
    expect(interaction.elements).toEqual([label]);
  });

  it('selects an element clicked with a drawing tool and moves it, while a drag elsewhere still draws', () => {
    const box: SketchElement = { id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: red, strokeWidth: 4 };
    const interaction = createInteraction([box]);
    interaction.setTool('pen');

    drag(interaction, [[100, 25], [100, 25]]);
    expect(interaction.selected?.id).toBe('r');
    expect(interaction.elements).toEqual([box]);

    drag(interaction, [[100, 25], [125, 25], [150, 25]]);
    expect(interaction.elements).toEqual([{ ...box, x: 50 }]);

    drag(interaction, [[300, 300], [300, 300]]);
    expect(interaction.selected).toBeNull();
    drag(interaction, [[300, 300], [320, 310], [340, 330]]);
    expect(interaction.elements.map((element) => element.type)).toEqual(['rectangle', 'stroke']);
    expect(interaction.tool).toBe('pen');
  });

  it('snaps a moved element to the image centre and shows the guide only while dragging', () => {
    const box: SketchElement = { id: 'r', type: 'rectangle', x: 0, y: 20, width: 200, height: 100, color: red, strokeWidth: 4 };
    const interaction = new SketchInteraction([box], () => 'new', { width: 1000, height: 800 });
    interaction.setTool('select');

    interaction.pointerDown({ x: 0, y: 70 }, metrics);
    interaction.pointerMove({ x: 395, y: 70 });
    expect(interaction.guides).toEqual([{ axis: 'x', position: 500, start: 0, end: 800 }]);
    interaction.pointerUp({ x: 395, y: 70 });

    expect(interaction.elements).toEqual([{ ...box, x: 400 }]);
    expect(interaction.guides).toEqual([]);
  });

  it('snaps lines to 45° steps and near squares to squares, forced with constrain and skipped when free', () => {
    const interaction = createInteraction();
    interaction.setTool('line');
    drag(interaction, [[0, 0], [100, 7]]);
    interaction.setTool('rectangle');
    drag(interaction, [[300, 300], [400, 395]]);
    interaction.setTool('ellipse');
    interaction.pointerDown({ x: 600, y: 600 }, metrics, { free: true });
    interaction.pointerUp({ x: 700, y: 695 }, { free: true });
    interaction.setTool('arrow');
    interaction.pointerDown({ x: 0, y: 900 }, metrics);
    interaction.pointerUp({ x: 100, y: 930 }, { constrain: true });

    const style = { color: red, strokeWidth: 4 };
    expect(interaction.elements).toEqual([
      { id: 'e1', type: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, ...style },
      { id: 'e2', type: 'rectangle', x: 300, y: 300, width: 100, height: 100, ...style },
      { id: 'e3', type: 'ellipse', x: 600, y: 600, width: 100, height: 95, ...style },
      { id: 'e4', type: 'arrow', start: { x: 0, y: 900 }, end: { x: 100, y: 900 }, ...style },
    ]);
  });

  it('selects and moves the element under the pointer as one undoable step', () => {
    const text: SketchElement = { id: 't', type: 'text', x: 0, y: 0, width: 40, height: 20, text: 'Jahre', fontSize: 16, color: red };
    const interaction = createInteraction([text]);
    interaction.setTool('select');

    drag(interaction, [[10, 10], [20, 18], [30, 25]]);

    expect(interaction.selected?.id).toBe('t');
    expect(interaction.elements).toEqual([{ ...text, x: 20, y: 15 }]);
    interaction.undo();
    expect(interaction.elements).toEqual([text]);
  });

  it('resizes the selected element from a corner handle', () => {
    const box: SketchElement = { id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: red, strokeWidth: 4 };
    const interaction = createInteraction([box]);
    interaction.setTool('select');
    drag(interaction, [[100, 25], [100, 25]]);

    drag(interaction, [[100, 50], [150, 80], [200, 100]]);

    expect(interaction.elements).toEqual([{ ...box, width: 200, height: 100 }]);
  });

  it('asks for text where the text tool clicks and adds only non-empty text', () => {
    const interaction = createInteraction();
    interaction.setTool('text');
    interaction.setStyle({ color: red, fontSize: 24 });

    const request = drag(interaction, [[15, 20], [15, 20]]);
    expect(request).toEqual({ kind: 'create-text', point: { x: 15, y: 20 } });
    interaction.addText({ x: 15, y: 20 }, '   ', { width: 10, height: 30 });
    interaction.addText({ x: 15, y: 20 }, 'Jahre', { width: 60, height: 30 });

    expect(interaction.elements).toEqual([
      { id: 'e1', type: 'text', x: 15, y: 20, width: 60, height: 30, text: 'Jahre', fontSize: 24, color: red },
    ]);
  });

  it('applies a new colour to the selection and deletes it, each undoable', () => {
    const box: SketchElement = { id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: red, strokeWidth: 4 };
    const interaction = createInteraction([box]);
    interaction.setTool('select');
    drag(interaction, [[0, 25], [0, 25]]);

    interaction.setStyle({ color: '#1971c2' });
    expect(interaction.elements).toEqual([{ ...box, color: '#1971c2' }]);
    interaction.deleteSelected();
    expect(interaction.elements).toEqual([]);
    interaction.undo();
    interaction.undo();
    expect(interaction.elements).toEqual([box]);
  });
});
