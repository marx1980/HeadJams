import type { ChordArticulation, ChordQuality } from './music';
import type { RecognitionTake } from './recognition';

export type NoteLength = 4 | 8 | 16;
export type LoopBars = 1 | 2 | 4;
export type Wave = 'sine' | 'square' | 'saw' | 'triangle' | 'noise';
export const SWING_TEMPLATES = [
  { id: 'straight', label: 'Straight', amount: 0 },
  { id: 'light', label: 'Light swing', amount: 0.1 },
  { id: 'medium', label: 'Medium swing', amount: 0.2 },
  { id: 'triplet', label: 'Triplet swing', amount: 1 / 3 },
] as const;
export type SwingTemplate = (typeof SWING_TEMPLATES)[number]['id'];

export interface SynthParams {
  wave: Wave;
  freq: number;
  freqEnd: number;
  decay: number;
  cutoff: number;
}

export type SoundType = 'pitched' | 'chord' | 'percussion' | 'kit';
export type PlaybackMode = 'notes' | 'chord' | 'one-shot' | 'kit';
export type DrumRole = 'kick' | 'snare' | 'hat' | 'tom' | 'cymbal' | 'clap' | 'hand-percussion' | 'shaker' | 'auxiliary';

export interface SoundDef {
  id: string;
  name: string;
  category: string;
  params: SynthParams;
  sampleId?: string;
  sampleVersion?: 'processed' | 'original';
  tags?: string[];
  subcategory?: string;
  type?: SoundType;
  playbackMode?: PlaybackMode;
  assetSource?: 'procedural' | 'user-sample';
  assetAttribution?: string;
  assetLicense?: string;
  /** Sampled instrument (manifest id under public/instruments). Takes precedence over params. */
  instrumentId?: string;
  /** MIDI note a grid hit plays on a sampled instrument (default 60). */
  instrumentNote?: number;
  /** Preferred articulation on a sampled instrument. */
  instrumentArticulation?: string;
  /** MIDI velocity (1–127) for grid hits on a sampled instrument (default 100). */
  instrumentVelocity?: number;
  /** Recorded-chord sound: the personal instrument holding whole-chord recordings (E7); `instrumentId` is the guitar for the rest. */
  recordedChordsId?: string;
  /** Sampled chord sounds: 'natural' lets strings a new chord does not play keep ringing; 'tight' stops the whole chord. */
  chordRing?: 'natural' | 'tight';
}

export interface Channel {
  id: string;
  name: string;
  soundId: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  steps: boolean[];
  notes: NoteEvent[];
  stepEventMetadata?: Record<number, StepEventMetadata>;
  chordEvents?: ChordEvent[];
  /** Chord row that generated this channel's `row-` chord events (guitar channels). */
  chordRow?: ChordRow;
  /** Kit channel: the whole kit as lanes on one channel. Its own `steps` stay empty. */
  lanes?: KitLane[];
  /** The recording a hummed or beatboxed track came from, and where it starts in the loop. */
  original?: { soundId: string; offsetSec: number };
  /** Play the original recording along with the track ("play what I sang"). */
  playOriginal?: boolean;
  generatedMetadata?: GeneratedTrackMetadata;
  kitId?: string;
  role?: DrumRole;
  /** Grid steps (and kit lanes) repeat every this many steps instead of the whole loop; steps beyond it are kept but not played. */
  lengthSteps?: number;
  /** Steps per bar the grid shows for this track (a coarser view of the project grid; display only). */
  viewSteps?: NoteLength;
  /** Play the notes as phrased lines (legato, dynamics, vibrato) in this feel; off when undefined. */
  phrasing?: PhrasingStyle;
  /** Per-track room (reverb send), 0–1; none when undefined. */
  room?: number;
}

export interface GeneratedTrackMetadata {
  generatedBy: 'arrangement-assistant';
  kind: 'chord-suggestions' | 'bass-generation' | 'harmony-generation' | 'accompaniment-generation' | 'phrase-variation';
  sourceChannelId: string;
  confidence: number;
}

export interface NoteEvent {
  id: string;
  step: number;
  pitch: number;
  durationSteps: number;
  velocity?: number;
  confidence?: number;
  pitchBend?: PitchBendPoint[];
  /** How the note was sung (hummed takes): pitch offset in semitones and level relative to the note's median, over time. */
  sung?: SungContour;
  sourceTakeId?: string;
}

