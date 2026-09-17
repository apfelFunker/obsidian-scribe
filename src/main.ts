import type { Editor, TFile } from 'obsidian';
import { getLanguage, getLinkpath, MarkdownView, Notice, Plugin, setIcon } from 'obsidian';

import { SketchEditor } from './editor/SketchEditor';
import { withEmbedSize } from './embedSize';
import type { SketchLabels } from './i18n';
import { labelsFor } from './i18n';
import { addReadingViewAction, refreshImageSources } from './imageDom';
import { migrateExcalidrawAnnotations } from './migration/ExcalidrawMigration';
import type { SketchElement } from './sketch/elements';
import type { LoadedSketch } from './SketchStore';
import { SketchStore } from './SketchStore';

interface DrawingSession {
  editor: SketchEditor;
  lightbox: HTMLElement;
  host: HTMLElement;
  sketch: LoadedSketch;
}

/** How long to wait for Obsidian's image viewer after asking it to open. */
const LIGHTBOX_WAIT_MS = 1500;
const ADDED_CLASSES = [
  'scribe-embed-action',
  'scribe-lightbox-button',
  'scribe-reading-actions',
  'scribe-grip',
];
/** How large a new sheet is in the note, and how many pixels it really has. */
const SURFACE_SHOWN = { width: 600, height: 400 };
const SURFACE_SCALE = 2;
/** Nothing smaller than this can still be drawn on. */
const SURFACE_MIN = 80;

/** What this plugin needs from the editor underneath a note. */
interface SourceEditor {
  posAtDOM(node: Node): number;
  state: { doc: { lineAt(position: number): { from: number; to: number; text: string } } };
  dispatch(transaction: { changes: { from: number; to: number; insert: string } }): void;
}

/**
 * Adds a pen to Obsidian's image actions, to images in reading view, and to
 * the image viewer. The pen turns the viewer into a drawing surface; drawings
 * are saved into the image file.
 */
export default class ScribePlugin extends Plugin {
  private labels!: SketchLabels;
  private store!: SketchStore;
  private session: DrawingSession | null = null;
  private pendingDraw: { file: TFile; expires: number } | null = null;
  private readonly documents = new Set<Document>();
  /** Which images are empty sheets, remembered per file and change time. */
  private readonly surfaces = new Map<string, boolean>();

  async onload(): Promise<void> {
    this.labels = labelsFor(getLanguage());
    this.store = new SketchStore(this.app);
    this.app.workspace.onLayoutReady(() => this.watch(activeDocument));
    this.registerEvent(this.app.workspace.on('window-open', (workspaceWindow) => this.watch(workspaceWindow.doc)));
    this.registerEvent(this.app.workspace.on('window-close', (workspaceWindow) => {
      this.documents.delete(workspaceWindow.doc);
    }));
    this.addCommand({
      id: 'insert-surface',
      name: this.labels.surfaceCommand,
      hotkeys: [{ modifiers: ['Mod', 'Alt'], key: 'm' }],
      editorCallback: (editor, context) => void this.insertSurface(editor, context.file?.path ?? ''),
    });
    this.addCommand({
      id: 'convert-excalidraw-annotations',
      name: this.labels.migrated.replace(/ umgewandelt| converted/, ' umwandeln'),
      callback: () => void this.convertExcalidraw(),
    });
  }

  onunload(): void {
    this.closeSession(false);
    for (const doc of this.documents) {
      doc.querySelectorAll(ADDED_CLASSES.map((name) => `.${name}`).join(', ')).forEach((element) => element.remove());
    }
  }

