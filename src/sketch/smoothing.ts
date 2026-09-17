import type { SketchPoint } from './elements';

/** Points at even `spacing` along the path, always including its first and last point. */
export function resamplePoints(points: readonly SketchPoint[], spacing: number): SketchPoint[] {
  if (points.length < 2 || spacing <= 0) return points.map(({ x, y }) => ({ x, y }));
  const result: SketchPoint[] = [{ x: points[0].x, y: points[0].y }];
  // Distance travelled along the path since the last sample.
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = distance(from, to);
    if (length === 0) continue;
    let along = spacing - travelled;
    while (along < length - 1e-9) {
      const t = along / length;
      result.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      along += spacing;
    }
    travelled = length - (along - spacing);
  }
  const last = points[points.length - 1];
  if (distance(result[result.length - 1], last) > 1e-9) result.push({ x: last.x, y: last.y });
  return result;
}

/**
 * A Gaussian-weighted average over `radius` neighbours on each side. Averages
 * never leave the span of the points they come from, so corners get rounded
 * but never overshoot. The window shrinks towards the ends, which stay put.
 */
export function smoothPoints(points: readonly SketchPoint[], radius: number): SketchPoint[] {
  const reachLimit = Math.floor(radius);
  if (points.length < 3 || reachLimit < 1) return points.map(({ x, y }) => ({ x, y }));
  const sigma = radius / 2;
  const weights = Array.from({ length: reachLimit + 1 }, (_, offset) => Math.exp(-(offset * offset) / (2 * sigma * sigma)));
  const last = points.length - 1;
  return points.map((point, index) => {
    const reach = Math.min(reachLimit, index, last - index);
    if (reach === 0) return { x: point.x, y: point.y };
    let x = point.x * weights[0];
    let y = point.y * weights[0];
    let total = weights[0];
    for (let offset = 1; offset <= reach; offset += 1) {
      const weight = weights[offset];
      x += (points[index - offset].x + points[index + offset].x) * weight;
      y += (points[index - offset].y + points[index + offset].y) * weight;
      total += 2 * weight;
    }
    return { x: x / total, y: y / total };
  });
}

/** Evenly spaced, then averaged: a steady line from shaky input. */
export function smoothStroke(points: readonly SketchPoint[], spacing: number, radius: number): SketchPoint[] {
  return smoothPoints(resamplePoints(points, spacing), radius);
}

/** Ramer–Douglas–Peucker: drops points closer than `tolerance` to the line their neighbours span. */
export function simplifyPoints(points: readonly SketchPoint[], tolerance: number): SketchPoint[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const ranges: Array<[number, number]> = [[0, points.length - 1]];
  for (let range = ranges.pop(); range; range = ranges.pop()) {
    const [first, last] = range;
    let farthest = -1;
    let farthestDistance = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const gap = distanceToSegment(points[index], points[first], points[last]);
      if (gap > farthestDistance) {
        farthest = index;
        farthestDistance = gap;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      ranges.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

function distance(a: SketchPoint, b: SketchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: SketchPoint, start: SketchPoint, end: SketchPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}
