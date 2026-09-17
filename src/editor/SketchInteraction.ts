import type { SketchElement, SketchPoint, SketchRect, TextElement } from '../sketch/elements';
import { elementAt, elementBounds, hitTest, moveElement, rectFromPoints, resizeElement } from '../sketch/elements';
import { SketchHistory } from '../sketch/history';
import { simplifyPoints, smoothStroke } from '../sketch/smoothing';
import type { SnapGuide, SnapTargets } from '../sketch/snapping';
import { collectSnapTargets, snapAngle, snapPoint, snapRect, snapSquare } from '../sketch/snapping';

export type SketchTool = 'select' | 'pen' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'text';

export interface SketchStyle {
  color: string;
  strokeWidth: number;
  fontSize: number;
}

/** Sizes that depend on zoom, in image pixels. */
export interface PointerMetrics {
  /** How far from a line a pointer still hits it. */
  tolerance: number;
  handleSize: number;
  /** Gap between an element and its selection frame. */
  padding: number;
  /** How close something must come to a guide line to snap to it. */
  snap: number;
  /** Distance between the points of a smoothed freehand stroke. */
  spacing: number;
  /** How far a pointer may travel and still count as a click. */
  tap: number;
}

export interface PointerModifiers {
  /** Always snap lines to 45° steps and boxes to squares. */
  constrain?: boolean;
  /** Snap to nothing. */
  free?: boolean;
}

export type InteractionRequest =
  | { kind: 'create-text'; point: SketchPoint }
  | { kind: 'edit-text'; element: TextElement };

type Corner = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left';
type ShapeTool = 'line' | 'arrow' | 'rectangle' | 'ellipse';

type Gesture =
  | { type: 'pen'; points: SketchPoint[]; spacing: number }
  | { type: 'shape'; tool: ShapeTool; anchor: SketchPoint; current: SketchPoint; snap: number; targets: SnapTargets }
  | { type: 'move'; id: string; start: SketchPoint; bounds: SketchRect; origin: SketchElement[]; snap: number; targets: SnapTargets }
  | { type: 'resize'; id: string; corner: Corner; anchor: SketchPoint; padding: number; origin: SketchElement[]; snap: number; targets: SnapTargets }
  | { type: 'text'; point: SketchPoint };

/** Where a pointer went down and what it landed on, to tell a click from a drag. */
interface PointerPress {
  start: SketchPoint;
  tap: number;
  moved: boolean;
  /** The element a click would pick with a drawing tool. */
  hit: SketchElement | null;
  hadSelection: boolean;
}

/** Freehand points closer than this to the previous one add nothing. */
const MIN_POINT_DISTANCE = 0.5;
/** Neighbours on each side that a freehand point is averaged with. */
const SMOOTHING_RADIUS = 8;
const MIN_SHAPE_SIZE = 2;

/**
 * What pointer input does to a sketch: drawing with the current tool,
 * selecting, moving, and resizing, with snapping and guides, and every finished
 * change undoable. Clicking an element with a drawing tool picks it instead of
 * drawing on it. Works in image pixels and knows nothing about the DOM.
 */
export class SketchInteraction {
  private readonly history: SketchHistory<SketchElement[]>;
  private gesture: Gesture | null = null;
  private press: PointerPress | null = null;
  /** Elements while a move or resize is in progress, before it is recorded. */
  private working: SketchElement[] | null = null;
  private guideLines: SnapGuide[] = [];
  private modifiers: PointerModifiers = {};
  private selectedId: string | null = null;
  private currentTool: SketchTool = 'pen';
  private currentStyle: SketchStyle = { color: '#e03131', strokeWidth: 4, fontSize: 24 };

  constructor(
    elements: SketchElement[],
    private readonly createId: () => string,
    private readonly image: { width: number; height: number } | null = null,
  ) {
    this.history = new SketchHistory<SketchElement[]>(elements);
  }

  get elements(): readonly SketchElement[] {
    return this.working ?? this.history.current;
  }

  /** The element being drawn right now, if any. It looks exactly as it will once finished. */
  get draft(): SketchElement | null {
    const gesture = this.gesture;
    if (gesture?.type === 'pen') return this.strokeFrom(gesture, '');
    if (gesture?.type === 'shape') return this.shapeFrom(gesture, '');
    return null;
  }

  /** Guide lines for the alignment a drag has snapped to. */
  get guides(): readonly SnapGuide[] {
    return this.guideLines;
  }