  private watch(doc: Document): void {
    if (this.documents.has(doc)) return;
    this.documents.add(doc);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) this.decorate(node);
        });
        record.removedNodes.forEach((node) => {
          const lightbox = this.session?.lightbox;
          if (lightbox && node instanceof HTMLElement && (node === lightbox || node.contains(lightbox))) {
            // Closing the viewer keeps what was drawn.
            this.closeSession(true);
          }
        });
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    this.register(() => observer.disconnect());
    this.decorate(doc.body);
  }

  private decorate(root: HTMLElement): void {
    for (const bar of matching(root, '.image-embed .embed-actions')) this.addEmbedAction(bar);
    for (const embed of matching(root, '.markdown-source-view .image-embed')) this.addSurfaceGrip(embed);
    for (const embed of matching(root, '.markdown-reading-view .image-embed')) this.addReadingAction(embed);
    for (const lightbox of matching(root, '.lightbox')) this.addLightboxButton(lightbox);
  }

  private addEmbedAction(bar: HTMLElement): void {
    if (bar.querySelector('.scribe-embed-action')) return;
    const embed = bar.closest<HTMLElement>('.image-embed');
    if (!embed || !this.resolveEmbedFile(embed)) return;
    const action = createDiv({
      cls: 'embed-action scribe-embed-action',
      attr: { role: 'button', tabindex: '0', 'aria-label': this.labels.draw },
    });
    setIcon(action, 'pencil');
    const activate = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      const file = this.resolveEmbedFile(embed);
      const zoom = [...bar.querySelectorAll<HTMLElement>('.embed-action')].find((candidate) => candidate.querySelector('.lucide-zoom-in'));
      if (file) void this.openForDrawing(file, zoom ? () => zoom.click() : null);
    };
    action.addEventListener('click', activate);
    action.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
    bar.prepend(action);
  }

  private addReadingAction(embed: HTMLElement): void {
    const image = embed.querySelector('img');
    if (!image || !this.resolveEmbedFile(embed)) return;
    const button = addReadingViewAction(embed, this.labels.draw, () => {
      const file = this.resolveEmbedFile(embed);
      if (file) void this.openForDrawing(file, () => image.click());
    });
    if (!button.hasChildNodes()) setIcon(button, 'pencil');
  }

  private addLightboxButton(lightbox: HTMLElement): void {
    if (lightbox.hasClass('scribe-overlay') || lightbox.querySelector('.scribe-lightbox-button')) return;
    const button = lightbox.createDiv({
      cls: 'modal-close-button mod-raised clickable-icon scribe-lightbox-button',
      attr: { role: 'button', tabindex: '0', 'aria-label': this.labels.draw },
    });
    setIcon(button, 'pencil');
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const file = this.resolveLightboxFile(lightbox);
      if (file) void this.startDrawing(lightbox, file);
      else new Notice(this.labels.unsupported);
    });
    const pending = this.pendingDraw;
    if (pending && pending.expires > Date.now()) {
      this.pendingDraw = null;
      void this.startDrawing(lightbox, pending.file);
    }
  }

  /** Opens the image in Obsidian's viewer and draws there, or in a viewer of our own when that does not open. */
  private async openForDrawing(file: TFile, openViewer: (() => void) | null): Promise<void> {
    if (!openViewer) {
      await this.startDrawing(this.createOverlay(), file);
      return;
    }
    this.pendingDraw = { file, expires: Date.now() + LIGHTBOX_WAIT_MS };
    openViewer();
    window.setTimeout(() => {
      if (this.pendingDraw?.file !== file) return;
      this.pendingDraw = null;
      void this.startDrawing(this.createOverlay(), file);
    }, LIGHTBOX_WAIT_MS);
  }

  private createOverlay(): HTMLElement {
    const overlay = activeDocument.body.createDiv({ cls: 'lightbox scribe-overlay' });
    overlay.createDiv({ cls: 'lightbox-bg' });
    return overlay;
  }

  private async startDrawing(lightbox: HTMLElement, file: TFile): Promise<void> {
    if (this.session) return;
    let sketch: LoadedSketch;
    try {
      sketch = await this.store.load(file);
    } catch {
      new Notice(this.labels.unsupported);
      if (lightbox.hasClass('scribe-overlay')) lightbox.remove();
      return;
    }
    const host = lightbox.createDiv({ cls: 'scribe-host' });
    lightbox.addClass('scribe-active');
    const editor = new SketchEditor({
      host,
      background: sketch.background,
      width: sketch.width,
      height: sketch.height,
      elements: sketch.elements,
      labels: this.labels,
      surface: sketch.surface,
      onSave: async (elements) => {
        if (await this.saveDrawing(sketch, elements)) this.closeSession(false);
      },
      onCancel: () => this.closeSession(false),
      onDismiss: () => this.closeSession(true),
    });
    this.session = { editor, lightbox, host, sketch };
  }

  private async saveDrawing(sketch: LoadedSketch, elements: readonly SketchElement[]): Promise<boolean> {
    try {
      const saved = await this.store.save(sketch, elements);
      this.refreshImages(saved);
      new Notice(this.labels.saved);
      return true;
    } catch {
      new Notice(this.labels.saveFailed);
      return false;
    }
  }

  /** Obsidian keeps showing the image it loaded; point every view of the file at the saved version. */
  private refreshImages(file: TFile): void {
    const resourcePath = this.app.vault.getResourcePath(file);
    const token = String(Date.now());
    for (const doc of this.documents) refreshImageSources(doc, resourcePath, token);
  }

  private closeSession(keepChanges: boolean): void {
    const session = this.session;
    if (!session) return;
    this.session = null;
    const changed = session.editor.hasChanges;
    const elements = keepChanges && changed ? session.editor.elements : null;
    session.editor.destroy();
    session.host.remove();
    session.lightbox.removeClass('scribe-active');
    if (session.lightbox.hasClass('scribe-overlay')) session.lightbox.remove();
    else if (session.lightbox.isConnected) session.lightbox.focus();
    if (elements) {
      void this.saveDrawing(session.sketch, elements).finally(() => session.sketch.background.close());
    } else {
      session.sketch.background.close();
    }
  }

  /** Puts an empty sheet at the cursor and opens it for drawing right away. */
  private async insertSurface(editor: Editor, sourcePath: string): Promise<void> {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
    const name = `${this.labels.surfaceName} ${stamp}.png`;
    const path = await this.app.fileManager.getAvailablePathForAttachment(name, sourcePath);
    const file = await this.store.createSurface(path, SURFACE_SHOWN.width * SURFACE_SCALE, SURFACE_SHOWN.height * SURFACE_SCALE);
    const size = `${SURFACE_SHOWN.width}x${SURFACE_SHOWN.height}`;
    const link = this.app.fileManager.generateMarkdownLink(file, sourcePath, undefined, size);
    editor.replaceSelection(link.startsWith('!') ? link : `!${link}`);
    await this.openForDrawing(file, null);
  }

  /** A sheet can be dragged to any size and shape, unlike a picture. */
  private addSurfaceGrip(embed: HTMLElement): void {
    if (embed.querySelector('.scribe-grip')) return;
    const file = this.resolveEmbedFile(embed);
    if (!file) return;
    void this.isSurface(file).then((surface) => {
      if (!surface || embed.querySelector('.scribe-grip')) return;
      embed.addClass('scribe-surface');
      const grip = embed.createDiv({ cls: 'scribe-grip', attr: { 'aria-label': this.labels.resize } });
      let start: { x: number; y: number; width: number; height: number } | null = null;
      grip.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const box = embed.getBoundingClientRect();
        start = { x: event.clientX, y: event.clientY, width: box.width, height: box.height };
        try {
          grip.setPointerCapture(event.pointerId);
        } catch {
          // Capture only helps the pointer stay with the grip; dragging works without it.
        }
      });
      grip.addEventListener('pointermove', (event) => {
        if (!start) return;
        embed.setCssProps({
          width: `${Math.max(SURFACE_MIN, start.width + event.clientX - start.x)}px`,
          height: `${Math.max(SURFACE_MIN, start.height + event.clientY - start.y)}px`,
        });
      });
      grip.addEventListener('pointerup', (event) => {
        if (!start) return;
        start = null;
        try {
          grip.releasePointerCapture(event.pointerId);
        } catch {
          // Never captured, so nothing to let go of.
        }
        const box = embed.getBoundingClientRect();
        this.writeSize(embed, box.width, box.height);
      });
    });
  }

  /** Writes the new size into the note, where the embed stands. */
  private writeSize(embed: HTMLElement, width: number, height: number): void {
    let view: MarkdownView | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(embed)) view = leaf.view;
    });
    const source = (view as MarkdownView | null)?.editor as unknown as { cm?: SourceEditor } | undefined;
    const cm = source?.cm;
    if (!cm) return;
    const position = cm.posAtDOM(embed);
    const line = cm.state.doc.lineAt(position);
    for (const at of [position - line.from + 1, position - line.from + 2, 1]) {
      const updated = withEmbedSize(line.text, at, width, height);
      if (updated && updated !== line.text) {
        cm.dispatch({ changes: { from: line.from, to: line.to, insert: updated } });
        return;
      }
    }
  }

  /** Whether this image is an empty sheet rather than a picture. */
  private async isSurface(file: TFile): Promise<boolean> {
    const key = `${file.path}:${file.stat.mtime}`;
    const known = this.surfaces.get(key);
    if (known !== undefined) return known;
    let surface = false;
    try {
      const sketch = await this.store.load(file);
      surface = sketch.surface;
      sketch.background.close();
    } catch {
      surface = false;
    }
    this.surfaces.set(key, surface);
    return surface;
  }

  private resolveEmbedFile(embed: HTMLElement): TFile | null {
    const source = embed.getAttribute('src');
    if (!source) return null;
    let sourcePath = '';
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(embed)) sourcePath = leaf.view.file?.path ?? '';
    });
    const file = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(source), sourcePath);
    return file && this.store.isSketchable(file) ? file : null;
  }

  private resolveLightboxFile(lightbox: HTMLElement): TFile | null {
    const images = [...lightbox.querySelectorAll<HTMLImageElement>('.media-wrapper img')];
    const image = images.find((candidate) => !candidate.closest('.is-sliding')) ?? images[0];
    if (!image) return null;
    const source = (image.currentSrc || image.src).split('?')[0];
    for (const file of this.app.vault.getFiles()) {
      if (this.store.isSketchable(file) && this.app.vault.getResourcePath(file).split('?')[0] === source) return file;
    }
    return null;
  }

  private async convertExcalidraw(): Promise<void> {
    const report = await migrateExcalidrawAnnotations(this.app, this.store);
    new Notice(`${this.labels.migrated}: ${report.converted.length}`);
  }
}

/** The root and its descendants, plus its closest ancestor, that match a selector. */
function matching(root: HTMLElement, selector: string): Set<HTMLElement> {
  const found = new Set<HTMLElement>();
  const ancestor = root.closest<HTMLElement>(selector);
  if (ancestor) found.add(ancestor);
  root.querySelectorAll<HTMLElement>(selector).forEach((element) => found.add(element));
  return found;
}