export type PhrasingStyle = 'natural' | 'expressive' | 'jazz' | 'classical' | 'pop';

export interface SungContour {
  pitch: PitchBendPoint[];
  level: PitchBendPoint[];
}

export interface PitchBendPoint {
  time: number;
  value: number;
}

export interface StepEventMetadata {
  confidence?: number;
  sourceTakeId?: string;
}

export interface ChordEvent {
  id: string;
  step: number;
  root: number;
  quality: ChordQuality;
  articulation: ChordArticulation;
  durationSteps: number;
  velocity?: number;
  /** Play only these strings of the shape (1 = lowest sounding string), e.g. for arpeggios. */
  strings?: number[];
  /** Strum length from first to last string, in ms (default per articulation). */
  strumMs?: number;
  /** 0–1 timing and velocity looseness for sampled guitars (default 0.5). */
  humanise?: number;
  /** Capo fret: shapes are chosen for the chord a capo-ed guitarist would finger (sampled guitars). */
  capo?: number;
}

/** One drum of a kit channel (expansion.md E2b): its own sound and steps, sharing the channel's mixer. */
export interface KitLane {
  /** Stable lane id; also its drum-map role (kick, snare, hat-closed, …). */
  id: string;
  name: string;
  soundId: string;
  steps: boolean[];
  mute?: boolean;
  stepEventMetadata?: Record<number, StepEventMetadata>;
}

/** A guitar channel's chord row (expansion.md E4): chord symbols plus a strum pattern, compiled to chord events. */
export interface ChordRow {
  /** Chord symbols, one per bar ("Am F C G"); bars split with "|" may hold two ("Am G | F"). */
  chords: string;
  pattern: string;
  strumMs: number;
  humanise: number;
  capo: number;
  /** A tapped one-bar pattern (pattern "custom"), in the patterns.ts format. */
  customBar?: string;
}

export interface Pattern {
  id: string;
  name: string;
  channels: Channel[];
  lengthSteps: number;
}

export interface ArrangementClip {
  id: string;
  patternId: string;
  startStep: number;
  lengthSteps: number;
  /** Song section name (Intro, Verse, Chorus…), from the song builder. */
  section?: string;
  /** Channels left out of this clip (song builder density); they stay in the pattern. */
  mutedChannelIds?: string[];
}

export interface ProjectEffects {
  reverb: number;
  delay: number;
  filterCutoff: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
}

export interface Project {
  formatVersion: number;
  name: string;
  bpm: number;
  /** Grid resolution: 4 = quarter notes, 8 = eighths, 16 = sixteenths (steps per bar). */
  noteLength: NoteLength;
  loopBars: LoopBars;
  channels: Channel[];
  customSounds: SoundDef[];
  /** Instruments built from the user's own samples (expansion.md E6). */
  personalInstruments?: import('./personalInstrument').PersonalInstrument[];
  scaleRoot: number;
  scaleId: string;
  patterns: Pattern[];
  currentPatternId?: string;
  arrangement: ArrangementClip[];
  effects: ProjectEffects;
  swingTemplate: SwingTemplate;
  recognitionTakes: RecognitionTake[];
  /** Seed for reproducible humanisation and round-robin choices. */
  seed: number;
  /** Bar names per pattern id (or "loop" when there are no patterns), from the Bars view. */
  barNames?: Record<string, string[]>;
  /** Tempo changes on the song timeline (Song › Tempo); `bpm` is the tempo before the first one. */
  tempoChanges?: import('./tempo').TempoChange[];
  /** Volume and pan changes over the song, per track (Song › Automation). */
  automation?: import('./automation').AutomationLane[];
}

export const NOTE_LENGTHS: NoteLength[] = [4, 8, 16];
export const LOOP_BARS: LoopBars[] = [1, 2, 4];
/** Measured in H4: 12 busy channels (sampled piano triads in 16ths, bass, strings, strummed guitar, a kit) schedule with ≥97 ms to spare at 6× CPU throttling. */
export const MAX_CHANNELS = 12;
export const MAX_PITCH = 127;
export const MIN_PITCH = 0;
export const DEFAULT_EFFECTS: ProjectEffects = {
  reverb: 0,
  delay: 0,
  filterCutoff: 20000,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
};
export const CURRENT_PROJECT_FORMAT_VERSION = 4;

