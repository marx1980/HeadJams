import {
  createProject, CURRENT_PROJECT_FORMAT_VERSION, normalizeEffects, normalizeSwingTemplate,
  type Channel, type Pattern, type Project,
} from './project';
import { CHORD_ARTICULATIONS, CHORD_QUALITIES } from './music';

const KEY = 'musicmaker.project.v2';
const LEGACY_KEY = 'musicmaker.project.v1';

export function saveProject(p: Project): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...p, formatVersion: CURRENT_PROJECT_FORMAT_VERSION })); } catch { /* storage full or unavailable */ }
}

function normalizeProject(raw: string): Project | undefined {
  try {
    const p = JSON.parse(raw) as Project;
    if (!p || !Array.isArray(p.channels) || typeof p.bpm !== 'number') return undefined;
    if (Number.isInteger(p.formatVersion) && p.formatVersion > CURRENT_PROJECT_FORMAT_VERSION) return undefined;
    const normalizeChannel = (channel: Channel): Channel => ({
      ...channel,
      notes: Array.isArray(channel.notes) ? channel.notes : [],
      chordEvents: Array.isArray(channel.chordEvents)
        ? channel.chordEvents.filter((event) =>
          Boolean(event && typeof event.id === 'string' && Number.isFinite(event.step)
            && Number.isFinite(event.root) && Number.isFinite(event.durationSteps)
            && CHORD_QUALITIES.some((item) => item.id === event.quality)
            && CHORD_ARTICULATIONS.some((item) => item.id === event.articulation)),
        ).map((event) => ({ ...event }))
        : [],
    });
    const patterns: Pattern[] = Array.isArray(p.patterns)
      ? p.patterns.map((pattern) => ({
        ...pattern,
        channels: Array.isArray(pattern.channels) ? pattern.channels.map(normalizeChannel) : [],
        lengthSteps: Number.isFinite(pattern.lengthSteps) && pattern.lengthSteps > 0
          ? Math.floor(pattern.lengthSteps)
          : Math.max(1, ...((pattern.channels ?? []).map((channel) => channel.steps?.length ?? 0))),
      }))
      : [];
    return {
      ...createProject(),
      ...p,
      formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
      channels: p.channels.map(normalizeChannel),
      customSounds: p.customSounds ?? [],
      scaleRoot: Number.isInteger(p.scaleRoot) && p.scaleRoot >= 0 && p.scaleRoot <= 11 ? p.scaleRoot : 0,
      scaleId: typeof p.scaleId === 'string' ? p.scaleId : 'major',
      patterns,
      arrangement: Array.isArray(p.arrangement) ? p.arrangement : [],
      effects: normalizeEffects(p.effects),
      swingTemplate: normalizeSwingTemplate(p.swingTemplate),
    };
  } catch { /* corrupt data: try the legacy key or fall back */ }
  return undefined;
}

export function loadProject(): Project {
  for (const key of [KEY, LEGACY_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const project = normalizeProject(raw);
        if (project) return project;
      }
    } catch { /* storage unavailable: try the legacy key or fall back */ }
  }
  return createProject();
}
