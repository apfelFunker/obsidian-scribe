import { setIcon } from 'obsidian';

import type { SketchLabels } from '../i18n';
import type { SketchElement, SketchPoint, TextElement } from '../sketch/elements';
import { createElementId } from '../sketch/elements';
import { drawScene, HANDLE_SIZE, measureText, SELECTION_PADDING, TEXT_FONT, TEXT_LINE_HEIGHT } from '../sketch/render';
import type { PointerModifiers, SketchTool } from './SketchInteraction';
import { SketchInteraction } from './SketchInteraction';

export interface SketchEditorOptions {
  host: HTMLElement;
  background: CanvasImageSource;
  /** Image size in pixels. */
  width: number;
  height: number;
  elements: SketchElement[];
  labels: SketchLabels;
  /** A sheet with nothing behind it, so the editor shows where it is. */
  surface?: boolean;
  onSave(elements: SketchElement[]): Promise<void>;
  /** Throws the changes away. */
  onCancel(): void;
  /** Leaves drawing without choosing, e.g. with Escape. */
  onDismiss(): void;
}

const COLORS = ['#e03131', '#f08c00', '#fab005', '#2f9e44', '#1971c2', '#7048e8', '#1e1e1e', '#ffffff'];
const TOOLS: Array<{ tool: SketchTool; icon: string; label: keyof SketchLabels; key: string }> = [
  { tool: 'select', icon: 'mouse-pointer-2', label: 'select', key: 'v' },
  { tool: 'pen', icon: 'pencil', label: 'pen', key: 'p' },
  { tool: 'line', icon: 'minus', label: 'line', key: 'l' },
  { tool: 'arrow', icon: 'move-up-right', label: 'arrow', key: 'a' },
  { tool: 'rectangle', icon: 'square', label: 'rectangle', key: 'r' },
  { tool: 'ellipse', icon: 'circle', label: 'ellipse', key: 'o' },
  { tool: 'text', icon: 'type', label: 'text', key: 't' },
];
/** Screen pixels a pointer may miss a line by. */
const HIT_SLOP = 6;
/** Screen pixels within which edges and centres snap together. */
const SNAP_DISTANCE = 7;
/** Screen pixels between the points of a smoothed freehand stroke. */
const STROKE_SPACING = 1.5;
/** Screen pixels a click may wander and still pick what it landed on. */
const TAP_SLOP = 3;
const WIDTH_DOTS = [4, 7, 11];

interface TextEdit {
  point: SketchPoint;
  existing: TextElement | null;
}

/** Draws on an image inside a host element: canvas, toolbar, snapping guides, and inline text editing. */
export class SketchEditor {
  private readonly interaction: SketchInteraction;
  private readonly rootEl: HTMLElement;
  private readonly stageEl: HTMLElement;
  private readonly canvasEl: HTMLCanvasElement;
  private readonly textInputEl: HTMLTextAreaElement;
  private readonly toolButtons = new Map<SketchTool, HTMLButtonElement>();
  private readonly colorButtons = new Map<string, HTMLButtonElement>();
  private readonly widthButtons = new Map<number, HTMLButtonElement>();
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly doneButton: HTMLButtonElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly widths: number[];
  private scale = 1;
  private frame: number | null = null;
  private textEdit: TextEdit | null = null;
  private activePointerId: number | null = null;
  private lastPointer: SketchPoint | null = null;
  private saving = false;