export const totalSteps = (p: Pick<Project, 'noteLength' | 'loopBars'>): number => p.noteLength * p.loopBars;

export function normalizeEffects(effects?: Partial<ProjectEffects> | null): ProjectEffects {
  const bounded = (value: number | undefined, fallback: number, min: number, max: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value!)) : fallback;
  return {
    reverb: bounded(effects?.reverb, DEFAULT_EFFECTS.reverb, 0, 1),
    delay: bounded(effects?.delay, DEFAULT_EFFECTS.delay, 0, 1),
    filterCutoff: bounded(effects?.filterCutoff, DEFAULT_EFFECTS.filterCutoff, 200, 20000),
    eqLow: bounded(effects?.eqLow, DEFAULT_EFFECTS.eqLow, -12, 12),
    eqMid: bounded(effects?.eqMid, DEFAULT_EFFECTS.eqMid, -12, 12),
    eqHigh: bounded(effects?.eqHigh, DEFAULT_EFFECTS.eqHigh, -12, 12),
  };
}

export function createChannel(id: string, name: string, soundId: string, steps = 16): Channel {
  return { id, name, soundId, volume: 0.8, pan: 0, mute: false, solo: false, steps: new Array(steps).fill(false), notes: [] };
}

export function createProject(name = 'Untitled'): Project {
  return {
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION, name, bpm: 100, noteLength: 16, loopBars: 1,
    channels: [createChannel('ch1', 'Kick', 'kick-1')],
    customSounds: [],
    scaleRoot: 0, scaleId: 'major', patterns: [], arrangement: [],
    effects: { ...DEFAULT_EFFECTS },
    swingTemplate: 'straight',
    recognitionTakes: [],
    seed: 1,
  };
}

function copyChannels(channels: Channel[]): Channel[] {
  return channels.map((channel) => ({
    ...channel,
    steps: [...channel.steps],
    notes: (channel.notes ?? []).map((note) => ({
      ...note,
      ...(note.pitchBend ? { pitchBend: note.pitchBend.map((point) => ({ ...point })) } : {}),
    })),
    ...(channel.stepEventMetadata ? {
      stepEventMetadata: Object.fromEntries(Object.entries(channel.stepEventMetadata).map(([step, metadata]) => [
        step, { ...metadata },
      ])),
    } : {}),
    ...(channel.chordEvents ? { chordEvents: channel.chordEvents.map((event) => ({ ...event })) } : {}),
    ...(channel.lanes ? { lanes: channel.lanes.map(copyLane) } : {}),
  }));
}

function copyLane(lane: KitLane): KitLane {
  return {
    ...lane,
    steps: [...lane.steps],
    ...(lane.stepEventMetadata ? {
      stepEventMetadata: Object.fromEntries(Object.entries(lane.stepEventMetadata).map(([step, metadata]) => [step, { ...metadata }])),
    } : {}),
  };
}

/** Patterns with the current pattern's channels up to date. */
export function syncedPatterns(p: Project): Pattern[] {
  return syncCurrentPattern(p, p.channels).patterns;
}

function syncCurrentPattern(p: Project, channels: Channel[], lengthSteps = totalSteps(p)): Project {
  if (!p.currentPatternId) return { ...p, channels };
  return {
    ...p,
    channels,
    patterns: p.patterns.map((pattern) =>
      pattern.id === p.currentPatternId ? { ...pattern, channels: copyChannels(channels), lengthSteps } : pattern,
    ),
  };
}

/** Keep a track's Length and Steps view valid for the grid: Length divides the loop and is shorter than it; Steps divides the bar. */
export function fitTrackGrid(c: Channel, stepsPerBar: number, total: number): Channel {
  const { lengthSteps, viewSteps, ...rest } = c;
  const lengthOk = Number.isInteger(lengthSteps) && lengthSteps! > 0 && lengthSteps! < total && total % lengthSteps! === 0;
  const viewOk = viewSteps !== undefined && NOTE_LENGTHS.includes(viewSteps) && viewSteps < stepsPerBar && stepsPerBar % viewSteps === 0;
  return { ...rest, ...(lengthOk ? { lengthSteps } : {}), ...(viewOk ? { viewSteps } : {}) } as Channel;
}

