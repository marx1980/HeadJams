import { describe, expect, it } from 'vitest';
import { copyName, deleteNamedProject, listProjects, openNamedProject, saveNamedProject, type ProjectLibraryBackend } from './projectLibrary';
import { createProject } from './project';

function memory(): ProjectLibraryBackend {
  const map = new Map<string, Parameters<ProjectLibraryBackend['put']>[0]>();
  return {
    all: async () => [...map.values()],
    get: async (id) => map.get(id),
    put: async (value) => { map.set(value.id, value); },
    delete: async (id) => { map.delete(id); },
  };
}

describe('project library', () => {
  it('keeps several named projects, newest first, and reopens them', async () => {
    const backend = memory();
    const first = await saveNamedProject(backend, { ...createProject('Song A'), bpm: 90 }, 'a', 1);
    await saveNamedProject(backend, { ...createProject('Song B'), bpm: 140 }, 'b', 2);
    expect((await listProjects(backend)).map((entry) => entry.name)).toEqual(['Song B', 'Song A']);
    const opened = await openNamedProject(backend, 'a');
    expect(opened?.project.name).toBe('Song A');
    expect(opened?.project.bpm).toBe(90);
    expect(opened?.json).toBe(JSON.stringify(opened?.project));
    expect(first.id).toBe('a');
    await saveNamedProject(backend, { ...createProject('Song A, final'), bpm: 95 }, 'a', 3);
    expect((await listProjects(backend)).map((entry) => entry.name)).toEqual(['Song A, final', 'Song B']);
    await deleteNamedProject(backend, 'b');
    expect((await listProjects(backend)).map((entry) => entry.id)).toEqual(['a']);
    expect(await openNamedProject(backend, 'b')).toBeUndefined();
  });

  it('names copies', () => {
    expect(copyName('Song', ['Song 2'])).toBe('Song 3');
    expect(copyName('Song 2', ['Song 2'])).toBe('Song 3');
    expect(copyName('  ', [])).toBe('Untitled 2');
  });
});
