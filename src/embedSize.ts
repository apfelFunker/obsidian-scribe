export interface FoundEmbed {
  /** Where the embed starts and ends in the line. */
  start: number;
  end: number;
  /** The file the embed points at. */
  target: string;
  /** The size written in the embed, if it has one. */
  size: string | null;
}

const WIKI = /!\[\[([^\]]+)\]\]/g;
const MARKDOWN = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const SIZE = /^\d+(x\d+)?$/;

/** The embed that contains this place in the line, or null. */
export function embedAt(line: string, at: number): FoundEmbed | null {
  for (const pattern of [WIKI, MARKDOWN]) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
      const start = match.index;
      const end = start + match[0].length;
      if (at <= start || at >= end) continue;
      const wiki = pattern === WIKI;
      const parts = (wiki ? match[1] : match[1]).split('|');
      const size = parts.slice(1).find((part) => SIZE.test(part)) ?? null;
      return { start, end, target: wiki ? parts[0] : match[2], size };
    }
  }
  return null;
}

/** The line with the embed under the cursor set to this size; null when there is none. */
export function withEmbedSize(line: string, at: number, width: number, height: number): string | null {
  const embed = embedAt(line, at);
  if (!embed) return null;
  const size = `${Math.round(width)}x${Math.round(height)}`;
  const text = line.slice(embed.start, embed.end);
  const inner = text.startsWith('![[')
    ? text.slice(3, -2)
    : text.slice(2, text.indexOf(']'));
  const parts = inner.split('|');
  const kept = [parts[0], ...parts.slice(1).filter((part) => !SIZE.test(part))];
  const replaced = [...kept, size].join('|');
  const rebuilt = text.startsWith('![[')
    ? `![[${replaced}]]`
    : `![${replaced}](${text.slice(text.indexOf('](') + 2, -1)})`;
  return line.slice(0, embed.start) + rebuilt + line.slice(embed.end);
}