export function setLoopBars(p: Project, loopBars: LoopBars): Project {
  const len = p.noteLength * loopBars;
  const updated = syncCurrentPattern(p, p.channels.map((c) => fitTrackGrid({
    ...c,
    steps: Array.from({ length: len }, (_, i) => c.steps[i] ?? false),
    notes: (c.notes ?? []).filter((note) => note.step < len),
    ...(c.stepEventMetadata ? {
      stepEventMetadata: Object.fromEntries(Object.entries(c.stepEventMetadata).filter(([step]) => Number(step) < len)),
    } : {}),
    chordEvents: (c.chordEvents ?? []).filter((event) => event.step < len),
    ...(c.lanes ? {
      lanes: c.lanes.map((lane) => ({
        ...lane,
        steps: Array.from({ length: len }, (_, i) => lane.steps[i] ?? false),
        ...(lane.stepEventMetadata ? {
          stepEventMetadata: Object.fromEntries(Object.entries(lane.stepEventMetadata).filter(([step]) => Number(step) < len)),
        } : {}),
      })),
    } : {}),
  }, p.noteLength, len)), len);
  return { ...updated, loopBars };
}

/** Change grid resolution, keeping notes that land on the new grid. */
export function setNoteLength(p: Project, noteLength: NoteLength): Project {
  const oldLen = p.noteLength * p.loopBars;
  const newLen = noteLength * p.loopBars;
  const resample = (steps: boolean[]) =>
    Array.from({ length: newLen }, (_, j) => {
      const pos = (j * oldLen) / newLen;
      return Number.isInteger(pos) ? steps[pos] ?? false : false;
    });
  const updated = syncCurrentPattern(p, p.channels.map((c) => fitTrackGrid({
    ...c,
    ...(c.lengthSteps ? { lengthSteps: (c.lengthSteps * noteLength) / p.noteLength } : {}),
    steps: resample(c.steps),
    ...(c.lanes ? {
      lanes: c.lanes.map((lane) => ({
        ...lane,
        steps: resample(lane.steps),
        ...(lane.stepEventMetadata ? {
          stepEventMetadata: Object.fromEntries(Object.entries(lane.stepEventMetadata).flatMap(([step, metadata]) => {
            const position = (Number(step) * newLen) / oldLen;
            return Number.isInteger(position) ? [[position, metadata]] : [];
          })),
        } : {}),
      })),
    } : {}),
    notes: (c.notes ?? []).flatMap((note) => {
      const position = (note.step * newLen) / oldLen;
      return Number.isInteger(position)
        ? [{
          ...note,
          step: position,
          durationSteps: Math.max(1, Math.round((note.durationSteps * newLen) / oldLen)),
          ...(note.pitchBend ? { pitchBend: note.pitchBend.map((point) => ({ ...point })) } : {}),
        }]
        : [];
    }),
    ...(c.stepEventMetadata ? {
      stepEventMetadata: Object.fromEntries(Object.entries(c.stepEventMetadata).flatMap(([step, metadata]) => {
        const position = (Number(step) * newLen) / oldLen;
        return Number.isInteger(position) ? [[position, { ...metadata }]] : [];
      })),
    } : {}),
    chordEvents: (c.chordEvents ?? []).flatMap((event) => {
      const position = (event.step * newLen) / oldLen;
      return Number.isInteger(position)
        ? [{ ...event, step: position, durationSteps: Math.max(1, Math.round((event.durationSteps * newLen) / oldLen)) }]
        : [];
    }),
  }, noteLength, newLen)), newLen);
  return { ...updated, noteLength };
}

export function setBpm(p: Project, bpm: number): Project {
  return { ...p, bpm: Math.min(200, Math.max(40, Math.round(bpm) || p.bpm)) };
}

export function setEffects(p: Project, effects: Partial<ProjectEffects>): Project {
  return { ...p, effects: normalizeEffects({ ...p.effects, ...effects }) };
}

export function setScale(p: Project, root: number, scaleId: string): Project {
  if (!Number.isFinite(root) || !scaleId.trim()) return p;
  return { ...p, scaleRoot: ((Math.round(root) % 12) + 12) % 12, scaleId };
}

export function normalizeSwingTemplate(template?: unknown): SwingTemplate {
  return SWING_TEMPLATES.some((item) => item.id === template) ? template as SwingTemplate : 'straight';
}

export function setSwingTemplate(p: Project, swingTemplate: SwingTemplate): Project {
  return { ...p, swingTemplate: normalizeSwingTemplate(swingTemplate) };
}