  constructor(private readonly options: SketchEditorOptions) {
    const longest = Math.max(options.width, options.height);
    const base = Math.max(2, Math.round(longest / 400));
    this.widths = [base, base * 2, base * 4];
    this.interaction = new SketchInteraction(options.elements, createElementId, { width: options.width, height: options.height });
    this.interaction.setStyle({ strokeWidth: this.widths[1], fontSize: Math.max(16, Math.round(longest / 30)) });

    const { labels } = options;
    this.rootEl = options.host.createDiv({ cls: 'scribe-editor' });
    const toolbarEl = this.rootEl.createDiv({ cls: 'scribe-toolbar', attr: { role: 'toolbar' } });
    this.stageEl = this.rootEl.createDiv({ cls: 'scribe-stage' });
    if (options.surface) this.stageEl.addClass('is-surface');
    this.canvasEl = this.stageEl.createEl('canvas', { cls: 'scribe-canvas' });
    this.textInputEl = this.stageEl.createEl('textarea', { cls: 'scribe-text-input' });
    this.textInputEl.hidden = true;

    const toolsEl = toolbarEl.createDiv({ cls: 'scribe-group' });
    for (const { tool, icon, label } of TOOLS) {
      this.toolButtons.set(tool, this.iconButton(toolsEl, icon, labels[label], () => this.setTool(tool)));
    }
    divider(toolbarEl);
    const colorsEl = toolbarEl.createDiv({ cls: 'scribe-group', attr: { role: 'group', 'aria-label': labels.color } });
    for (const color of COLORS) {
      const button = colorsEl.createEl('button', {
        cls: 'scribe-swatch',
        attr: { type: 'button', 'aria-label': `${labels.color} ${color}`, title: color },
      });
      button.createSpan({ cls: 'scribe-swatch-dot' }).setCssProps({ '--scribe-swatch': color });
      button.addEventListener('click', () => this.applyStyle({ color }));
      this.colorButtons.set(color, button);
    }
    divider(toolbarEl);
    const widthsEl = toolbarEl.createDiv({ cls: 'scribe-group', attr: { role: 'group', 'aria-label': labels.strokeWidth } });
    this.widths.forEach((width, index) => {
      const button = widthsEl.createEl('button', {
        cls: 'scribe-button',
        attr: { type: 'button', 'aria-label': `${labels.strokeWidth} ${index + 1}`, title: `${labels.strokeWidth} ${index + 1}` },
      });
      button.createSpan({ cls: 'scribe-width-dot' }).setCssProps({ '--scribe-dot': `${WIDTH_DOTS[index]}px` });
      button.addEventListener('click', () => this.applyStyle({ strokeWidth: width }));
      this.widthButtons.set(width, button);
    });
    divider(toolbarEl);
    const historyEl = toolbarEl.createDiv({ cls: 'scribe-group' });
    this.undoButton = this.iconButton(historyEl, 'undo-2', labels.undo, () => this.run(() => this.interaction.undo()));
    this.redoButton = this.iconButton(historyEl, 'redo-2', labels.redo, () => this.run(() => this.interaction.redo()));
    this.deleteButton = this.iconButton(historyEl, 'trash-2', labels.delete, () => this.run(() => this.interaction.deleteSelected()));
    divider(toolbarEl);
    const actionsEl = toolbarEl.createDiv({ cls: 'scribe-group' });
    const cancelButton = actionsEl.createEl('button', { cls: 'scribe-cancel', text: labels.cancel, attr: { type: 'button' } });
    cancelButton.addEventListener('click', () => options.onCancel());
    this.doneButton = actionsEl.createEl('button', { cls: 'scribe-done', text: labels.done, attr: { type: 'button' } });
    this.doneButton.addEventListener('click', () => void this.save());

    this.canvasEl.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvasEl.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvasEl.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvasEl.addEventListener('pointercancel', () => {
      this.activePointerId = null;
      this.run(() => this.interaction.cancelGesture());
    });
    this.canvasEl.addEventListener('dblclick', (event) => this.onDoubleClick(event));
    this.textInputEl.addEventListener('keydown', (event) => this.onTextKey(event));
    this.textInputEl.addEventListener('input', () => this.fitTextInput());
    this.textInputEl.addEventListener('blur', () => this.commitText());
    // The image viewer underneath reacts to keys, clicks, and drags; the editor owns them while open.
    for (const type of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'click', 'wheel'] as const) {
      this.rootEl.addEventListener(type, (event) => event.stopPropagation());
    }
    this.rootEl.addEventListener('keydown', (event) => this.onKey(event));
    this.rootEl.addEventListener('keyup', (event) => this.onModifierChange(event));
    this.rootEl.tabIndex = -1;

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.stageEl);
    this.setTool('pen');
    this.layout();
    this.rootEl.focus();
  }

  get hasChanges(): boolean {
    return this.interaction.canUndo;
  }

  get elements(): SketchElement[] {
    this.commitText();
    return [...this.interaction.elements];
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    if (this.frame !== null) this.rootEl.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
    this.rootEl.remove();
  }

  async save(): Promise<void> {
    if (this.saving) return;
    const elements = this.elements;
    this.saving = true;
    this.doneButton.disabled = true;
    try {
      await this.options.onSave(elements);
    } finally {
      this.saving = false;
      this.doneButton.disabled = false;
    }
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const button = parent.createEl('button', { cls: 'scribe-button', attr: { type: 'button', 'aria-label': label, title: label } });
    setIcon(button, icon);
    button.addEventListener('click', onClick);
    return button;
  }

  private setTool(tool: SketchTool): void {
    this.commitText();
    this.interaction.setTool(tool);
    this.canvasEl.dataset.tool = tool;
    this.refresh();
  }

  private applyStyle(style: { color?: string; strokeWidth?: number }): void {
    this.interaction.setStyle(style);
    this.refresh();
  }

  private run(action: () => void): void {
    action();
    this.refresh();
  }

  private layout(): void {
    const { width, height } = this.options;
    const available = this.stageEl.getBoundingClientRect();
    if (available.width <= 0 || available.height <= 0) return;
    this.scale = Math.min(available.width / width, available.height / height);
    const cssWidth = Math.floor(width * this.scale);
    const cssHeight = Math.floor(height * this.scale);
    const ratio = this.rootEl.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    this.canvasEl.setCssProps({ width: `${cssWidth}px`, height: `${cssHeight}px` });
    this.canvasEl.width = Math.max(1, Math.round(cssWidth * ratio));
    this.canvasEl.height = Math.max(1, Math.round(cssHeight * ratio));
    this.refresh();
  }

  /** Renders now, or on the next frame while a pointer is drawing so its moves coalesce. */
  private refresh(): void {
    if (this.activePointerId === null) {
      this.render();
      return;
    }
    const view = this.rootEl.ownerDocument.defaultView;
    if (!view || this.frame !== null) return;
    this.frame = view.requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  private render(): void {
    const context = this.canvasEl.getContext('2d');
    if (!context) return;
    const editing = this.textEdit?.existing?.id;
    const elements = this.interaction.elements.filter((element) => element.id !== editing);
    const draft = this.interaction.draft;
    const selected = this.interaction.selected;
    const accent = getComputedStyle(this.rootEl).getPropertyValue('--interactive-accent').trim() || '#7c3aed';
    drawScene(
      context,
      { background: this.options.background, width: this.options.width, height: this.options.height, elements: draft ? [...elements, draft] : elements },
      this.canvasEl.width / this.options.width,
      1 / this.scale,
      selected && selected.id !== editing ? { element: selected, accent } : null,
      this.interaction.guides,
    );
    for (const [tool, button] of this.toolButtons) button.toggleClass('is-active', tool === this.interaction.tool);
    for (const [color, button] of this.colorButtons) button.toggleClass('is-active', color === this.interaction.style.color);
    for (const [width, button] of this.widthButtons) button.toggleClass('is-active', width === this.interaction.style.strokeWidth);
    this.undoButton.disabled = !this.interaction.canUndo;
    this.redoButton.disabled = !this.interaction.canRedo;
    this.deleteButton.disabled = !selected;
  }

  private toImage(event: MouseEvent): SketchPoint {
    const rect = this.canvasEl.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / this.scale, y: (event.clientY - rect.top) / this.scale };
  }

  private modifiersOf(event: MouseEvent | KeyboardEvent): PointerModifiers {
    return { constrain: event.shiftKey, free: event.metaKey || event.ctrlKey };
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.textEdit) {
      this.commitText();
      if (event.button !== 0) return;
    }
    this.activePointerId = event.pointerId;
    try {
      this.canvasEl.setPointerCapture(event.pointerId);
    } catch {
      // Capture only keeps the gesture when the pointer leaves the canvas; drawing works without it.
    }
    this.lastPointer = this.toImage(event);
    this.interaction.pointerDown(this.lastPointer, {
      tolerance: HIT_SLOP / this.scale,
      handleSize: (HANDLE_SIZE + HIT_SLOP) / this.scale,
      padding: SELECTION_PADDING / this.scale,
      snap: SNAP_DISTANCE / this.scale,
      spacing: STROKE_SPACING / this.scale,
      tap: TAP_SLOP / this.scale,
    }, this.modifiersOf(event));
    this.refresh();
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return;
    const modifiers = this.modifiersOf(event);
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const sample of coalesced.length > 0 ? coalesced : [event]) {
      this.lastPointer = this.toImage(sample);
      this.interaction.pointerMove(this.lastPointer, modifiers);
    }
    this.refresh();
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.lastPointer = null;
    if (this.canvasEl.hasPointerCapture(event.pointerId)) this.canvasEl.releasePointerCapture(event.pointerId);
    const request = this.interaction.pointerUp(this.toImage(event), this.modifiersOf(event));
    if (request?.kind === 'create-text') this.openTextInput({ point: request.point, existing: null });
    if (request?.kind === 'edit-text') this.openTextInput({ point: { x: request.element.x, y: request.element.y }, existing: request.element });
    this.refresh();
  }

  /** Shift and Cmd change snapping mid-drag without moving the pointer. */
  private onModifierChange(event: KeyboardEvent): void {
    if (this.activePointerId === null || !this.lastPointer || !['Shift', 'Meta', 'Control'].includes(event.key)) return;
    this.interaction.pointerMove(this.lastPointer, this.modifiersOf(event));
    this.refresh();
  }

  private onDoubleClick(event: MouseEvent): void {
    const text = this.interaction.textAt(this.toImage(event), HIT_SLOP / this.scale);
    if (!text || this.textEdit?.existing?.id === text.id) return;
    this.commitText();
    this.interaction.select(text.id);
    this.openTextInput({ point: { x: text.x, y: text.y }, existing: text });
  }

  private openTextInput(edit: TextEdit): void {
    this.textEdit = edit;
    const fontSize = edit.existing?.fontSize ?? this.interaction.style.fontSize;
    const color = edit.existing?.color ?? this.interaction.style.color;
    const canvasRect = this.canvasEl.getBoundingClientRect();
    const stageRect = this.stageEl.getBoundingClientRect();
    const input = this.textInputEl;
    input.value = edit.existing?.text ?? '';
    input.setCssProps({
      left: `${canvasRect.left - stageRect.left + edit.point.x * this.scale}px`,
      top: `${canvasRect.top - stageRect.top + edit.point.y * this.scale}px`,
      font: `${fontSize * this.scale}px ${TEXT_FONT}`,
      'line-height': String(TEXT_LINE_HEIGHT),
      color,
    });
    input.hidden = false;
    this.fitTextInput();
    this.refresh();
    this.rootEl.ownerDocument.defaultView?.requestAnimationFrame(() => input.focus());
  }

  private fitTextInput(): void {
    const input = this.textInputEl;
    const lines = input.value.split('\n');
    input.rows = Math.max(1, lines.length);
    input.setCssProps({ width: `${Math.max(4, ...lines.map((line) => line.length)) + 1}ch` });
  }

  private commitText(): void {
    const edit = this.textEdit;
    if (!edit) return;
    this.textEdit = null;
    const text = this.textInputEl.value.replace(/\s+$/, '');
    this.textInputEl.hidden = true;
    const context = this.canvasEl.getContext('2d');
    const fontSize = edit.existing?.fontSize ?? this.interaction.style.fontSize;
    const size = context ? measureText(context, text, fontSize) : { width: text.length * fontSize * 0.6, height: fontSize * TEXT_LINE_HEIGHT };
    if (edit.existing) this.interaction.updateText(edit.existing.id, text, size);
    else this.interaction.addText(edit.point, text, size);
    this.refresh();
  }

  private onTextKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.textInputEl.value = this.textEdit?.existing?.text ?? '';
      this.commitText();
      this.rootEl.focus();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.commitText();
      this.rootEl.focus();
    }
  }

  private onKey(event: KeyboardEvent): void {
    if (this.textEdit) return;
    this.onModifierChange(event);
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (command && key === 'z') {
      event.preventDefault();
      this.run(() => (event.shiftKey ? this.interaction.redo() : this.interaction.undo()));
    } else if (command && key === 'y') {
      event.preventDefault();
      this.run(() => this.interaction.redo());
    } else if (key === 'backspace' || key === 'delete') {
      event.preventDefault();
      this.run(() => this.interaction.deleteSelected());
    } else if (key === 'escape') {
      event.preventDefault();
      if (this.interaction.selected) this.run(() => this.interaction.select(null));
      else this.options.onDismiss();
    } else if (!command && !event.altKey) {
      const shortcut = TOOLS.find((entry) => entry.key === key);
      if (shortcut) {
        event.preventDefault();
        this.setTool(shortcut.tool);
      }
    }
  }
}

function divider(parent: HTMLElement): void {
  parent.createDiv({ cls: 'scribe-divider', attr: { 'aria-hidden': 'true' } });
}
