# Changelog

## 0.1.0

The first release.

- A pen in Obsidian's image actions, on images in reading view, and in the image viewer. It opens an editor for freehand strokes, lines, arrows, rectangles, ellipses and text, with undo and redo.
- Drawings are stored inside the image file and stay editable. The original picture is kept in the same file and comes back when every element is removed.
- Surfaces: `Cmd/Ctrl + Ctrl + M` puts an empty, transparent sheet at the cursor and opens it for drawing. Its corner takes any shape while the sheet is empty, and scales proportionally once something is drawn on it.
- Freehand strokes are smoothed without losing their corners; lines snap to 45°, boxes to squares, and edges and centres to other objects, with guides.
- A command converts images annotated with the Excalidraw plugin.