export function updateChannel(p: Project, id: string, patch: Partial<Channel>): Project {
  return syncCurrentPattern(p, p.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export function toggleStep(p: Project, channelId: string, step: number): Project {
  return syncCurrentPattern(p, p.channels.map((c) =>
    c.id === channelId ? { ...c, steps: c.steps.map((s, i) => (i === step ? !s : s)) } : c,
  ));
}

export function toggleLaneStep(p: Project, channelId: string, laneId: string, step: number): Project {
  return syncCurrentPattern(p, p.channels.map((c) => c.id !== channelId || !c.lanes ? c : {
    ...c,
    lanes: c.lanes.map((lane) => lane.id !== laneId ? lane : { ...lane, steps: lane.steps.map((on, i) => (i === step ? !on : on)) }),
  }));
}

export function addChannel(p: Project, name: string, soundId: string): Project {
  if (p.channels.length >= MAX_CHANNELS) return p;
  let n = p.channels.length + 1;
  while (p.channels.some((c) => c.id === `ch${n}`)) n++;
  return syncCurrentPattern(p, [...p.channels, createChannel(`ch${n}`, name, soundId, totalSteps(p))]);
}

export function duplicateChannel(p: Project, id: string): Project {
  if (p.channels.length >= MAX_CHANNELS) return p;
  const channel = p.channels.find((item) => item.id === id);
  if (!channel) return p;
  const next = addChannel(p, `${channel.name} copy`, channel.soundId);
  const duplicate = next.channels.at(-1);
  if (!duplicate) return p;
  const { id: _sourceId, ...copy } = copyChannels([channel])[0];
  return updateChannel(next, duplicate.id, { ...copy, name: `${channel.name} copy` });
}

export function removeChannel(p: Project, id: string): Project {
  return syncCurrentPattern(p, p.channels.filter((c) => c.id !== id));
}

export function addNote(p: Project, channelId: string, note: NoteEvent): Project {
  if (!note.id || !Number.isFinite(note.pitch) || !Number.isFinite(note.step)) return p;
  const pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.round(note.pitch)));
  const step = Math.max(0, Math.floor(note.step));
  const durationSteps = Number.isFinite(note.durationSteps) ? Math.max(1, note.durationSteps) : 1;
  const velocity = note.velocity === undefined || !Number.isFinite(note.velocity)
    ? undefined
    : Math.max(0, Math.min(1, note.velocity));
  const confidence = note.confidence === undefined || !Number.isFinite(note.confidence)
    ? undefined
    : Math.max(0, Math.min(1, note.confidence));
  const pitchBend = Array.isArray(note.pitchBend)
    ? note.pitchBend.filter((point) => point && Number.isFinite(point.time) && point.time >= 0 && Number.isFinite(point.value))
      .map((point) => ({ time: point.time, value: Math.max(-48, Math.min(48, point.value)) }))
    : undefined;
  const sourceTakeId = typeof note.sourceTakeId === 'string' && note.sourceTakeId.length > 0 ? note.sourceTakeId : undefined;
  return syncCurrentPattern(p, p.channels.map((channel) =>
    channel.id === channelId
      ? {
        ...channel,
        notes: [
          ...(channel.notes ?? []).filter((item) => item.id !== note.id),
          {
            ...note,
            pitch,
            step,
            durationSteps,
            velocity,
            confidence,
            pitchBend,
            sourceTakeId,
          },
        ],
      }
      : channel,
  ));
}

export function setStepEventMetadata(
  p: Project,
  channelId: string,
  step: number,
  metadata?: StepEventMetadata,
): Project {
  const channel = p.channels.find((item) => item.id === channelId);
  if (!channel || !Number.isInteger(step) || step < 0 || step >= channel.steps.length) return p;
  const next = { ...(channel.stepEventMetadata ?? {}) };
  if (!metadata) {
    delete next[step];
  } else {
    const confidence = metadata.confidence === undefined || !Number.isFinite(metadata.confidence)
      ? undefined
      : Math.max(0, Math.min(1, metadata.confidence));
    const sourceTakeId = typeof metadata.sourceTakeId === 'string' && metadata.sourceTakeId.length > 0
      ? metadata.sourceTakeId
      : undefined;
    if (confidence === undefined && sourceTakeId === undefined) delete next[step];
    else next[step] = {
      ...(confidence === undefined ? {} : { confidence }),
      ...(sourceTakeId === undefined ? {} : { sourceTakeId }),
    };
  }
  return updateChannel(p, channelId, { stepEventMetadata: next });
}

