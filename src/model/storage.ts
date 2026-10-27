import {
  createProject, CURRENT_PROJECT_FORMAT_VERSION, normalizeEffects, normalizeSwingTemplate,
  type Channel, type NoteEvent, type Pattern, type Project, type StepEventMetadata,
} from './project';
import { CHORD_ARTICULATIONS, CHORD_QUALITIES } from './music';

const KEY = 'musicmaker.project.v2';
const LEGACY_KEY = 'musicmaker.project.v1';

function normalizeNote(note: NoteEvent): NoteEvent {
  const confidence = Number.isFinite(note.confidence)
    ? Math.max(0, Math.min(1, note.confidence!))
    : undefined;
  const pitchBend = Array.isArray(note.pitchBend)
    ? note.pitchBend.filter((point) => point && Number.isFinite(point.time) && point.time >= 0 && Number.isFinite(point.value))
      .map((point) => ({ time: point.time, value: point.value }))
    : undefined;
  const sourceTakeId = typeof note.sourceTakeId === 'string' && note.sourceTakeId.length > 0
    ? note.sourceTakeId
    : undefined;
  return {
    ...note,
    confidence,
    ...(pitchBend === undefined ? { pitchBend: undefined } : { pitchBend }),
    sourceTakeId,
  };
}

function normalizeStepEventMetadata(value: unknown, stepCount: number): Record<number, StepEventMetadata> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([step, rawMetadata]) => {
    const index = Number(step);
    if (!Number.isInteger(index) || index < 0 || index >= stepCount || !rawMetadata || typeof rawMetadata !== 'object') return [];
    const metadata = rawMetadata as StepEventMetadata;
    const confidence = Number.isFinite(metadata.confidence)
      ? Math.max(0, Math.min(1, metadata.confidence!))
      : undefined;
    const sourceTakeId = typeof metadata.sourceTakeId === 'string' && metadata.sourceTakeId.length > 0
      ? metadata.sourceTakeId
      : undefined;
    if (confidence === undefined && sourceTakeId === undefined) return [];
    return [[index, {
      ...(confidence === undefined ? {} : { confidence }),
      ...(sourceTakeId === undefined ? {} : { sourceTakeId }),
    }]];
  }));
}

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
      notes: Array.isArray(channel.notes) ? channel.notes.map(normalizeNote) : [],
      stepEventMetadata: normalizeStepEventMetadata(channel.stepEventMetadata, channel.steps?.length ?? 0),
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
