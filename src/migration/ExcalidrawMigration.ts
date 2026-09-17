import type { App, TFile } from 'obsidian';

import { embedSketch } from '../png/sketchFile';
import type { SketchStore } from '../SketchStore';
import { renderPng, toArrayBuffer } from '../SketchStore';
import { parseExcalidrawAnnotation } from './excalidraw';

export interface MigrationReport {
  converted: string[];
  skipped: string[];
}

/**
 * Replaces embeds of Excalidraw drawings that annotate one image with normal
 * images: the drawing is burned into a new PNG that keeps it editable, or the
 * embed points at the image itself when nothing was drawn. Drawing files stay.
 */
export async function migrateExcalidrawAnnotations(app: App, store: SketchStore): Promise<MigrationReport> {
  const report: MigrationReport = { converted: [], skipped: [] };
  const drawings = app.vault.getMarkdownFiles().filter((file) => (
    app.metadataCache.getFileCache(file)?.frontmatter?.['excalidraw-plugin'] !== undefined
  ));
  for (const drawing of drawings) {
    const embeddingNotes = notesEmbedding(app, drawing);
    if (embeddingNotes.length === 0) continue;
    const source = await app.vault.read(drawing);
    const links = [...source.matchAll(/^[\w-]+: \[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gm)].map((match) => match[1]);
    const images = new Map<string, { file: TFile; bitmap: ImageBitmap; bytes: Uint8Array }>();
    for (const link of links) {
      const file = app.metadataCache.getFirstLinkpathDest(link, drawing.path);
      if (!file || !store.isSketchable(file)) continue;
      const bytes = new Uint8Array(await app.vault.readBinary(file));
      images.set(link, { file, bytes, bitmap: await createImageBitmap(new Blob([toArrayBuffer(bytes)])) });
    }
    const annotation = parseExcalidrawAnnotation(source, (link) => {
      const image = images.get(link);
      return image ? { width: image.bitmap.width, height: image.bitmap.height } : null;
    });
    const image = annotation ? images.get(annotation.imageLink) : undefined;
    if (!annotation || !image) {
      report.skipped.push(drawing.path);
      continue;
    }
    let target = image.file;
    if (annotation.document.elements.length > 0) {
      const folder = image.file.parent?.path;
      const path = store.availablePath(`${folder && folder !== '/' ? `${folder}/` : ''}${drawing.basename}.png`);
      const rendered = await renderPng(image.bitmap, image.bitmap.width, image.bitmap.height, annotation.document.elements);
      const data = embedSketch(rendered, {
        document: annotation.document,
        original: { mimeType: `image/${image.file.extension.toLowerCase() === 'jpg' ? 'jpeg' : image.file.extension.toLowerCase()}`, bytes: image.bytes },
      });
      target = await app.vault.createBinary(path, toArrayBuffer(data));
    }
    for (const bitmap of images.values()) bitmap.bitmap.close();
    for (const note of embeddingNotes) {
      await app.vault.process(note, (content) => content.replace(
        /!\[\[([^\]|#]+?)(\.md)?(#[^\]|]*)?(\|[^\]]*)?\]\]/g,
        (whole: string, linkpath: string, _extension: string | undefined, _subpath: string | undefined, alias: string | undefined) => {
          const resolved = app.metadataCache.getFirstLinkpathDest(linkpath, note.path);
          if (resolved?.path !== drawing.path) return whole;
          return `![[${app.metadataCache.fileToLinktext(target, note.path, false)}${alias ?? ''}]]`;
        },
      ));
    }
    report.converted.push(drawing.path);
  }
  return report;
}

function notesEmbedding(app: App, drawing: TFile): TFile[] {
  const notes: TFile[] = [];
  for (const [sourcePath, links] of Object.entries(app.metadataCache.resolvedLinks)) {
    if (sourcePath === drawing.path || !links[drawing.path]) continue;
    const note = app.vault.getFileByPath(sourcePath);
    if (note?.extension === 'md') notes.push(note);
  }
  return notes;
}
