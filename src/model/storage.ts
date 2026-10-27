import {
  createProject, normalizeEffects, normalizeSwingTemplate, PROJECT_FORMAT_VERSION,
  type Channel, type Pattern, type Project,
} from './project';
import { migrateSoundId } from '../library/instrumentRegistry';

const KEY = 'musicmaker.project.v1';

export function migrateProject(value: unknown): Project | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const p = value as Partial<Project>;
  if (!Array.isArray(p.channels) || typeof p.bpm !== 'number') return undefined;
  const normalizeChannel = (channel: Channel): Channel => ({
    ...channel,
    soundId: typeof channel.soundId === 'string' ? migrateSoundId(channel.soundId) : '',
    notes: Array.isArray(channel.notes) ? channel.notes : [],
  });
  const patterns: Pattern[] = Array.isArray(p.patterns)
    ? p.patterns.map((pattern) => ({
      ...pattern,
      channels: Array.isArray(pattern.channels) ? pattern.channels.map(normalizeChannel) : [],
      lengthSteps: Number.isFinite(pattern.lengthSteps) && pattern.lengthSteps! > 0
        ? Math.floor(pattern.lengthSteps!)
        : Math.max(1, ...((pattern.channels ?? []).map((channel) => channel.steps?.length ?? 0))),
    }))
    : [];
  return {
    ...createProject(),
    ...p,
    formatVersion: PROJECT_FORMAT_VERSION,
    channels: p.channels.map(normalizeChannel),
    customSounds: (Array.isArray(p.customSounds) ? p.customSounds : []).map((sound) => ({
      ...sound,
      id: migrateSoundId(sound.id),
    })),
    scaleRoot: Number.isInteger(p.scaleRoot) && p.scaleRoot! >= 0 && p.scaleRoot! <= 11 ? p.scaleRoot! : 0,
    scaleId: typeof p.scaleId === 'string' ? p.scaleId : 'major',
    patterns,
    arrangement: Array.isArray(p.arrangement) ? p.arrangement : [],
    effects: normalizeEffects(p.effects),
    swingTemplate: normalizeSwingTemplate(p.swingTemplate),
  };
}

export function saveProject(p: Project): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or unavailable */ }
}

export function loadProject(): Project {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrateProject(JSON.parse(raw)) ?? createProject();
  } catch { /* corrupt data: fall back */ }
  return createProject();
}
