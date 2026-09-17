/** Undo and redo over whole snapshots, which stay small for a sketch. */
export class SketchHistory<T> {
  private states: T[];
  private index = 0;

  constructor(initial: T, private readonly limit = 200) {
    this.states = [initial];
  }

  get current(): T {
    return this.states[this.index];
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.states.length - 1;
  }

  /** Records a new state; anything that could have been redone is dropped. */
  push(state: T): void {
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(state);
    if (this.states.length > this.limit) {
      this.states.splice(0, this.states.length - this.limit);
    }
    this.index = this.states.length - 1;
  }

  undo(): T | null {
    if (!this.canUndo) return null;
    this.index -= 1;
    return this.current;
  }

  redo(): T | null {
    if (!this.canRedo) return null;
    this.index += 1;
    return this.current;
  }
}
