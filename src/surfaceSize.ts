export interface Size {
  width: number;
  height: number;
}

/** Nothing smaller than this can still be drawn on. */
export const SURFACE_MIN = 80;

/**
 * Where the corner of a sheet lands while it is dragged. An empty sheet takes
 * any shape; once something is drawn on it the shape is settled, and dragging
 * only makes it larger or smaller.
 */
export function surfaceSize(start: Size, moved: { dx: number; dy: number }, keepShape: boolean): Size {
  const width = Math.max(SURFACE_MIN, start.width + moved.dx);
  if (!keepShape) {
    return { width: Math.round(width), height: Math.round(Math.max(SURFACE_MIN, start.height + moved.dy)) };
  }
  const shape = start.height / start.width;
  const kept = Math.max(width, SURFACE_MIN / shape, SURFACE_MIN);
  return { width: Math.round(kept), height: Math.round(kept * shape) };
}
