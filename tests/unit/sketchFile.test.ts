import { deflateSync } from 'node:zlib';

import { readPngChunks } from '@/png/pngChunks';
import { embedSketch, extractSketch, type SketchPayload } from '@/png/sketchFile';

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A valid 2x1 RGB PNG built independently of the code under test. */
function tinyPng(): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.from([0, 255, 0, 0, 0, 0, 255]);
  return new Uint8Array(Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', new Uint8Array()),
  ]));
}

describe('sketch file format', () => {
  const payload: SketchPayload = {
    document: {
      version: 1,
      width: 2,
      height: 1,
      elements: [{ id: 't', type: 'text', x: 0, y: 0, text: 'Größe °C', fontSize: 20, width: 40, height: 25, color: '#e03131' }],
    },
    original: { mimeType: 'image/jpeg', bytes: new Uint8Array([255, 216, 255, 217]) },
  };

  it('stores the editable sketch and the original image inside a valid PNG', () => {
    const annotated = embedSketch(tinyPng(), payload);

    const types = readPngChunks(annotated).map((entry) => entry.type);
    expect(types[0]).toBe('IHDR');
    expect(types[types.length - 1]).toBe('IEND');
    expect(types).toEqual(expect.arrayContaining(['IDAT', 'skDt', 'skOr']));
    for (const entry of readPngChunks(annotated)) {
      const body = Buffer.concat([Buffer.from(entry.type, 'latin1'), Buffer.from(entry.data)]);
      expect(entry.crc).toBe(crc32(body));
    }
    expect(extractSketch(annotated)).toEqual(payload);
  });

  it('replaces an earlier sketch instead of stacking them', () => {
    const once = embedSketch(tinyPng(), payload);
    const twice = embedSketch(once, { ...payload, document: { ...payload.document, elements: [] } });

    expect(readPngChunks(twice).filter((entry) => entry.type === 'skDt')).toHaveLength(1);
    expect(extractSketch(twice)?.document.elements).toEqual([]);
  });

  it('finds no sketch in a plain PNG or in data that is not a PNG', () => {
    expect(extractSketch(tinyPng())).toBeNull();
    expect(extractSketch(new Uint8Array([255, 216, 255, 217]))).toBeNull();
  });
});
