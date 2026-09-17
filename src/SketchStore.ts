import type { App, TFile } from 'obsidian';

import { embedSketch, extractSketch } from './png/sketchFile';
import type { SketchElement } from './sketch/elements';
import { drawElement } from './sketch/render';

export const SKETCHABLE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'avif']);

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

export interface LoadedSketch {
  file: TFile;
  background: ImageBitmap;
  width: number;
  height: number;
  elements: SketchElement[];
  original: { mimeType: string; bytes: Uint8Array };
  /** True for a sheet that has no picture under the drawing. */
  surface: boolean;
}

/** Reads and writes sketches stored inside image files. */
export class SketchStore {
  constructor(private readonly app: App) {}

  isSketchable(file: TFile): boolean {
    return SKETCHABLE_EXTENSIONS.has(file.extension.toLowerCase());
  }

  async load(file: TFile): Promise<LoadedSketch> {
    const bytes = new Uint8Array(await this.app.vault.readBinary(file));
    const embedded = extractSketch(bytes);
    const original = embedded?.original ?? { mimeType: MIME_TYPES[file.extension.toLowerCase()] ?? 'image/png', bytes };
    const background = await createImageBitmap(new Blob([toArrayBuffer(original.bytes)], { type: original.mimeType }));
    return {
      file,
      background,
      width: background.width,
      height: background.height,
      elements: embedded?.document.elements ?? [],
      original,
      surface: embedded?.document.surface === true,
    };
  }

  /**
   * Writes the drawing into the image: a PNG showing the drawing that also
   * carries the editable elements and the original. Without elements the
   * original comes back. Other formats become PNG, and Obsidian updates their links.
   */
  async save(sketch: LoadedSketch, elements: readonly SketchElement[]): Promise<TFile> {
    let file = sketch.file;
    const originalExtension = Object.entries(MIME_TYPES).find(([, type]) => type === sketch.original.mimeType)?.[0];
    // An empty sheet stays a sheet; only a picture comes back when its drawing is gone.
    if (!sketch.surface && elements.length === 0 && originalExtension && sameExtension(file.extension, originalExtension)) {
      await this.app.vault.modifyBinary(file, toArrayBuffer(sketch.original.bytes));
      return file;
    }
    const rendered = await renderPng(sketch.background, sketch.width, sketch.height, elements);
    const data = elements.length === 0 && !sketch.surface
      ? rendered
      : embedSketch(rendered, {
        document: {
          version: 1,
          width: sketch.width,
          height: sketch.height,
          elements: [...elements],
          ...(sketch.surface ? { surface: true } : {}),
        },
        original: sketch.original,
      });
    if (file.extension.toLowerCase() !== 'png') {
      const target = this.availablePath(file.path.replace(/\.[^./]+$/, '.png'));
      await this.app.fileManager.renameFile(file, target);
      file = this.app.vault.getFileByPath(target) ?? file;
    }
    await this.app.vault.modifyBinary(file, toArrayBuffer(data));
    return file;
  }

  /** Makes a sheet with nothing on it: a see-through image that carries a drawing. */
  async createSurface(path: string, width: number, height: number): Promise<TFile> {
    const clear = await transparentPng(width, height);
    const bytes = embedSketch(clear, {
      document: { version: 1, width, height, elements: [], surface: true },
      original: { mimeType: 'image/png', bytes: clear },
    });
    return this.app.vault.createBinary(this.availablePath(path), toArrayBuffer(bytes));
  }

  availablePath(path: string): string {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const dot = path.lastIndexOf('.');
    for (let index = 1; ; index += 1) {
      const candidate = `${path.slice(0, dot)} ${index}${path.slice(dot)}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
  }
}

/** A PNG of that size with nothing in it. */
export async function transparentPng(width: number, height: number): Promise<Uint8Array> {
  const canvas = activeDocument.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG encoding failed.'))), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Draws elements over an image at full resolution and encodes the result as PNG. */
export async function renderPng(
  background: CanvasImageSource,
  width: number,
  height: number,
  elements: readonly SketchElement[],
): Promise<Uint8Array> {
  const canvas = activeDocument.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas drawing is not available.');
  context.drawImage(background, 0, 0, width, height);
  for (const element of elements) drawElement(context, element);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG encoding failed.'))), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function sameExtension(a: string, b: string): boolean {
  const normalize = (value: string): string => (value.toLowerCase() === 'jpeg' ? 'jpg' : value.toLowerCase());
  return normalize(a) === normalize(b);
}
