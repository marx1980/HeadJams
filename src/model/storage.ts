import { createProject, type Project } from './project';

const KEY = 'musicmaker.project.v1';

export function saveProject(p: Project): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or unavailable */ }
}

export function loadProject(): Project {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      if (p && Array.isArray(p.channels) && typeof p.bpm === 'number') return { ...createProject(), ...p, customSounds: p.customSounds ?? [] };
    }
  } catch { /* corrupt data: fall back */ }
  return createProject();
}
