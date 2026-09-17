import { SketchHistory } from '@/sketch/history';

describe('SketchHistory', () => {
  it('steps back and forward through recorded states and forgets redo after a new change', () => {
    const history = new SketchHistory<string[]>([]);

    history.push(['a']);
    history.push(['a', 'b']);
    expect(history.undo()).toEqual(['a']);
    expect(history.undo()).toEqual([]);
    expect(history.canUndo).toBe(false);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toEqual(['a']);
    expect(history.canRedo).toBe(true);

    history.push(['a', 'c']);
    expect(history.canRedo).toBe(false);
    expect(history.redo()).toBeNull();
    expect(history.current).toEqual(['a', 'c']);
  });

  it('keeps only the most recent states when it reaches its limit', () => {
    const history = new SketchHistory<number>(0, 3);

    for (let value = 1; value <= 5; value += 1) history.push(value);

    expect(history.undo()).toBe(4);
    expect(history.undo()).toBe(3);
    expect(history.undo()).toBeNull();
    expect(history.current).toBe(3);
  });
});
