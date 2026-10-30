import { normalizeProject } from './storage';
import type { Project } from './project';

/**
 * Named projects (File › Projects). The project being worked on still autosaves to its own slot in
 * localStorage; Save writes it under its name into this library (IndexedDB, so several projects with
 * recordings' metadata fit), Open brings one back.
 */

export interface SavedProjectEntry { id: string; name: string; updatedAt: number }
interface StoredProject extends SavedProjectEntry { json: string }

export interface ProjectLibraryBackend {
  all(): Promise<StoredProject[]>;
  get(id: string): Promise<StoredProject | undefined>;
  put(value: StoredProject): Promise<void>;
  delete(id: string): Promise<void>;
}

export const CURRENT_PROJECT_KEY = 'musicmaker.currentProjectId';

export function newProjectId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const projectJson = (p: Project) => JSON.stringify(p);

export async function listProjects(backend: ProjectLibraryBackend): Promise<SavedProjectEntry[]> {
  return (await backend.all()).map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Save under `id` (a new id when absent); returns the id and the exact JSON stored. */
export async function saveNamedProject(backend: ProjectLibraryBackend, p: Project, id = newProjectId(), now = Date.now()) {
  const json = projectJson(p);
  await backend.put({ id, name: p.name.trim() || 'Untitled', updatedAt: now, json });
  return { id, json };
}

export async function openNamedProject(backend: ProjectLibraryBackend, id: string): Promise<{ project: Project; json: string } | undefined> {
  const stored = await backend.get(id);
  const project = stored ? normalizeProject(stored.json) : undefined;
  return project ? { project, json: projectJson(project) } : undefined;
}

export const deleteNamedProject = (backend: ProjectLibraryBackend, id: string) => backend.delete(id);

/** Next free "Name 2", "Name 3"… for Save as new. */
export function copyName(name: string, taken: readonly string[]): string {
  const base = name.replace(/\s+\d+$/, '').trim() || 'Untitled';
  for (let n = 2; ; n++) if (!taken.includes(`${base} ${n}`)) return `${base} ${n}`;
}

const DB_NAME = 'musicmaker.projects';
const STORE = 'projects';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('Project storage is not available in this browser.')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? request.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Saving was cancelled (storage full?)')); };
  }));
}

export const browserProjectLibrary: ProjectLibraryBackend = {
  all: () => run('readonly', (store) => store.getAll() as IDBRequest<StoredProject[]>),
  get: (id) => run('readonly', (store) => store.get(id) as IDBRequest<StoredProject | undefined>),
  put: async (value) => { await run('readwrite', (store) => store.put(value)); },
  delete: async (id) => { await run('readwrite', (store) => store.delete(id)); },
};

export async function clearProjectLibrary(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (!('indexedDB' in globalThis)) { resolve(); return; }
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}
