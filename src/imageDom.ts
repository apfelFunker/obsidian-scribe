const READING_ACTIONS_CLASS = 'scribe-reading-actions';

/**
 * Points every image that shows a file at its current version. Obsidian keeps
 * showing an image it has loaded even after the file changes.
 */
export function refreshImageSources(root: ParentNode, resourcePath: string, token: string): number {
  const base = resourcePath.split('?')[0];
  const source = `${resourcePath}${resourcePath.includes('?') ? '&' : '?'}sketch=${token}`;
  let updated = 0;
  root.querySelectorAll('img').forEach((image) => {
    const current = image.getAttribute('src');
    if (!current || current.split('?')[0] !== base) return;
    image.setAttribute('src', source);
    updated += 1;
  });
  return updated;
}

/**
 * Adds a draw button over an image in reading view, where Obsidian shows no
 * image actions. Clicking it does not also open the image.
 */
export function addReadingViewAction(embed: HTMLElement, label: string, onActivate: () => void): HTMLButtonElement {
  for (const child of Array.from(embed.children)) {
    const existing = child.classList.contains(READING_ACTIONS_CLASS) ? child.querySelector('button') : null;
    if (existing) return existing;
  }
  const doc = embed.ownerDocument;
  const bar = doc.createElement('div');
  bar.className = READING_ACTIONS_CLASS;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'clickable-icon scribe-reading-action';
  button.setAttribute('aria-label', label);
  for (const type of ['pointerdown', 'mousedown'] as const) {
    button.addEventListener(type, (event) => event.stopPropagation());
  }
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  });
  bar.appendChild(button);
  embed.appendChild(bar);
  return button;
}