export function addChordEvent(p: Project, channelId: string, event: ChordEvent): Project {
  if (!event.id || !Number.isFinite(event.root) || !Number.isFinite(event.step) || !Number.isFinite(event.durationSteps)) return p;
  if (!['major', 'minor', 'diminished', 'augmented', 'sus2', 'sus4', 'seventh', 'major7', 'minor7'].includes(event.quality)) return p;
  if (!['sustained', 'down-strum', 'up-strum', 'muted', 'power'].includes(event.articulation)) return p;
  const root = Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.round(event.root)));
  const step = Math.max(0, Math.floor(event.step));
  const durationSteps = Math.max(1, event.durationSteps);
  const velocity = event.velocity === undefined || !Number.isFinite(event.velocity)
    ? undefined
    : Math.max(0, Math.min(1, event.velocity));
  return syncCurrentPattern(p, p.channels.map((channel) =>
    channel.id === channelId
      ? {
        ...channel,
        chordEvents: [
          ...(channel.chordEvents ?? []).filter((item) => item.id !== event.id),
          { ...event, root, step, durationSteps, ...(velocity === undefined ? {} : { velocity }) },
        ],
      }
      : channel,
  ));
}

export function removeChordEvent(p: Project, channelId: string, eventId: string): Project {
  return syncCurrentPattern(p, p.channels.map((channel) =>
    channel.id === channelId
      ? { ...channel, chordEvents: (channel.chordEvents ?? []).filter((event) => event.id !== eventId) }
      : channel,
  ));
}

export function removeNote(p: Project, channelId: string, noteId: string): Project {
  return syncCurrentPattern(p, p.channels.map((channel) =>
    channel.id === channelId
      ? { ...channel, notes: (channel.notes ?? []).filter((note) => note.id !== noteId) }
      : channel,
  ));
}

export function transposeChannelNotes(p: Project, channelId: string, semitones: number): Project {
  if (!Number.isFinite(semitones)) return p;
  const shift = Math.round(semitones);
  return updateChannel(p, channelId, {
    notes: (p.channels.find((channel) => channel.id === channelId)?.notes ?? []).map((note) => ({
      ...note,
      pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, note.pitch + shift)),
    })),
    chordEvents: (p.channels.find((channel) => channel.id === channelId)?.chordEvents ?? []).map((event) => ({
      ...event,
      root: Math.max(MIN_PITCH, Math.min(MAX_PITCH, event.root + shift)),
    })),
  });
}

export function shiftChannelNotes(p: Project, channelId: string, steps: number): Project {
  if (!Number.isFinite(steps)) return p;
  const channel = p.channels.find((item) => item.id === channelId);
  if (!channel) return p;
  const length = Math.max(1, channel.steps.length);
  const shift = Math.round(steps);
  return updateChannel(p, channelId, {
    notes: (channel.notes ?? []).map((note) => ({
      ...note,
      step: ((note.step + shift) % length + length) % length,
    })),
    chordEvents: (channel.chordEvents ?? []).map((event) => ({
      ...event,
      step: ((event.step + shift) % length + length) % length,
    })),
  });
}

export function scaleChannelNoteDurations(p: Project, channelId: string, factor: number): Project {
  if (!Number.isFinite(factor) || factor <= 0) return p;
  const channel = p.channels.find((item) => item.id === channelId);
  if (!channel) return p;
  return updateChannel(p, channelId, {
    notes: (channel.notes ?? []).map((note) => ({
      ...note,
      durationSteps: Math.max(1, Math.round(note.durationSteps * factor)),
    })),
    chordEvents: (channel.chordEvents ?? []).map((event) => ({
      ...event,
      durationSteps: Math.max(1, Math.round(event.durationSteps * factor)),
    })),
  });
}

export function addPattern(p: Project, name = 'Pattern'): Project {
  let number = p.patterns.length + 1;
  while (p.patterns.some((pattern) => pattern.id === `pattern-${number}`)) number++;
  const pattern: Pattern = {
    id: `pattern-${number}`,
    name: name.trim() || `Pattern ${number}`,
    channels: copyChannels(p.channels),
    lengthSteps: totalSteps(p),
  };
  const project = syncCurrentPattern(p, p.channels);
  return { ...project, patterns: [...project.patterns, pattern], currentPatternId: pattern.id };
}

