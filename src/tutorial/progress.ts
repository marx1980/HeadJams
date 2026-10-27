import { findTutorial, type Workflow } from './tutorials';

export const DONE_KEY = 'musicmaker.tutorialDone';

export function loadDone(storage: Pick<Storage, 'getItem'> = localStorage): ReadonlySet<string> {
  try {
    const raw = JSON.parse(storage.getItem(DONE_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveDone(done: ReadonlySet<string>, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(DONE_KEY, JSON.stringify([...done])); } catch { /* storage unavailable */ }
}

export function workflowProgress(w: Workflow, done: ReadonlySet<string>): { completed: number; total: number; nextId?: string } {
  const ids = w.tutorialIds.filter((id) => findTutorial(id));
  const completed = ids.filter((id) => done.has(id)).length;
  return { completed, total: ids.length, nextId: ids.find((id) => !done.has(id)) };
}
