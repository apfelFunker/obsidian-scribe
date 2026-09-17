import type { SketchElement, SketchPoint, SketchRect } from './elements';
import { elementBounds } from './elements';

/** A guide line to draw: vertical at x = `position` for axis `x`, horizontal for `y`, spanning `start` to `end`. */
export interface SnapGuide {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
}

/** A line things can align with, and how far it reaches along the other axis. */
interface SnapLine {
  value: number;
  start: number;
  end: number;
}

export interface SnapTargets {
  xs: SnapLine[];
  ys: SnapLine[];
}

const ANGLE_STEP = Math.PI / 4;
/** Lines within this angle of a 45° step snap onto it. */
const ANGLE_SNAP = (5 * Math.PI) / 180;
/** Boxes whose sides differ by at most this share snap to a square. */
const SQUARE_SNAP = 0.08;
/** Features this close to a line count as aligned with it. */
const ALIGNED = 0.5;

/** Snaps the end of a line to the nearest 45° step when close to it, or always when forced. */
export function snapAngle(start: SketchPoint, end: SketchPoint, force: boolean): SketchPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return end;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / ANGLE_STEP) * ANGLE_STEP;
  if (!force && Math.abs(angle - snapped) > ANGLE_SNAP) return end;
  const unitX = Math.cos(snapped);
  const unitY = Math.sin(snapped);
  const length = dx * unitX + dy * unitY;
  return { x: start.x + unitX * length, y: start.y + unitY * length };
}

/** Snaps the dragged corner of a box to make it square when nearly square, or always when forced. */
export function snapSquare(anchor: SketchPoint, point: SketchPoint, force: boolean): SketchPoint {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const width = Math.abs(dx);
  const height = Math.abs(dy);
  const size = Math.max(width, height);
  if (size === 0) return point;
  if (!force && Math.abs(width - height) / size > SQUARE_SNAP) return point;
  return { x: anchor.x + (dx < 0 ? -size : size), y: anchor.y + (dy < 0 ? -size : size) };
}

/** Edges and centres of the image and of every element except the one being edited. */
export function collectSnapTargets(
  elements: readonly SketchElement[],
  excludeId: string | null,
  image: { width: number; height: number } | null,
): SnapTargets {
  const xs: SnapLine[] = [];
  const ys: SnapLine[] = [];
  if (image) {
    for (const value of [0, image.width / 2, image.width]) xs.push({ value, start: 0, end: image.height });
    for (const value of [0, image.height / 2, image.height]) ys.push({ value, start: 0, end: image.width });
  }
  for (const element of elements) {
    if (element.id === excludeId) continue;
    const bounds = elementBounds(element);
    for (const value of [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width]) {
      xs.push({ value, start: bounds.y, end: bounds.y + bounds.height });
    }
    for (const value of [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height]) {
      ys.push({ value, start: bounds.x, end: bounds.x + bounds.width });
    }
  }
  return { xs, ys };
}

/** How far to move a box so one of its edges or its centre meets a target line, with the guides that shows. */
export function snapRect(
  rect: SketchRect,
  targets: SnapTargets,
  threshold: number,
): { dx: number; dy: number; guides: SnapGuide[] } {
  const offsetX = nearestOffset(xFeatures(rect), targets.xs, threshold);
  const offsetY = nearestOffset(yFeatures(rect), targets.ys, threshold);
  const moved = { ...rect, x: rect.x + (offsetX ?? 0), y: rect.y + (offsetY ?? 0) };
  return {
    dx: offsetX ?? 0,
    dy: offsetY ?? 0,
    guides: [
      ...(offsetX === null ? [] : guidesAlong('x', xFeatures(moved), targets.xs, moved.y, moved.y + moved.height)),
      ...(offsetY === null ? [] : guidesAlong('y', yFeatures(moved), targets.ys, moved.x, moved.x + moved.width)),
    ],
  };
}

/** Pulls a point onto target lines near it on each axis. */
export function snapPoint(
  point: SketchPoint,
  targets: SnapTargets,
  threshold: number,
): { point: SketchPoint; guides: SnapGuide[] } {
  const offsetX = nearestOffset([point.x], targets.xs, threshold);
  const offsetY = nearestOffset([point.y], targets.ys, threshold);
  const snapped = { x: point.x + (offsetX ?? 0), y: point.y + (offsetY ?? 0) };
  return {
    point: snapped,
    guides: [
      ...(offsetX === null ? [] : guidesAlong('x', [snapped.x], targets.xs, snapped.y, snapped.y)),
      ...(offsetY === null ? [] : guidesAlong('y', [snapped.y], targets.ys, snapped.x, snapped.x)),
    ],
  };
}

function xFeatures(rect: SketchRect): number[] {
  return [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
}

function yFeatures(rect: SketchRect): number[] {
  return [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}

/** The smallest shift that puts a feature on a line within the threshold; the first one wins ties. */
function nearestOffset(features: readonly number[], lines: readonly SnapLine[], threshold: number): number | null {
  let best: number | null = null;
  for (const feature of features) {
    for (const line of lines) {
      const offset = line.value - feature;
      if (Math.abs(offset) <= threshold && (best === null || Math.abs(offset) < Math.abs(best))) best = offset;
    }
  }
  return best;
}

function guidesAlong(
  axis: 'x' | 'y',
  features: readonly number[],
  lines: readonly SnapLine[],
  start: number,
  end: number,
): SnapGuide[] {
  const guides: SnapGuide[] = [];
  for (const line of lines) {
    if (!features.some((feature) => Math.abs(feature - line.value) <= ALIGNED)) continue;
    const existing = guides.find((guide) => Math.abs(guide.position - line.value) <= ALIGNED);
    if (existing) {
      existing.start = Math.min(existing.start, line.start);
      existing.end = Math.max(existing.end, line.end);
    } else {
      guides.push({ axis, position: line.value, start: Math.min(line.start, start), end: Math.max(line.end, end) });
    }
  }
  return guides;
}
