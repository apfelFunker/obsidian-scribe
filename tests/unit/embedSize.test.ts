import { embedAt, withEmbedSize } from '@/embedSize';

describe('embedAt', () => {
  it('finds the embed the cursor sits in, and nothing outside one', () => {
    const line = 'Davor ![[Fläche.png|300x200]] dahinter';

    expect(embedAt(line, 12)).toEqual({ start: 6, end: 29, target: 'Fläche.png', size: '300x200' });
    expect(embedAt(line, 2)).toBeNull();
    expect(embedAt(line, line.length)).toBeNull();
  });

  it('reads a markdown embed as well as a wiki embed', () => {
    expect(embedAt('![Fläche|300x200](Fläche.png)', 5)).toEqual({
      start: 0,
      end: 29,
      target: 'Fläche.png',
      size: '300x200',
    });
  });
});

describe('withEmbedSize', () => {
  it('writes width and height into the embed under the cursor', () => {
    expect(withEmbedSize('![[Fläche.png]]', 5, 600, 400)).toBe('![[Fläche.png|600x400]]');
    expect(withEmbedSize('![[Fläche.png|300]]', 5, 600, 400)).toBe('![[Fläche.png|600x400]]');
    expect(withEmbedSize('![[Fläche.png|300x200]]', 5, 600, 400)).toBe('![[Fläche.png|600x400]]');
    expect(withEmbedSize('![Fläche|300x200](Fläche.png)', 5, 600, 400)).toBe('![Fläche|600x400](Fläche.png)');
  });

  it('leaves the other embeds on the line alone', () => {
    const line = '![[a.png|100x100]] und ![[b.png|100x100]]';

    expect(withEmbedSize(line, 30, 600, 400)).toBe('![[a.png|100x100]] und ![[b.png|600x400]]');
  });

  it('keeps everything else about the embed, and gives up when there is none', () => {
    expect(withEmbedSize('![[Bilder/Fläche.png|links|300]]', 8, 600, 400)).toBe('![[Bilder/Fläche.png|links|600x400]]');
    expect(withEmbedSize('nur Text', 3, 600, 400)).toBeNull();
  });

  it('rounds to whole pixels, because that is what the note keeps', () => {
    expect(withEmbedSize('![[Fläche.png]]', 5, 600.4, 399.6)).toBe('![[Fläche.png|600x400]]');
  });
});
