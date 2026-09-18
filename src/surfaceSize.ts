export interface Size {
  width: number;
  height: number;
}

/** Nothing smaller than this can still be drawn on. */
export const SURFACE_MIN = 80;

/**
 * Where the corner of an empty sheet lands while it is dragged. An empty sheet
 * takes any shape; once something is drawn on it, Obsidian's own corner takes
 * over and only scales it.
 */
export function surfaceSize(start: Size, moved: { dx: number; dy: number }): Size {
  return {
    width: Math.round(Math.max(SURFACE_MIN, start.width + moved.dx)),
    height: Math.round(Math.max(SURFACE_MIN, start.height + moved.dy)),
  };
}
