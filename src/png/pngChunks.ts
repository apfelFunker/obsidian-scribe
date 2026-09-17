export interface PngChunk {
  type: string;
  data: Uint8Array;
  crc: number;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= SIGNATURE.length && SIGNATURE.every((value, index) => bytes[index] === value);
}

/** The chunks of a PNG in file order. Throws when the data is not a well-formed PNG. */
export function readPngChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new Error('Not a PNG image.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let offset = SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error('The PNG image is truncated.');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, dataStart));
    chunks.push({ type, data: bytes.slice(dataStart, dataEnd), crc: view.getUint32(dataEnd) });
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }
  if (chunks[chunks.length - 1]?.type !== 'IEND') throw new Error('The PNG image has no end.');
  return chunks;
}

/** Writes chunks as a PNG, computing each checksum. */
export function writePng(chunks: ReadonlyArray<{ type: string; data: Uint8Array }>): Uint8Array {
  const size = SIGNATURE.length + chunks.reduce((total, chunk) => total + 12 + chunk.data.length, 0);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set(SIGNATURE, 0);
  let offset = SIGNATURE.length;
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.data.length);
    for (let index = 0; index < 4; index += 1) {
      bytes[offset + 4 + index] = chunk.type.charCodeAt(index);
    }
    bytes.set(chunk.data, offset + 8);
    view.setUint32(offset + 8 + chunk.data.length, crc32(bytes.subarray(offset + 4, offset + 8 + chunk.data.length)));
    offset += 12 + chunk.data.length;
  }
  return bytes;
}

let crcTable: Uint32Array | null = null;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let value = 0; value < 256; value += 1) {
      let crc = value;
      for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      crcTable[value] = crc >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
