import type { HearAsId } from './hearAs';
import {
  createProject, CURRENT_PROJECT_FORMAT_VERSION, normalizeEffects, normalizeSwingTemplate,
  type Channel, type ChordEvent, type ChordRow, type KitLane, type NoteEvent, type Pattern, type Project, type StepEventMetadata,
} from './project';
import { CHORD_ARTICULATIONS, CHORD_QUALITIES } from './music';
import type {
  AppliedSnapshot, DetectedNoteEvent, PercussionEvent, RecognitionEvent, RecognitionTake,
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
  if (metadata.generatedBy !== 'arrangement-assistant'
    || (metadata.kind !== 'chord-suggestions' && metadata.kind !== 'bass-generation'
      && metadata.kind !== 'harmony-generation' && metadata.kind !== 'accompaniment-generation'
      && metadata.kind !== 'phrase-variation')
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

function normalizeApplied(value: unknown): AppliedSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as AppliedSnapshot;
  const applied: AppliedSnapshot = {};
  if (raw.notes && typeof raw.notes === 'object') {
    applied.notes = Object.fromEntries(Object.entries(raw.notes).filter(([, key]) => typeof key === 'string'));
  }
  if (raw.groups && typeof raw.groups === 'object') {
    applied.groups = Object.fromEntries(Object.entries(raw.groups).filter(([, group]) =>
      group && typeof group.channelId === 'string' && Array.isArray(group.steps))
      .map(([key, group]) => [key, {
        channelId: group.channelId,
        steps: group.steps.map(Boolean),
        ...(group.events && typeof group.events === 'object'
          ? { events: Object.fromEntries(Object.entries(group.events).filter(([, step]) => Number.isInteger(step))) }
          : {}),
        ...(typeof group.laneId === 'string' ? { laneId: group.laneId } : {}),
      }]));
  }
  return applied.notes || applied.groups ? applied : undefined;
}

const HEAR_AS_IDS: HearAsId[] = ['piano', 'epiano', 'guitar', 'bass', 'strings', 'brass', 'synth', 'acoustic', 'classic'];

function normalizeChordEvent(event: ChordEvent): ChordEvent {
  const { strings, strumMs, humanise, capo, ...rest } = event;
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  const validStrings = Array.isArray(strings) ? strings.filter((value) => Number.isInteger(value) && value >= 1 && value <= 6) : [];
  return {
    ...rest,
    ...(validStrings.length ? { strings: validStrings } : {}),
    ...(finite(strumMs) ? { strumMs: Math.max(0, Math.min(200, strumMs)) } : {}),
    ...(finite(humanise) ? { humanise: Math.max(0, Math.min(1, humanise)) } : {}),
    ...(finite(capo) && capo > 0 ? { capo: Math.min(9, Math.round(capo)) } : {}),
  };
}

function normalizeLanes(value: unknown[], length: number): KitLane[] {
  const seen = new Set<string>();
  return value.flatMap((raw): KitLane[] => {
    if (!raw || typeof raw !== 'object') return [];
    const lane = raw as Partial<KitLane>;
    if (typeof lane.id !== 'string' || !lane.id || seen.has(lane.id) || typeof lane.soundId !== 'string') return [];
    seen.add(lane.id);
    const steps = Array.isArray(lane.steps) ? lane.steps : [];
    return [{
      id: lane.id,
      name: typeof lane.name === 'string' ? lane.name : lane.id,
      soundId: lane.soundId,
      steps: Array.from({ length }, (_, i) => steps[i] === true),
      ...(lane.mute === true ? { mute: true } : {}),
      ...(lane.stepEventMetadata && typeof lane.stepEventMetadata === 'object'
        ? { stepEventMetadata: normalizeStepEventMetadata(lane.stepEventMetadata, length) } : {}),
    }];
  });
}

function normalizeChordRow(value: unknown): ChordRow | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Partial<ChordRow>;
  if (typeof row.chords !== 'string' || typeof row.pattern !== 'string') return undefined;
  const number = (input: unknown, fallback: number, low: number, high: number) =>
    typeof input === 'number' && Number.isFinite(input) ? Math.max(low, Math.min(high, input)) : fallback;
  return {
    chords: row.chords.slice(0, 200),
    pattern: row.pattern,
    strumMs: number(row.strumMs, 30, 0, 200),
    humanise: number(row.humanise, 0.6, 0, 1),
    capo: Math.round(number(row.capo, 0, 0, 9)),
    ...(typeof row.customBar === 'string' && /^[DdUuPpxk1-6.]{16}$/.test(row.customBar) ? { customBar: row.customBar } : {}),
  };
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
      ...(normalizeApplied(take.applied) ? { applied: normalizeApplied(take.applied) } : {}),
      ...(Number.isFinite(take.alignmentSeconds) ? { alignmentSeconds: take.alignmentSeconds } : {}),
      ...(take.source === 'mic' || take.source === 'import' ? { source: take.source } : {}),
      ...(typeof take.targetChannelId === 'string' ? { targetChannelId: take.targetChannelId } : {}),
      ...(['original', 'cleaned', 'tight'].includes(take.performance ?? '') ? { performance: take.performance } : {}),
      ...(typeof take.label === 'string' && take.label.trim() ? { label: take.label.trim().slice(0, 60) } : {}),
      ...(HEAR_AS_IDS.includes(take.hearAs as HearAsId) ? { hearAs: take.hearAs } : {}),
      ...(take.kitLanes === true ? { kitLanes: true } : {}),
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
        ).map(normalizeChordEvent)
        : [],
      ...(normalizeChordRow(channel.chordRow) ? { chordRow: normalizeChordRow(channel.chordRow) } : { chordRow: undefined }),
      ...(Array.isArray(channel.lanes) ? { lanes: normalizeLanes(channel.lanes, channel.steps?.length ?? 0) } : { lanes: undefined }),
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
      arrangement: Array.isArray(p.arrangement)
        ? p.arrangement.map((clip) => {
          const { mutedChannelIds, section, ...rest } = clip;
          return {
            ...rest,
            ...(typeof section === 'string' && section ? { section: section.slice(0, 40) } : {}),
            ...(Array.isArray(mutedChannelIds) ? { mutedChannelIds: mutedChannelIds.filter((id) => typeof id === 'string') } : {}),
          };
        })
        : [],
      effects: normalizeEffects(p.effects),
      swingTemplate: normalizeSwingTemplate(p.swingTemplate),
      recognitionTakes: normalizeRecognitionTakes(p.recognitionTakes),
      seed: Number.isInteger(p.seed) && p.seed >= 0 ? p.seed : 1,
      personalInstruments: Array.isArray(p.personalInstruments)
        ? p.personalInstruments.flatMap((item) => item && typeof item.id === 'string' && /^mine-\d+$/.test(item.id) && Array.isArray(item.samples)
          ? [{
            id: item.id,
            name: typeof item.name === 'string' ? item.name.slice(0, 60) : item.id,
            samples: item.samples.filter((sample) => sample && typeof sample.sampleId === 'string'
              && Number.isInteger(sample.rootMidi) && sample.rootMidi >= 0 && sample.rootMidi <= 127)
              .map((sample) => ({ sampleId: sample.sampleId, rootMidi: sample.rootMidi })),
            ...(Array.isArray(item.chords) ? {
              chords: item.chords.filter((chord) => chord && typeof chord.sampleId === 'string' && Number.isInteger(chord.root)
                && chord.root >= 0 && chord.root <= 11 && CHORD_QUALITIES.some((quality) => quality.id === chord.quality)
                && (chord.direction === 'down' || chord.direction === 'up'))
                .map((chord) => ({ sampleId: chord.sampleId, root: chord.root, quality: chord.quality, direction: chord.direction })),
            } : {}),
            ...(typeof item.fallback === 'string' && /^[a-z0-9-]+$/.test(item.fallback) ? { fallback: item.fallback } : {}),
          }]
          : [])
        : undefined,
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
