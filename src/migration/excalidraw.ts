import { decompressFromBase64 } from 'lz-string';

import type { SketchDocument } from '../png/sketchFile';
import type { SketchElement, SketchPoint } from '../sketch/elements';

export interface ExcalidrawAnnotation {
  /** Link to the image the drawing annotates, as written in the drawing file. */
  imageLink: string;
  document: SketchDocument;
}

interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  strokeWidth?: number;
  isDeleted?: boolean;
  points?: Array<[number, number]>;
  text?: string;
  fontSize?: number;
  fileId?: string;
}

/** Excalidraw draws freehand strokes about this many times wider than their stroke width. */
const FREEDRAW_WIDTH_FACTOR = 4;

/**
 * Reads an Excalidraw plugin drawing that annotates one image and converts it
 * to a sketch in that image's pixels. Returns null for anything else.
 * `imageSize` gives the natural size of the linked image.
 */
export function parseExcalidrawAnnotation(
  source: string,
  imageSize: (link: string) => { width: number; height: number } | null,
): ExcalidrawAnnotation | null {
  if (!/^excalidraw-plugin:/m.test(source)) return null;
  const scene = readScene(source);
  if (!scene) return null;
  const files = new Map<string, string>();
  for (const match of source.matchAll(/^([\w-]+): \[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gm)) {
    files.set(match[1], match[2]);
  }
  const elements = scene.filter((element) => !element.isDeleted);
  const image = elements.find((element) => element.type === 'image' && element.fileId && files.has(element.fileId));
  const imageLink = image?.fileId ? files.get(image.fileId) : undefined;
  if (!image || !imageLink || image.width <= 0 || image.height <= 0) return null;
  const natural = imageSize(imageLink);
  if (!natural) return null;

  const scaleX = natural.width / image.width;
  const scaleY = natural.height / image.height;
  const scale = (scaleX + scaleY) / 2;
  const map = (x: number, y: number): SketchPoint => ({ x: (x - image.x) * scaleX, y: (y - image.y) * scaleY });
  const converted: SketchElement[] = [];
  for (const element of elements) {
    if (element === image) continue;
    const color = element.strokeColor ?? '#000000';
    const strokeWidth = (element.strokeWidth ?? 1) * scale;
    switch (element.type) {
      case 'freedraw': {
        const points = (element.points ?? []).map(([dx, dy]) => map(element.x + dx, element.y + dy));
        if (points.length > 0) {
          converted.push({ id: element.id, type: 'stroke', points, color, strokeWidth: strokeWidth * FREEDRAW_WIDTH_FACTOR });
        }
        break;
      }
      case 'line':
      case 'arrow': {
        const points = (element.points ?? []).map(([dx, dy]) => map(element.x + dx, element.y + dy));
        if (points.length < 2) break;
        if (element.type === 'arrow' || points.length === 2) {
          converted.push({ id: element.id, type: element.type, start: points[0], end: points[points.length - 1], color, strokeWidth });
        } else {
          converted.push({ id: element.id, type: 'stroke', points, color, strokeWidth });
        }
        break;
      }
      case 'rectangle':
      case 'ellipse': {
        const origin = map(element.x, element.y);
        converted.push({
          id: element.id,
          type: element.type,
          ...origin,
          width: element.width * scaleX,
          height: element.height * scaleY,
          color,
          strokeWidth,
        });
        break;
      }
      case 'diamond': {
        const { x, y, width, height } = element;
        const points = [
          map(x + width / 2, y), map(x + width, y + height / 2), map(x + width / 2, y + height),
          map(x, y + height / 2), map(x + width / 2, y),
        ];
        converted.push({ id: element.id, type: 'stroke', points, color, strokeWidth });
        break;
      }
      case 'text': {
        const origin = map(element.x, element.y);
        converted.push({
          id: element.id,
          type: 'text',
          ...origin,
          width: element.width * scaleX,
          height: element.height * scaleY,
          text: element.text ?? '',
          fontSize: (element.fontSize ?? 20) * scaleY,
          color,
          ...(element.angle ? { angle: element.angle } : {}),
        });
        break;
      }
      default:
        break;
    }
  }
  return {
    imageLink,
    document: { version: 1, width: natural.width, height: natural.height, elements: converted },
  };
}

function readScene(source: string): ExcalidrawElement[] | null {
  const compressed = /```compressed-json\n([\s\S]*?)```/.exec(source);
  const plain = /```json\n([\s\S]*?)```/.exec(source);
  let json: string | null = null;
  if (compressed) json = decompressFromBase64(compressed[1].replace(/\s+/g, ''));
  else if (plain) json = plain[1];
  if (!json) return null;
  try {
    const scene = JSON.parse(json) as { elements?: unknown };
    return Array.isArray(scene.elements) ? (scene.elements as ExcalidrawElement[]) : null;
  } catch {
    return null;
  }
}
