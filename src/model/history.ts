/**
 * Project-level undo/redo. Snapshots are whole immutable project values; rapid edits (slider drags,
 * typing) are coalesced by committing only after the project has been idle for a moment.
 */
export class UndoHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private committed: T;

  constructor(initial: T, private readonly limit = 50) {
    this.committed = initial;
  }

  /** Record `current` as a new step if it differs from the last committed value. */
  commit(current: T): void {
    if (Object.is(current, this.committed)) return;
    this.past.push(this.committed);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.committed = current;
  }

  /** The value to restore, or undefined when there is nothing to undo. */
  undo(current: T): T | undefined {
    this.commit(current);
    const previous = this.past.pop();
    if (previous === undefined) return undefined;
    this.future.push(this.committed);
    this.committed = previous;
    return previous;
  }

  redo(current: T): T | undefined {
    if (!Object.is(current, this.committed)) {
      this.commit(current);
      return undefined;
    }
    const next = this.future.pop();
    if (next === undefined) return undefined;
    this.past.push(this.committed);
    this.committed = next;
    return next;
  }

  canUndo(current: T): boolean {
    return this.past.length > 0 || !Object.is(current, this.committed);
  }

  canRedo(current: T): boolean {
    return this.future.length > 0 && Object.is(current, this.committed);
  }
}
