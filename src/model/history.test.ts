import { describe, expect, it } from 'vitest';
import { UndoHistory } from './history';

describe('UndoHistory', () => {
  it('undoes and redoes committed steps, including an uncommitted latest change', () => {
    const h = new UndoHistory('a');
    h.commit('b');
    expect(h.undo('c')).toBe('b'); // "c" was pending; undo commits it first, then steps back
    expect(h.undo('b')).toBe('a');
    expect(h.undo('a')).toBeUndefined();
    expect(h.redo('a')).toBe('b');
    expect(h.redo('b')).toBe('c');
    expect(h.canRedo('c')).toBe(false);
  });

  it('drops the redo branch when a new change is made after undo', () => {
    const h = new UndoHistory(1);
    h.commit(2);
    expect(h.undo(2)).toBe(1);
    h.commit(5);
    expect(h.canRedo(5)).toBe(false);
    expect(h.undo(5)).toBe(1);
  });

  it('caps the number of stored steps', () => {
    const h = new UndoHistory(0, 3);
    for (let i = 1; i <= 10; i++) h.commit(i);
    let steps = 0;
    for (let value: number | undefined = 10; (value = h.undo(value ?? 0)) !== undefined;) steps++;
    expect(steps).toBe(3);
  });

  it('treats an unchanged value as nothing to record', () => {
    const value = { x: 1 };
    const h = new UndoHistory(value);
    h.commit(value);
    expect(h.canUndo(value)).toBe(false);
  });
});
