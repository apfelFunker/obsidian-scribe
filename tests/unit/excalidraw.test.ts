import { compressToBase64 } from 'lz-string';

import { parseExcalidrawAnnotation } from '@/migration/excalidraw';

/** An Excalidraw plugin drawing as the plugin saves it, built from a scene. */
function drawingFile(scene: unknown): string {
  const compressed = compressToBase64(JSON.stringify(scene)).replace(/(.{80})/g, '$1\n');
  return [
    '---', '', 'excalidraw-plugin: parsed', '', '---',
    '# Excalidraw Data', '', '## Text Elements', 'Jahre ^abc', '',
    '## Embedded Files',
    'f1: [[Screenshot.png]]', '',
    '%%', '## Drawing', '```compressed-json', compressed, '```', '%%',
  ].join('\n');
}

const base = { angle: 0, strokeColor: '#e03131', isDeleted: false };

describe('parseExcalidrawAnnotation', () => {
  it('turns an annotated image drawing into a sketch in the image\'s own pixels', () => {
    const source = drawingFile({
      elements: [
        { ...base, id: 'img', type: 'image', x: 100, y: 50, width: 400, height: 300, fileId: 'f1', strokeWidth: 1 },
        { ...base, id: 'pen', type: 'freedraw', x: 150, y: 100, width: 50, height: 20, strokeWidth: 1, points: [[0, 0], [50, 20]] },
        { ...base, id: 'box', type: 'rectangle', x: 300, y: 200, width: 100, height: 50, strokeWidth: 2 },
        { ...base, id: 'arrow', type: 'arrow', x: 120, y: 60, width: 40, height: 40, strokeWidth: 2, points: [[0, 0], [10, 30], [40, 40]] },
        { ...base, id: 'label', type: 'text', x: 110, y: 320, width: 55, height: 25, strokeWidth: 2, text: 'Jahre', fontSize: 20, angle: Math.PI / 2 },
        { ...base, id: 'gone', type: 'text', x: 0, y: 0, width: 10, height: 10, strokeWidth: 1, text: 'x', fontSize: 20, isDeleted: true },
      ],
      files: {},
    });

    const result = parseExcalidrawAnnotation(source, () => ({ width: 800, height: 600 }));

    expect(result?.imageLink).toBe('Screenshot.png');
    expect(result?.document).toEqual({
      version: 1,
      width: 800,
      height: 600,
      elements: [
        { id: 'pen', type: 'stroke', points: [{ x: 100, y: 100 }, { x: 200, y: 140 }], color: '#e03131', strokeWidth: 8 },
        { id: 'box', type: 'rectangle', x: 400, y: 300, width: 200, height: 100, color: '#e03131', strokeWidth: 4 },
        { id: 'arrow', type: 'arrow', start: { x: 40, y: 20 }, end: { x: 120, y: 100 }, color: '#e03131', strokeWidth: 4 },
        { id: 'label', type: 'text', x: 20, y: 540, width: 110, height: 50, text: 'Jahre', fontSize: 40, color: '#e03131', angle: Math.PI / 2 },
      ],
    });
  });

  it('ignores notes that are not Excalidraw drawings of an image', () => {
    expect(parseExcalidrawAnnotation('# Just a note', () => ({ width: 1, height: 1 }))).toBeNull();
    expect(parseExcalidrawAnnotation(drawingFile({ elements: [], files: {} }), () => ({ width: 1, height: 1 }))).toBeNull();
  });
});
