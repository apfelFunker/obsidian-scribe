import type { SketchElement, SketchPoint, SketchRect, TextElement } from './elements';
import { elementBounds } from './elements';
import type { SnapGuide } from './snapping';

/** A friendly hand-written face where the platform has one. */
export const TEXT_FONT = '"Noteworthy", "Chalkboard SE", "Segoe Print", "Comic Sans MS", cursive';
export const TEXT_LINE_HEIGHT = 1.25;
/** Guides stand out from typical drawing colours. */
export const GUIDE_COLOR = '#ff2d95';

export type HandlePosition = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left';

export interface SketchScene {
  background: CanvasImageSource | null;
  /** Image size in pixels. */
  width: number;
  height: number;
  elements: readonly SketchElement[];
}

export interface SketchSelection {
  element: SketchElement;
  accent: string;
}

/**
 * Draws the image and its sketch. `pixelScale` is canvas pixels per image
 * pixel; `uiScale` is image pixels per screen pixel, for selection chrome that
 * keeps its size on screen.
 */
export function drawScene(
  context: CanvasRenderingContext2D,
  scene: SketchScene,
  pixelScale: number,
  uiScale: number,
  selection: SketchSelection | null = null,
  guides: readonly SnapGuide[] = [],
): void {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  if (scene.background) context.drawImage(scene.background, 0, 0, scene.width, scene.height);
  for (const element of scene.elements) drawElement(context, element);
  if (selection) drawSelection(context, selection, uiScale);
  if (guides.length > 0) drawGuides(context, guides, uiScale);
}

function drawGuides(context: CanvasRenderingContext2D, guides: readonly SnapGuide[], uiScale: number): void {
  context.save();
  context.strokeStyle = GUIDE_COLOR;
  context.lineWidth = uiScale;
  context.beginPath();
  for (const guide of guides) {
    if (guide.axis === 'x') {
      context.moveTo(guide.position, guide.start);
      context.lineTo(guide.position, guide.end);
    } else {
      context.moveTo(guide.start, guide.position);
      context.lineTo(guide.end, guide.position);
    }
  }
  context.stroke();
  context.restore();
}

export function drawElement(context: CanvasRenderingContext2D, element: SketchElement): void {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = element.color;
  context.fillStyle = element.color;
  switch (element.type) {
    case 'stroke':
      drawFreehand(context, element.points, element.strokeWidth);
      break;
    case 'line':
    case 'arrow':
      context.lineWidth = element.strokeWidth;
      context.beginPath();
      context.moveTo(element.start.x, element.start.y);
      context.lineTo(element.end.x, element.end.y);
      if (element.type === 'arrow') addArrowhead(context, element.start, element.end, element.strokeWidth);
      context.stroke();
      break;
    case 'rectangle':
      context.lineWidth = element.strokeWidth;
      context.strokeRect(element.x, element.y, element.width, element.height);
      break;
    case 'ellipse':
      context.lineWidth = element.strokeWidth;
      context.beginPath();
      context.ellipse(
        element.x + element.width / 2,
        element.y + element.height / 2,
        Math.max(0.5, element.width / 2),
        Math.max(0.5, element.height / 2),
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
      break;
    case 'text':
      drawText(context, element);
      break;
  }
  context.restore();
}

/** Width and height a text needs at a font size, in image pixels. */
export function measureText(context: CanvasRenderingContext2D, text: string, fontSize: number): { width: number; height: number } {
  context.save();
  context.font = `${fontSize}px ${TEXT_FONT}`;
  const lines = text.split('\n');
  const width = Math.max(fontSize * 0.5, ...lines.map((line) => context.measureText(line).width));
  context.restore();
  return { width: Math.ceil(width), height: Math.ceil(lines.length * fontSize * TEXT_LINE_HEIGHT) };
}

/** Corner handles for resizing a selection, in image pixels. */
export function handleRects(bounds: SketchRect, size: number): Array<{ position: HandlePosition; rect: SketchRect }> {
  const half = size / 2;
  const corners: Array<[HandlePosition, number, number]> = [
    ['top-left', bounds.x, bounds.y],
    ['top-right', bounds.x + bounds.width, bounds.y],
    ['bottom-right', bounds.x + bounds.width, bounds.y + bounds.height],
    ['bottom-left', bounds.x, bounds.y + bounds.height],
  ];
  return corners.map(([position, x, y]) => ({ position, rect: { x: x - half, y: y - half, width: size, height: size } }));
}

/** The selection frame sits this many screen pixels outside the element. */
export const SELECTION_PADDING = 6;
export const HANDLE_SIZE = 10;

export function selectionFrame(element: SketchElement, uiScale: number): SketchRect {
  const bounds = elementBounds(element);
  const padding = SELECTION_PADDING * uiScale;
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}

function drawSelection(context: CanvasRenderingContext2D, selection: SketchSelection, uiScale: number): void {
  const frame = selectionFrame(selection.element, uiScale);
  context.save();
  context.strokeStyle = selection.accent;
  context.lineWidth = 1.5 * uiScale;
  context.setLineDash([6 * uiScale, 4 * uiScale]);
  context.strokeRect(frame.x, frame.y, frame.width, frame.height);
  context.setLineDash([]);
  context.fillStyle = '#ffffff';
  for (const { rect } of handleRects(frame, HANDLE_SIZE * uiScale)) {
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }
  context.restore();
}

/**
 * A stroke as curves from midpoint to midpoint, bent by the points between.
 * Each curve stays inside the triangle of its points, so it cannot swing out.
 */
function drawFreehand(context: CanvasRenderingContext2D, points: readonly SketchPoint[], width: number): void {
  if (points.length === 0) return;
  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  const last = points[points.length - 1];
  context.lineTo(last.x, last.y);
  context.stroke();
}

function addArrowhead(context: CanvasRenderingContext2D, start: SketchPoint, end: SketchPoint, width: number): void {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const length = Math.max(10, width * 4);
  for (const side of [-1, 1]) {
    context.moveTo(end.x, end.y);
    context.lineTo(
      end.x - length * Math.cos(angle + side * (Math.PI / 7)),
      end.y - length * Math.sin(angle + side * (Math.PI / 7)),
    );
  }
}

function drawText(context: CanvasRenderingContext2D, element: TextElement): void {
  context.font = `${element.fontSize}px ${TEXT_FONT}`;
  context.textBaseline = 'top';
  if (element.angle) {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    context.translate(centerX, centerY);
    context.rotate(element.angle);
    context.translate(-centerX, -centerY);
  }
  element.text.split('\n').forEach((line, index) => {
    context.fillText(line, element.x, element.y + index * element.fontSize * TEXT_LINE_HEIGHT);
  });
}
