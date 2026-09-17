export interface SketchPoint {
  x: number;
  y: number;
}

export interface SketchRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StrokeStyle {
  color: string;
  strokeWidth: number;
}

/** A freehand stroke. */
export interface StrokeElement extends StrokeStyle {
  id: string;
  type: 'stroke';
  points: SketchPoint[];
}

export interface LineElement extends StrokeStyle {
  id: string;
  type: 'line' | 'arrow';
  start: SketchPoint;
  end: SketchPoint;
}

export interface ShapeElement extends StrokeStyle, SketchRect {
  id: string;
  type: 'rectangle' | 'ellipse';
}

export interface TextElement extends SketchRect {
  id: string;
  type: 'text';
  text: string;
  fontSize: number;
  color: string;
  /** Rotation in radians around the centre of the text box. */
  angle?: number;
}

/** Something drawn on an image. Coordinates are image pixels. */
export type SketchElement = StrokeElement | LineElement | ShapeElement | TextElement;

export function createElementId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function rectFromPoints(a: SketchPoint, b: SketchPoint): SketchRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function elementBounds(element: SketchElement): SketchRect {
  switch (element.type) {
    case 'stroke':
      return boundsOfPoints(element.points);
    case 'line':
    case 'arrow':
      return rectFromPoints(element.start, element.end);
    case 'rectangle':
    case 'ellipse':
    case 'text':
      return { x: element.x, y: element.y, width: element.width, height: element.height };
  }
}

/** Whether a point touches an element: strokes and outlines near their line, texts anywhere in their box. */
export function hitTest(element: SketchElement, point: SketchPoint, tolerance: number): boolean {
  switch (element.type) {
    case 'stroke': {
      const reach = element.strokeWidth / 2 + tolerance;
      if (element.points.length === 1) return distance(point, element.points[0]) <= reach;
      for (let index = 1; index < element.points.length; index += 1) {
        if (distanceToSegment(point, element.points[index - 1], element.points[index]) <= reach) return true;
      }
      return false;
    }
    case 'line':
    case 'arrow':
      return distanceToSegment(point, element.start, element.end) <= element.strokeWidth / 2 + tolerance;
    case 'rectangle': {
      const reach = element.strokeWidth / 2 + tolerance;
      return contains(inflate(element, reach), point) && !contains(inflate(element, -reach), point);
    }
    case 'ellipse': {
      const reach = element.strokeWidth / 2 + tolerance;
      const radiusX = element.width / 2;
      const radiusY = element.height / 2;
      if (radiusX <= 0 || radiusY <= 0) return contains(inflate(element, reach), point);
      const normalized = Math.hypot(
        (point.x - (element.x + radiusX)) / radiusX,
        (point.y - (element.y + radiusY)) / radiusY,
      );
      return Math.abs(normalized - 1) * Math.min(radiusX, radiusY) <= reach;
    }
    case 'text':
      return contains(inflate(element, tolerance), unrotate(point, element));
  }
}

/** The topmost element under a point, or null. */
export function elementAt(
  elements: readonly SketchElement[],
  point: SketchPoint,
  tolerance: number,
): SketchElement | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    if (hitTest(elements[index], point, tolerance)) return elements[index];
  }
  return null;
}

export function moveElement<T extends SketchElement>(element: T, dx: number, dy: number): T {
  switch (element.type) {
    case 'stroke':
      return { ...element, points: element.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
    case 'line':
    case 'arrow':
      return {
        ...element,
        start: { x: element.start.x + dx, y: element.start.y + dy },
        end: { x: element.end.x + dx, y: element.end.y + dy },
      };
    default:
      return { ...element, x: element.x + dx, y: element.y + dy };
  }
}

/** Scales an element so its bounds fill `target`. Texts scale their font with the height. */
export function resizeElement<T extends SketchElement>(element: T, target: SketchRect): T {
  const bounds = elementBounds(element);
  const scaleX = bounds.width > 0 ? target.width / bounds.width : 1;
  const scaleY = bounds.height > 0 ? target.height / bounds.height : 1;
  const map = (point: SketchPoint): SketchPoint => ({
    x: target.x + (point.x - bounds.x) * scaleX,
    y: target.y + (point.y - bounds.y) * scaleY,
  });
  switch (element.type) {
    case 'stroke':
      return { ...element, points: element.points.map(map) };
    case 'line':
    case 'arrow':
      return { ...element, start: map(element.start), end: map(element.end) };
    case 'text':
      return { ...element, ...target, fontSize: Math.max(4, element.fontSize * scaleY) };
    default:
      return { ...element, ...target };
  }
}

export function boundsOfPoints(points: readonly SketchPoint[]): SketchRect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** A point in the text box's own unrotated frame. */
function unrotate(point: SketchPoint, text: TextElement): SketchPoint {
  if (!text.angle) return point;
  const centerX = text.x + text.width / 2;
  const centerY = text.y + text.height / 2;
  const cos = Math.cos(-text.angle);
  const sin = Math.sin(-text.angle);
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  return { x: centerX + dx * cos - dy * sin, y: centerY + dx * sin + dy * cos };
}

function distance(a: SketchPoint, b: SketchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: SketchPoint, start: SketchPoint, end: SketchPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy });
}

function inflate(rect: SketchRect, amount: number): SketchRect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function contains(rect: SketchRect, point: SketchPoint): boolean {
  return rect.width >= 0
    && rect.height >= 0
    && point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}
