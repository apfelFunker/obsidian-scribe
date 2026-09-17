# Scribe for Obsidian

Draw on your images without leaving your notes — and draw where there is no image at all.

Scribe adds a pen to Obsidian's own image UI. Click it and the image opens for drawing: freehand strokes, lines, arrows, rectangles, ellipses and text, with undo and redo. Everything stays editable: reopen the image a week later and move the arrow you drew.

![A drawing on an image, with the toolbar above it](docs/drawing.png)

## What it does

- **A pen on every image.** Next to *Zoom in* in the image action bar, in reading view, and in Obsidian's image viewer.
- **Surfaces: drawing without a picture.** `Cmd/Ctrl + Alt + M` puts an empty, transparent sheet at the cursor and opens it for drawing. Drag its corner to any width and height — the note keeps the size, so the shape is yours to choose.
- **Editable forever.** Strokes, shapes and text are stored inside the image file itself, so the drawing can be changed later. The picture you started from is kept, untouched, in the same file.
- **Drawing that behaves.** Freehand strokes are smoothed without rounding off your corners, lines snap to 45° steps, boxes snap to squares, and edges and centres snap to other objects with guides — hold <kbd>Shift</kbd> to force a snap, <kbd>Cmd/Ctrl</kbd> to ignore all of them.
- **Text you can come back to.** Click a text with the text tool to edit it; with any other tool a click selects what you hit instead of drawing on top of it.
- **Excalidraw annotations can move over.** A command converts images annotated with the Excalidraw plugin into Scribe drawings.

## How your drawings are stored

A drawing is written into the image as PNG chunks: `skDt` holds the editable elements, `skOr` holds the original picture. The file stays a perfectly ordinary PNG — it shows the drawing everywhere, in Obsidian, in Finder, on the web. Delete every element and save, and the original comes back unchanged.

Images that are not PNG are converted to PNG on the first save, and Obsidian updates the links for you.

## Installing

Scribe is not in the community list yet. Until then:

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/apfelFunker/obsidian-scribe/releases/latest).
2. Put them in `<your vault>/.obsidian/plugins/scribe/`.
3. Enable **Scribe** in *Settings → Community plugins*.

## Using it

| | |
| --- | --- |
| Draw on an image | Click the pen in the image's action bar, in reading view, or in the image viewer |
| New empty surface | `Cmd/Ctrl + Alt + M` |
| Resize a surface | Drag the corner grip — width and height move freely |
| Tools | <kbd>V</kbd> select, <kbd>P</kbd> pen, <kbd>L</kbd> line, <kbd>A</kbd> arrow, <kbd>R</kbd> rectangle, <kbd>O</kbd> ellipse, <kbd>T</kbd> text |
| Undo / redo | `Cmd/Ctrl + Z`, `Cmd/Ctrl + Shift + Z` |
| Leave | `Esc` keeps what you drew, *Cancel* throws it away |

## Building it yourself

```bash
npm install
npm test
node esbuild.config.mjs production
```

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/scribe/`.

## Licence

MIT — see [LICENSE](LICENSE).
