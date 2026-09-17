export interface SketchLabels {
  draw: string;
  select: string;
  pen: string;
  line: string;
  arrow: string;
  rectangle: string;
  ellipse: string;
  text: string;
  color: string;
  strokeWidth: string;
  undo: string;
  redo: string;
  delete: string;
  cancel: string;
  done: string;
  saved: string;
  saveFailed: string;
  unsupported: string;
  migrated: string;
  surfaceCommand: string;
  surfaceName: string;
  resize: string;
}

const GERMAN: SketchLabels = {
  draw: 'Zeichnen',
  select: 'Auswählen (V)',
  pen: 'Stift (P)',
  line: 'Linie (L)',
  arrow: 'Pfeil (A)',
  rectangle: 'Rechteck (R)',
  ellipse: 'Ellipse (O)',
  text: 'Text (T)',
  color: 'Farbe',
  strokeWidth: 'Strichstärke',
  undo: 'Rückgängig',
  redo: 'Wiederholen',
  delete: 'Auswahl löschen',
  cancel: 'Abbrechen',
  done: 'Fertig',
  saved: 'Zeichnung gespeichert',
  saveFailed: 'Zeichnung konnte nicht gespeichert werden',
  unsupported: 'Dieses Bild kann nicht bemalt werden',
  migrated: 'Excalidraw-Bilder umgewandelt',
  surfaceCommand: 'Zeichenfläche einfügen',
  surfaceName: 'Zeichenfläche',
  resize: 'Größe ziehen',
};

const ENGLISH: SketchLabels = {
  draw: 'Draw',
  select: 'Select (V)',
  pen: 'Pen (P)',
  line: 'Line (L)',
  arrow: 'Arrow (A)',
  rectangle: 'Rectangle (R)',
  ellipse: 'Ellipse (O)',
  text: 'Text (T)',
  color: 'Colour',
  strokeWidth: 'Stroke width',
  undo: 'Undo',
  redo: 'Redo',
  delete: 'Delete selection',
  cancel: 'Cancel',
  done: 'Done',
  saved: 'Drawing saved',
  saveFailed: 'The drawing could not be saved',
  unsupported: 'This image cannot be drawn on',
  migrated: 'Excalidraw images converted',
  surfaceCommand: 'Insert drawing surface',
  surfaceName: 'Surface',
  resize: 'Drag to resize',
};

export function labelsFor(language: string): SketchLabels {
  return language.toLowerCase().startsWith('de') ? GERMAN : ENGLISH;
}
