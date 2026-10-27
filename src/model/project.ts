export type NoteLength = 4 | 8 | 16;
export type LoopBars = 1 | 2 | 4;
export type Wave = 'sine' | 'square' | 'saw' | 'triangle' | 'noise';

export interface SynthParams {
  wave: Wave;
  freq: number;
  freqEnd: number;
  decay: number;
  cutoff: number;
}

export interface SoundDef {
  id: string;
  name: string;
  category: string;
  params: SynthParams;
  sampleId?: string;
  tags?: string[];
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
}

export interface NoteEvent {
  id: string;
  step: number;
  pitch: number;
  durationSteps: number;
  velocity?: number;
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
  name: string;
  bpm: number;
  /** Grid resolution: 4 = quarter notes, 8 = eighths, 16 = sixteenths (steps per bar). */
  noteLength: NoteLength;
  loopBars: LoopBars;
  channels: Channel[];
  customSounds: SoundDef[];
  scaleRoot: number;
  scaleId: string;
  patterns: Pattern[];
  currentPatternId?: string;
  arrangement: ArrangementClip[];
  effects: ProjectEffects;
}

export const NOTE_LENGTHS: NoteLength[] = [4, 8, 16];
export const LOOP_BARS: LoopBars[] = [1, 2, 4];
export const MAX_CHANNELS = 8;
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
    name, bpm: 100, noteLength: 16, loopBars: 1,
    channels: [createChannel('ch1', 'Kick', 'kick-1')],
    customSounds: [],
    scaleRoot: 0, scaleId: 'major', patterns: [], arrangement: [],
    effects: { ...DEFAULT_EFFECTS },
  };
}

function copyChannels(channels: Channel[]): Channel[] {
  return channels.map((channel) => ({
    ...channel,
    steps: [...channel.steps],
    notes: (channel.notes ?? []).map((note) => ({ ...note })),
  }));
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

export function setLoopBars(p: Project, loopBars: LoopBars): Project {
  const len = p.noteLength * loopBars;
  const updated = syncCurrentPattern(p, p.channels.map((c) => ({
    ...c,
    steps: Array.from({ length: len }, (_, i) => c.steps[i] ?? false),
    notes: (c.notes ?? []).filter((note) => note.step < len),
  })), len);
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
  const updated = syncCurrentPattern(p, p.channels.map((c) => ({
    ...c,
    steps: resample(c.steps),
    notes: (c.notes ?? []).flatMap((note) => {
      const position = (note.step * newLen) / oldLen;
      return Number.isInteger(position)
        ? [{ ...note, step: position, durationSteps: Math.max(1, Math.round((note.durationSteps * newLen) / oldLen)) }]
        : [];
    }),
  })), newLen);
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

export function updateChannel(p: Project, id: string, patch: Partial<Channel>): Project {
  return syncCurrentPattern(p, p.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export function toggleStep(p: Project, channelId: string, step: number): Project {
  return syncCurrentPattern(p, p.channels.map((c) =>
    c.id === channelId ? { ...c, steps: c.steps.map((s, i) => (i === step ? !s : s)) } : c,
  ));
}

export function addChannel(p: Project, name: string, soundId: string): Project {
  if (p.channels.length >= MAX_CHANNELS) return p;
  let n = p.channels.length + 1;
  while (p.channels.some((c) => c.id === `ch${n}`)) n++;
  return syncCurrentPattern(p, [...p.channels, createChannel(`ch${n}`, name, soundId, totalSteps(p))]);
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
  return syncCurrentPattern(p, p.channels.map((channel) =>
    channel.id === channelId
      ? {
        ...channel,
        notes: [
          ...(channel.notes ?? []).filter((item) => item.id !== note.id),
          { ...note, pitch, step, durationSteps, ...(velocity === undefined ? {} : { velocity }) },
        ],
      }
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
    const channels = pattern.id === p.currentPatternId ? p.channels : pattern.channels;
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
  };
  return { ...p, customSounds: [...p.customSounds, sound] };
}

export function audibleChannels(p: Project): Channel[] {
  const anySolo = p.channels.some((c) => c.solo);
  return p.channels.filter((c) => !c.mute && (!anySolo || c.solo));
}
