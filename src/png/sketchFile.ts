import type { SketchElement } from '../sketch/elements';
import { isPng, readPngChunks, writePng } from './pngChunks';

/** The editable drawing on an image, in the image's pixel coordinates. */
export interface SketchDocument {
  version: 1;
  width: number;
  height: number;
  elements: SketchElement[];
  /** A sheet to draw on with nothing behind it. */
  surface?: boolean;
}

export interface SketchPayload {
  document: SketchDocument;
  /** The image as it was before anything was drawn on it. */
  original: { mimeType: string; bytes: Uint8Array };
}

/** Private, ancillary, safe-to-copy chunk types, so image tools keep them and ignore them. */
const DOCUMENT_CHUNK = 'skDt';
const ORIGINAL_CHUNK = 'skOr';

/** Adds the sketch and the original image to a rendered PNG, replacing any sketch it already had. */
export function embedSketch(png: Uint8Array, payload: SketchPayload): Uint8Array {
  const chunks = readPngChunks(png).filter((chunk) => chunk.type !== DOCUMENT_CHUNK && chunk.type !== ORIGINAL_CHUNK);
  const end = chunks.findIndex((chunk) => chunk.type === 'IEND');
  const metadata = { ...payload.document, originalMimeType: payload.original.mimeType };
  chunks.splice(
    end,
    0,
    { type: DOCUMENT_CHUNK, data: new TextEncoder().encode(JSON.stringify(metadata)), crc: 0 },
    { type: ORIGINAL_CHUNK, data: payload.original.bytes, crc: 0 },
  );
  return writePng(chunks);
}

/** The sketch stored in an image, or null for images without one. */
export function extractSketch(bytes: Uint8Array): SketchPayload | null {
  if (!isPng(bytes)) return null;
  let chunks;
  try {
    chunks = readPngChunks(bytes);
  } catch {
    return null;
  }
  const documentChunk = chunks.find((chunk) => chunk.type === DOCUMENT_CHUNK);
  const originalChunk = chunks.find((chunk) => chunk.type === ORIGINAL_CHUNK);
  if (!documentChunk || !originalChunk) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(documentChunk.data)) as SketchDocument & { originalMimeType?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.elements)) return null;
    const { originalMimeType, ...document } = parsed;
    return {
      document,
      original: {
        mimeType: typeof originalMimeType === 'string' ? originalMimeType : 'image/png',
        bytes: originalChunk.data,
      },
    };
  } catch {
    return null;
  }
}