  get selected(): SketchElement | null {
    return this.elements.find((element) => element.id === this.selectedId) ?? null;
  }

  get tool(): SketchTool {
    return this.currentTool;
  }

  get style(): SketchStyle {
    return this.currentStyle;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  setTool(tool: SketchTool): void {
    this.currentTool = tool;
    this.selectedId = null;
  }

  select(id: string | null): void {
    this.selectedId = id;
  }

  /** Changes the style for new elements and applies it to the selected one. */
  setStyle(style: Partial<SketchStyle>): void {
    this.currentStyle = { ...this.currentStyle, ...style };
    const selected = this.selected;
    if (!selected) return;
    const updated = applyStyle(selected, style);
    if (JSON.stringify(updated) !== JSON.stringify(selected)) this.replace(selected.id, updated);
  }

  pointerDown(point: SketchPoint, metrics: PointerMetrics, modifiers: PointerModifiers = {}): void {
    this.modifiers = modifiers;
    this.guideLines = [];
    const tool = this.currentTool;
    const hit = tool === 'select' ? null : elementAt(this.elements, point, metrics.tolerance);
    this.press = {
      start: point,
      tap: metrics.tap,
      moved: false,
      // The text tool writes onto other elements; only texts are picked by it.
      hit: tool === 'text' && hit?.type !== 'text' ? null : hit,
      hadSelection: this.selectedId !== null,
    };
    if (tool === 'select') {
      this.startSelectGesture(point, metrics);
      return;
    }
    if (this.startSelectionGesture(point, metrics)) return;
    switch (tool) {
      case 'pen':
        this.gesture = { type: 'pen', points: [point], spacing: metrics.spacing };
        break;
      case 'text':
        this.gesture = { type: 'text', point };
        break;
      default: {
        const targets = collectSnapTargets(this.history.current, null, this.image);
        const anchor = modifiers.free ? point : snapPoint(point, targets, metrics.snap).point;
        this.gesture = { type: 'shape', tool, anchor, current: anchor, snap: metrics.snap, targets };
        break;
      }
    }
  }

  pointerMove(point: SketchPoint, modifiers: PointerModifiers = this.modifiers): void {
    this.modifiers = modifiers;
    const gesture = this.gesture;
    if (!gesture) return;
    const press = this.press;
    if (press && !press.moved && distance(press.start, point) > press.tap) {
      press.moved = true;
      if (gesture.type === 'pen' || gesture.type === 'shape') this.selectedId = null;
    }
    const clicking = press !== null && !press.moved;
    switch (gesture.type) {
      case 'pen': {
        if (distance(gesture.points[gesture.points.length - 1], point) >= MIN_POINT_DISTANCE) gesture.points.push(point);
        break;
      }
      case 'shape': {
        const placed = placeShapePoint(gesture, point, modifiers);
        gesture.current = placed.point;
        this.guideLines = placed.guides;
        break;
      }
      case 'move': {
        this.guideLines = [];
        // A click must not nudge the element onto a guide.
        if (clicking) {
          this.working = gesture.origin;
          break;
        }
        let dx = point.x - gesture.start.x;
        let dy = point.y - gesture.start.y;
        if (!modifiers.free) {
          const snapped = snapRect({ ...gesture.bounds, x: gesture.bounds.x + dx, y: gesture.bounds.y + dy }, gesture.targets, gesture.snap);
          dx += snapped.dx;
          dy += snapped.dy;
          this.guideLines = snapped.guides;
        }
        this.working = gesture.origin.map((element) => (element.id === gesture.id ? moveElement(element, dx, dy) : element));
        break;
      }
      case 'resize': {
        const reach = gesture.padding;
        let corner = {
          x: point.x + (gesture.corner.endsWith('left') ? reach : -reach),
          y: point.y + (gesture.corner.startsWith('top') ? reach : -reach),
        };
        this.guideLines = [];
        if (!modifiers.free) {
          const snapped = snapPoint(corner, gesture.targets, gesture.snap);
          corner = snapped.point;
          this.guideLines = snapped.guides;
        }
        const rect = rectFromPoints(gesture.anchor, corner);
        const target: SketchRect = { ...rect, width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
        this.working = gesture.origin.map((element) => (element.id === gesture.id ? resizeElement(element, target) : element));
        break;
      }
      case 'text':
        break;
    }
  }

  pointerUp(point: SketchPoint, modifiers: PointerModifiers = this.modifiers): InteractionRequest | null {
    this.pointerMove(point, modifiers);
    const gesture = this.gesture;
    const working = this.working;
    const press = this.press;
    this.gesture = null;
    this.working = null;
    this.press = null;
    this.guideLines = [];
    if (!gesture) return null;
    const clicked = press !== null && !press.moved;
    switch (gesture.type) {
      case 'pen':
      case 'shape': {
        // A click on an element picks it; a click beside a selection only lets go of it.
        if (clicked && press && (press.hit || press.hadSelection)) {
          this.selectedId = press.hit?.id ?? null;
          return null;
        }
        const element = gesture.type === 'pen' ? this.strokeFrom(gesture, '') : this.shapeFrom(gesture, '');
        if (gesture.type === 'pen' || isBigEnough(element)) this.commit([...this.history.current, { ...element, id: this.createId() }]);
        return null;
      }
      case 'move': {
        const element = gesture.origin.find((candidate) => candidate.id === gesture.id);
        if (clicked && this.currentTool === 'text' && element?.type === 'text') return { kind: 'edit-text', element };
        if (working && JSON.stringify(working) !== JSON.stringify(gesture.origin)) this.commit(working);
        return null;
      }
      case 'resize':
        if (working && JSON.stringify(working) !== JSON.stringify(gesture.origin)) this.commit(working);
        return null;
      case 'text': {
        const target = press?.hit;
        if (target?.type === 'text') {
          this.selectedId = target.id;
          return { kind: 'edit-text', element: target };
        }
        this.selectedId = null;
        return { kind: 'create-text', point: gesture.point };
      }
    }
  }

  cancelGesture(): void {
    this.gesture = null;
    this.press = null;
    this.working = null;
    this.guideLines = [];
  }

  addText(point: SketchPoint, text: string, size: { width: number; height: number }): void {
    if (!text.trim()) return;
    this.commit([...this.history.current, {
      id: this.createId(),
      type: 'text',
      x: point.x,
      y: point.y,
      width: size.width,
      height: size.height,
      text,
      fontSize: this.currentStyle.fontSize,
      color: this.currentStyle.color,
    }]);
  }

  /** Replaces a text's content; empty text removes it. */
  updateText(id: string, text: string, size: { width: number; height: number }): void {
    const existing = this.history.current.find((element) => element.id === id);
    if (existing?.type !== 'text') return;
    if (!text.trim()) {
      this.commit(this.history.current.filter((element) => element.id !== id));
      return;
    }
    if (existing.text === text) return;
    this.replace(id, { ...existing, text, width: size.width, height: size.height });
  }

  textAt(point: SketchPoint, tolerance: number): TextElement | null {
    const hit = elementAt(this.elements, point, tolerance);
    return hit?.type === 'text' ? hit : null;
  }

  deleteSelected(): void {
    const selected = this.selected;
    if (!selected) return;
    this.selectedId = null;
    this.commit(this.history.current.filter((element) => element.id !== selected.id));
  }

  undo(): void {
    this.cancelGesture();
    this.history.undo();
    this.dropMissingSelection();
  }

  redo(): void {
    this.cancelGesture();
    this.history.redo();
    this.dropMissingSelection();
  }

  private startSelectGesture(point: SketchPoint, metrics: PointerMetrics): void {
    const selected = this.selected;
    const corner = selected ? cornerAt(elementBounds(selected), point, metrics) : null;
    if (selected && corner) {
      this.startResize(selected, corner, metrics);
      return;
    }
    const hit = elementAt(this.elements, point, metrics.tolerance);
    this.selectedId = hit?.id ?? null;
    if (hit) this.startMove(hit, point, metrics);
  }

  /** With a drawing tool, the selected element can still be resized and moved. */
  private startSelectionGesture(point: SketchPoint, metrics: PointerMetrics): boolean {
    const selected = this.selected;
    if (!selected) return false;
    const corner = cornerAt(elementBounds(selected), point, metrics);
    if (corner) {
      this.startResize(selected, corner, metrics);
      return true;
    }
    if (!hitTest(selected, point, metrics.tolerance)) return false;
    this.startMove(selected, point, metrics);
    return true;
  }

  private startMove(element: SketchElement, point: SketchPoint, metrics: PointerMetrics): void {
    this.gesture = {
      type: 'move',
      id: element.id,
      start: point,
      bounds: elementBounds(element),
      origin: [...this.history.current],
      snap: metrics.snap,
      targets: collectSnapTargets(this.history.current, element.id, this.image),
    };
  }

  private startResize(element: SketchElement, corner: Corner, metrics: PointerMetrics): void {
    const bounds = elementBounds(element);
    this.gesture = {
      type: 'resize',
      id: element.id,
      corner,
      anchor: oppositeCorner(bounds, corner),
      padding: metrics.padding,
      origin: [...this.history.current],
      snap: metrics.snap,
      targets: collectSnapTargets(this.history.current, element.id, this.image),
    };
  }

  private strokeFrom(gesture: Extract<Gesture, { type: 'pen' }>, id: string): SketchElement {
    const smoothed = smoothStroke(gesture.points, gesture.spacing, SMOOTHING_RADIUS);
    return {
      id,
      type: 'stroke',
      points: simplifyPoints(smoothed, gesture.spacing / 4),
      color: this.currentStyle.color,
      strokeWidth: this.currentStyle.strokeWidth,
    };
  }

  private shapeFrom(gesture: Extract<Gesture, { type: 'shape' }>, id: string): SketchElement {
    const { color, strokeWidth } = this.currentStyle;
    if (gesture.tool === 'line' || gesture.tool === 'arrow') {
      return { id, type: gesture.tool, start: gesture.anchor, end: gesture.current, color, strokeWidth };
    }
    return { id, type: gesture.tool, ...rectFromPoints(gesture.anchor, gesture.current), color, strokeWidth };
  }

  private replace(id: string, updated: SketchElement): void {
    this.commit(this.history.current.map((element) => (element.id === id ? updated : element)));
  }

  private commit(elements: SketchElement[]): void {
    this.history.push(elements);
  }

  private dropMissingSelection(): void {
    if (this.selectedId && !this.history.current.some((element) => element.id === this.selectedId)) {
      this.selectedId = null;
    }
  }
}

/** Where a shape's dragged point lands: a 45° step or a square first, otherwise onto guide lines. */
function placeShapePoint(
  gesture: Extract<Gesture, { type: 'shape' }>,
  point: SketchPoint,
  modifiers: PointerModifiers,
): { point: SketchPoint; guides: SnapGuide[] } {
  if (modifiers.free) return { point, guides: [] };
  const constrained = gesture.tool === 'line' || gesture.tool === 'arrow'
    ? snapAngle(gesture.anchor, point, Boolean(modifiers.constrain))
    : snapSquare(gesture.anchor, point, Boolean(modifiers.constrain));
  if (constrained !== point) return { point: constrained, guides: [] };
  return snapPoint(point, gesture.targets, gesture.snap);
}

function applyStyle(element: SketchElement, style: Partial<SketchStyle>): SketchElement {
  const color = style.color ?? element.color;
  if (element.type === 'text') {
    const fontSize = style.fontSize ?? element.fontSize;
    const ratio = fontSize / element.fontSize;
    return { ...element, color, fontSize, width: element.width * ratio, height: element.height * ratio };
  }
  return { ...element, color, strokeWidth: style.strokeWidth ?? element.strokeWidth };
}

function isBigEnough(element: SketchElement): boolean {
  if (element.type === 'line' || element.type === 'arrow') {
    return distance(element.start, element.end) > MIN_SHAPE_SIZE;
  }
  const bounds = elementBounds(element);
  return bounds.width > MIN_SHAPE_SIZE && bounds.height > MIN_SHAPE_SIZE;
}

function distance(a: SketchPoint, b: SketchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cornerAt(bounds: SketchRect, point: SketchPoint, metrics: PointerMetrics): Corner | null {
  const { padding, handleSize } = metrics;
  const left = bounds.x - padding;
  const top = bounds.y - padding;
  const right = bounds.x + bounds.width + padding;
  const bottom = bounds.y + bounds.height + padding;
  const corners: Array<[Corner, number, number]> = [
    ['top-left', left, top],
    ['top-right', right, top],
    ['bottom-right', right, bottom],
    ['bottom-left', left, bottom],
  ];
  const half = handleSize / 2;
  for (const [corner, x, y] of corners) {
    if (Math.abs(point.x - x) <= half && Math.abs(point.y - y) <= half) return corner;
  }
  return null;
}

function oppositeCorner(bounds: SketchRect, corner: Corner): SketchPoint {
  switch (corner) {
    case 'top-left':
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
    case 'top-right':
      return { x: bounds.x, y: bounds.y + bounds.height };
    case 'bottom-right':
      return { x: bounds.x, y: bounds.y };
    case 'bottom-left':
      return { x: bounds.x + bounds.width, y: bounds.y };
  }
}