export function selectPattern(p: Project, patternId: string): Project {
  const current = syncCurrentPattern(p, p.channels);
  const selected = current.patterns.find((pattern) => pattern.id === patternId);
  return selected ? { ...current, currentPatternId: selected.id, channels: copyChannels(selected.channels) } : p;
}

export function renamePattern(p: Project, patternId: string, name: string): Project {
  const trimmed = name.trim();
  if (!trimmed) return p;
  return {
    ...p,
    patterns: p.patterns.map((pattern) => pattern.id === patternId ? { ...pattern, name: trimmed } : pattern),
  };
}

export function removePattern(p: Project, patternId: string): Project {
  const patterns = p.patterns.filter((pattern) => pattern.id !== patternId);
  const arrangement = p.arrangement.filter((clip) => clip.patternId !== patternId);
  if (p.currentPatternId !== patternId) return { ...p, patterns, arrangement };
  const next = patterns[0];
  return {
    ...p, patterns, arrangement, currentPatternId: next?.id,
    channels: next ? copyChannels(next.channels) : p.channels,
  };
}

export function addArrangementClip(p: Project, patternId: string, startStep: number, lengthSteps?: number): Project {
  const pattern = p.patterns.find((item) => item.id === patternId);
  if (!pattern || !Number.isFinite(startStep) || startStep < 0) return p;
  const length = lengthSteps ?? pattern.lengthSteps;
  if (!Number.isFinite(length) || length < 1) return p;
  let number = p.arrangement.length + 1;
  while (p.arrangement.some((clip) => clip.id === `clip-${number}`)) number++;
  const id = `clip-${number}`;
  const clip: ArrangementClip = {
    id, patternId, startStep: Math.floor(startStep), lengthSteps: Math.max(1, Math.floor(length)),
  };
  const project = syncCurrentPattern(p, p.channels);
  return { ...project, arrangement: [...project.arrangement, clip] };
}

export function removeArrangementClip(p: Project, clipId: string): Project {
  return { ...p, arrangement: p.arrangement.filter((clip) => clip.id !== clipId) };
}

export function arrangementLength(p: Project): number {
  return p.arrangement.reduce((length, clip) => Math.max(length, clip.startStep + clip.lengthSteps), 0);
}

export function channelsForPlaybackStep(p: Project, step: number): Array<{ channels: Channel[]; localStep: number }> {
  if (!p.arrangement.length) return [{ channels: p.channels, localStep: step % totalSteps(p) }];
  return p.arrangement.flatMap((clip) => {
    const pattern = p.patterns.find((item) => item.id === clip.patternId);
    const offset = step - clip.startStep;
    if (!pattern || offset < 0 || offset >= clip.lengthSteps || pattern.lengthSteps <= 0) return [];
    const all = pattern.id === p.currentPatternId ? p.channels : pattern.channels;
    const muted = clip.mutedChannelIds;
    const channels = muted?.length ? all.filter((channel) => !muted.includes(channel.id)) : all;
    return [{ channels, localStep: offset % pattern.lengthSteps }];
  });
}

export function addCustomSound(p: Project, name: string, params: SynthParams): { project: Project; sound: SoundDef } {
  const sound: SoundDef = { id: `custom-${Date.now().toString(36)}-${p.customSounds.length}`, name: name.trim() || 'My sound', category: 'Mine', params };
  return { project: { ...p, customSounds: [...p.customSounds, sound] }, sound };
}

export function addSampleSound(p: Project, name: string, sampleId: string, tags: string[] = []): Project {
  const sound: SoundDef = {
    id: `sample-${Date.now().toString(36)}-${p.customSounds.length}`,
    name: name.trim() || 'My sample',
    category: 'Samples',
    params: { wave: 'sine', freq: 440, freqEnd: 440, decay: 0.1, cutoff: 12000 },
    sampleId,
    tags,
    assetSource: 'user-sample',
    assetAttribution: 'User-provided audio',
    assetLicense: 'Not verified by MusicMaker',
  };
  return { ...p, customSounds: [...p.customSounds, sound] };
}

export function audibleChannels(p: Project): Channel[] {
  const anySolo = p.channels.some((c) => c.solo);
  return p.channels.filter((c) => !c.mute && (!anySolo || c.solo));
}
