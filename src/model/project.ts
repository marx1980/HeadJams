export type NoteLength = 4 | 8 | 16;
export type LoopBars = 1 | 2 | 4;

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
  stepsPerBar: number;
  noteLength: NoteLength;
  loopBars: LoopBars;
  channels: Channel[];
}

export const STEPS_PER_BAR = 16;

export function createChannel(id: string, name: string, soundId: string, loopBars: LoopBars = 1): Channel {
  return {
    id, name, soundId, volume: 0.8, pan: 0, mute: false, solo: false,
    steps: new Array(STEPS_PER_BAR * loopBars).fill(false),
  };
}

export function createProject(name = 'Untitled'): Project {
  return {
    name, bpm: 100, stepsPerBar: STEPS_PER_BAR, noteLength: 16, loopBars: 1,
    channels: [createChannel('ch1', 'Kick', 'kick')],
  };
}

export function setLoopBars(p: Project, loopBars: LoopBars): Project {
  const len = p.stepsPerBar * loopBars;
  return {
    ...p, loopBars,
    channels: p.channels.map((c) => ({
      ...c,
      steps: Array.from({ length: len }, (_, i) => c.steps[i] ?? false),
    })),
  };
}

export function toggleStep(p: Project, channelId: string, step: number): Project {
  return {
    ...p,
    channels: p.channels.map((c) =>
      c.id === channelId ? { ...c, steps: c.steps.map((s, i) => (i === step ? !s : s)) } : c,
    ),
  };
}

export function audibleChannels(p: Project): Channel[] {
  const anySolo = p.channels.some((c) => c.solo);
  return p.channels.filter((c) => !c.mute && (!anySolo || c.solo));
}
