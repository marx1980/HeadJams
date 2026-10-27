import {
  createProject, CURRENT_PROJECT_FORMAT_VERSION, normalizeEffects, normalizeSwingTemplate,
  type Channel, type NoteEvent, type Pattern, type Project, type StepEventMetadata,
} from './project';
import { CHORD_ARTICULATIONS, CHORD_QUALITIES } from './music';
import type {
  DetectedNoteEvent, PercussionEvent, RecognitionEvent, RecognitionTake,
} from './recognition';

const KEY = 'musicmaker.project.v4';
const LEGACY_KEYS = ['musicmaker.project.v3', 'musicmaker.project.v2', 'musicmaker.project.v1'];

function normalizeNote(note: NoteEvent): NoteEvent {
  const confidence = Number.isFinite(note.confidence)
    ? Math.max(0, Math.min(1, note.confidence!))
    : undefined;
  const pitchBend = Array.isArray(note.pitchBend)
    ? note.pitchBend.filter((point) => point && Number.isFinite(point.time) && point.time >= 0 && Number.isFinite(point.value))
      .map((point) => ({ time: point.time, value: Math.max(-48, Math.min(48, point.value)) }))
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

function normalizeGeneratedMetadata(value: unknown): Channel['generatedMetadata'] {
  if (!value || typeof value !== 'object') return undefined;
  const metadata = value as Partial<NonNullable<Channel['generatedMetadata']>>;
  if (metadata.generatedBy !== 'arrangement-assistant' || metadata.kind !== 'chord-suggestions'
    || typeof metadata.sourceChannelId !== 'string' || !metadata.sourceChannelId
    || !Number.isFinite(metadata.confidence)) return undefined;
  return {
    generatedBy: metadata.generatedBy,
    kind: metadata.kind,
    sourceChannelId: metadata.sourceChannelId,
    confidence: Math.max(0, Math.min(1, metadata.confidence!)),
  };
}

function normalizeRecognitionEvents(value: unknown): RecognitionEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): RecognitionEvent[] => {
    if (!raw || typeof raw !== 'object') return [];
    const event = raw as Partial<DetectedNoteEvent & PercussionEvent>;
    if (typeof event.id !== 'string' || !Number.isFinite(event.startSeconds) || event.startSeconds! < 0) return [];
    if (typeof event.type === 'string') {
      if (!['kick', 'snare', 'closed-hat', 'open-hat', 'clap', 'tom', 'cymbal', 'bass', 'unknown'].includes(event.type)
        || !Number.isFinite(event.velocity)) return [];
      return [{
        id: event.id,
        type: event.type as PercussionEvent['type'],
        startSeconds: event.startSeconds!,
        velocity: Math.max(0, Math.min(1, event.velocity!)),
        ...(Number.isFinite(event.confidence) ? { confidence: Math.max(0, Math.min(1, event.confidence!)) } : {}),
        ...(typeof event.assignedSoundId === 'string' ? { assignedSoundId: event.assignedSoundId } : {}),
      }];
    }
    if (!Number.isFinite(event.pitch) || !Number.isFinite(event.durationSeconds)
      || event.durationSeconds! <= 0 || !Number.isFinite(event.velocity) || !Number.isFinite(event.confidence)) return [];
    const pitchBend = Array.isArray(event.pitchBend)
      ? event.pitchBend.filter((point) => point && Number.isFinite(point.time) && point.time >= 0 && Number.isFinite(point.value))
        .map((point) => ({ time: point.time, value: point.value }))
      : undefined;
    return [{
      id: event.id,
      pitch: Math.max(0, Math.min(127, Math.round(event.pitch!))),
      ...(Number.isFinite(event.rawPitch) ? { rawPitch: Math.max(0, Math.min(127, event.rawPitch!)) } : {}),
      startSeconds: event.startSeconds!,
      durationSeconds: event.durationSeconds!,
      velocity: Math.max(0, Math.min(1, event.velocity!)),
      confidence: Math.max(0, Math.min(1, event.confidence!)),
      ...(pitchBend ? { pitchBend } : {}),
    }];
  });
}

function normalizeRecognitionTakes(value: unknown): RecognitionTake[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): RecognitionTake[] => {
    if (!raw || typeof raw !== 'object') return [];
    const take = raw as Partial<RecognitionTake>;
    if (typeof take.id !== 'string' || typeof take.sourceSampleId !== 'string'
      || !['melody', 'bass', 'beat'].includes(take.mode ?? '')
      || typeof take.modelId !== 'string' || typeof take.modelVersion !== 'string'
      || !Number.isFinite(take.tempoBpm) || take.tempoBpm! < 40 || take.tempoBpm! > 240) return [];
    const quantisation = take.quantisation;
    if (!quantisation || typeof quantisation.enabled !== 'boolean'
      || !Number.isFinite(quantisation.strength)
      || !['quarter', 'eighth', 'sixteenth'].includes(quantisation.subdivision)) return [];
    return [{
      id: take.id,
      sourceSampleId: take.sourceSampleId,
      mode: take.mode!,
      modelId: take.modelId,
      modelVersion: take.modelVersion,
      createdAt: Number.isFinite(take.createdAt) ? take.createdAt! : 0,
      tempoBpm: take.tempoBpm!,
      ...(Number.isFinite(take.detectedBpm) ? { detectedBpm: take.detectedBpm } : {}),
      tempoAlternatives: Array.isArray(take.tempoAlternatives)
        ? take.tempoAlternatives.filter((bpm) => Number.isFinite(bpm) && bpm >= 40 && bpm <= 240)
        : [],
      quantisation: {
        enabled: quantisation.enabled,
        strength: Math.max(0, Math.min(1, quantisation.strength)),
        subdivision: quantisation.subdivision,
      },
      pitchCorrection: Number.isFinite(take.pitchCorrection) ? Math.max(0, Math.min(1, take.pitchCorrection!)) : 0,
      scaleAwarePitch: take.scaleAwarePitch === true,
      scaleRoot: Number.isInteger(take.scaleRoot) ? ((take.scaleRoot! % 12) + 12) % 12 : 0,
      scaleId: typeof take.scaleId === 'string' ? take.scaleId : 'major',
      transposeSemitones: Number.isFinite(take.transposeSemitones) ? Math.max(-48, Math.min(48, take.transposeSemitones!)) : 0,
      originalEvents: normalizeRecognitionEvents(take.originalEvents),
      quantisedEvents: normalizeRecognitionEvents(take.quantisedEvents),
      channelIds: Array.isArray(take.channelIds) ? take.channelIds.filter((id) => typeof id === 'string') : [],
      ...(typeof take.originalChannelId === 'string' ? { originalChannelId: take.originalChannelId } : {}),
    }];
  });
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
      generatedMetadata: normalizeGeneratedMetadata(channel.generatedMetadata),
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
      recognitionTakes: normalizeRecognitionTakes(p.recognitionTakes),
    };
  } catch { /* corrupt data: try the legacy key or fall back */ }
  return undefined;
}

export function loadProject(): Project {
  for (const key of [KEY, ...LEGACY_KEYS]) {
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
