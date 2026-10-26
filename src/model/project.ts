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
}

export interface Project {
  name: string;
  bpm: number;
  /** Grid resolution: 4 = quarter notes, 8 = eighths, 16 = sixteenths (steps per bar). */
  noteLength: NoteLength;
  loopBars: LoopBars;
  channels: Channel[];
  customSounds: SoundDef[];
}

export const NOTE_LENGTHS: NoteLength[] = [4, 8, 16];
export const LOOP_BARS: LoopBars[] = [1, 2, 4];
export const MAX_CHANNELS = 8;

export const totalSteps = (p: Pick<Project, 'noteLength' | 'loopBars'>): number => p.noteLength * p.loopBars;

export function createChannel(id: string, name: string, soundId: string, steps = 16): Channel {
  return { id, name, soundId, volume: 0.8, pan: 0, mute: false, solo: false, steps: new Array(steps).fill(false) };
}

export function createProject(name = 'Untitled'): Project {
  return {
    name, bpm: 100, noteLength: 16, loopBars: 1,
    channels: [createChannel('ch1', 'Kick', 'kick-1')],
    customSounds: [],
  };
}

export function setLoopBars(p: Project, loopBars: LoopBars): Project {
  const len = p.noteLength * loopBars;
  return {
    ...p, loopBars,
    channels: p.channels.map((c) => ({ ...c, steps: Array.from({ length: len }, (_, i) => c.steps[i] ?? false) })),
  };
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
  return { ...p, noteLength, channels: p.channels.map((c) => ({ ...c, steps: resample(c.steps) })) };
}

export function setBpm(p: Project, bpm: number): Project {
  return { ...p, bpm: Math.min(200, Math.max(40, Math.round(bpm) || p.bpm)) };
}

export function updateChannel(p: Project, id: string, patch: Partial<Channel>): Project {
  return { ...p, channels: p.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export function toggleStep(p: Project, channelId: string, step: number): Project {
  return {
    ...p,
    channels: p.channels.map((c) =>
      c.id === channelId ? { ...c, steps: c.steps.map((s, i) => (i === step ? !s : s)) } : c,
    ),
  };
}

export function addChannel(p: Project, name: string, soundId: string): Project {
  if (p.channels.length >= MAX_CHANNELS) return p;
  let n = p.channels.length + 1;
  while (p.channels.some((c) => c.id === `ch${n}`)) n++;
  return { ...p, channels: [...p.channels, createChannel(`ch${n}`, name, soundId, totalSteps(p))] };
}

export function removeChannel(p: Project, id: string): Project {
  return { ...p, channels: p.channels.filter((c) => c.id !== id) };
}

export function addCustomSound(p: Project, name: string, params: SynthParams): { project: Project; sound: SoundDef } {
  const sound: SoundDef = { id: `custom-${Date.now().toString(36)}-${p.customSounds.length}`, name: name.trim() || 'My sound', category: 'Mine', params };
  return { project: { ...p, customSounds: [...p.customSounds, sound] }, sound };
}

export function audibleChannels(p: Project): Channel[] {
  const anySolo = p.channels.some((c) => c.solo);
  return p.channels.filter((c) => !c.mute && (!anySolo || c.solo));
}
