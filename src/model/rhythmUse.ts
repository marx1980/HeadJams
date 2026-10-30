import { addKitChannel, findDrumKit } from '../library/drumKits';
import { DEFAULT_CHORD_ROW } from '../library/guitar/patterns';
import { rhythmSteps, rhythmToStrumBar, type Rhythm } from '../library/tapRhythm';
import { setChordRow } from './chordRow';
import { formatChordSymbol } from './music';
import { addChannel, MAX_CHANNELS, totalSteps, updateChannel, type Channel, type NoteEvent, type Project } from './project';
import { findSound } from '../library/sounds';

/** What a tapped rhythm is used for (hum.md H5). */
export type RhythmUse = 'kick' | 'snare' | 'hat' | 'bass' | 'strum' | 'pulses';

export const RHYTHM_USES: ReadonlyArray<{ id: RhythmUse; label: string }> = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'hat', label: 'Hi-hat' },
  { id: 'bass', label: 'Bass' },
  { id: 'strum', label: 'Strum' },
  { id: 'pulses', label: 'Pulses' },
];

const LANE: Record<'kick' | 'snare' | 'hat', string> = { kick: 'kick', snare: 'snare', hat: 'hat-closed' };

/** Channels a use can write into. */
export function rhythmTargets(project: Project, use: RhythmUse): Channel[] {
  if (use === 'kick' || use === 'snare' || use === 'hat') return project.channels.filter((channel) => channel.lanes);
  if (use === 'strum') return project.channels.filter((channel) => findSound(project, channel.soundId)?.playbackMode === 'chord');
  return project.channels.filter((channel) => !channel.lanes && findSound(project, channel.soundId)?.playbackMode === 'notes');
}

/** The chord root (pitch class) sounding at a step: a chord-row or chord-track chord if there is one, else the key. */
function rootAt(project: Project, step: number): { root: number; minor: boolean } {
  for (const channel of project.channels) {
    const event = (channel.chordEvents ?? []).filter((item) => item.step <= step && step < item.step + Math.max(1, item.durationSteps)).at(-1);
    if (event) return { root: ((event.root % 12) + 12) % 12, minor: event.quality.startsWith('minor') };
  }
  for (const channel of project.channels) {
    if (channel.generatedMetadata?.kind !== 'chord-suggestions') continue;
    const sounding = channel.notes.filter((note) => note.step <= step && step < note.step + note.durationSteps);
    if (sounding.length) return { root: ((Math.min(...sounding.map((note) => note.pitch)) % 12) + 12) % 12, minor: false };
  }
  return { root: project.scaleRoot, minor: project.scaleId.startsWith('minor') };
}

/** I V vi IV (or i VI III VII in minor) in the project key, as chord symbols. */
export function keyProgression(project: Project): string {
  const root = project.scaleRoot;
  const minor = project.scaleId.startsWith('minor');
  const chords: [number, 'major' | 'minor'][] = minor
    ? [[0, 'minor'], [8, 'major'], [3, 'major'], [10, 'major']]
    : [[0, 'major'], [7, 'major'], [9, 'minor'], [5, 'major']];
  return chords.map(([degree, quality]) => formatChordSymbol(48 + ((root + degree) % 12), quality)).join(' ');
}

/** Apply a tapped rhythm: into the chosen channel when it fits, otherwise a new one. */
export function applyRhythm(project: Project, rhythm: Rhythm, use: RhythmUse, intoChannelId?: string): Project {
  const steps = rhythmSteps(rhythm).filter((step) => step < totalSteps(project));
  if (!steps.length) return project;
  const target = rhythmTargets(project, use).find((channel) => channel.id === intoChannelId);
  const length = totalSteps(project);
  let next = project;

  if (use === 'kick' || use === 'snare' || use === 'hat') {
    let channelId = target?.id;
    if (!channelId) {
      if (next.channels.length >= MAX_CHANNELS) return project;
      next = addKitChannel(next, findDrumKit('acoustic-kit')!);
      channelId = next.channels.at(-1)!.id;
    }
    const channel = next.channels.find((item) => item.id === channelId)!;
    const laneId = LANE[use];
    const lanes = channel.lanes!.some((lane) => lane.id === laneId)
      ? channel.lanes!
      : [...channel.lanes!, { id: laneId, name: use === 'hat' ? 'Closed hat' : use === 'kick' ? 'Kick' : 'Snare', soundId: use === 'hat' ? 'hat-1' : `${use}-1`, steps: new Array(length).fill(false) }];
    return updateChannel(next, channelId, {
      lanes: lanes.map((lane) => lane.id !== laneId ? lane : { ...lane, steps: lane.steps.map((on, i) => on || steps.includes(i)) }),
    });
  }

  if (use === 'strum') {
    let channelId = target?.id;
    if (!channelId) {
      if (next.channels.length >= MAX_CHANNELS) return project;
      next = addChannel(next, 'Tapped strum', 'nylon-chords');
      channelId = next.channels.at(-1)!.id;
    }
    const channel = next.channels.find((item) => item.id === channelId)!;
    const row = channel.chordRow ?? { ...DEFAULT_CHORD_ROW, chords: keyProgression(next) };
    return setChordRow(next, channelId, { ...row, pattern: 'custom', customBar: rhythmToStrumBar(rhythm, next.noteLength) });
  }

  // Bass and pulses: notes on the tapped steps, following the chords (or the key).
  const notes: NoteEvent[] = steps.flatMap((step, index) => {
    const nextStep = steps[index + 1] ?? (steps[0] + length);
    const durationSteps = Math.max(1, Math.min(use === 'bass' ? nextStep - step : 2, length - step));
    const { root, minor } = rootAt(next, step);
    const velocity = Math.round((0.55 + 0.4 * rhythm.hits[step]) * 100) / 100;
    if (use === 'bass') {
      const pitch = 36 + root > 43 ? 24 + root : 36 + root;
      return [{ id: `tap-bass-${step}`, step, pitch, durationSteps, velocity }];
    }
    return [0, minor ? 3 : 4, 7].map((interval, n) => ({
      id: `tap-pulse-${step}-${n}`, step, pitch: 60 + root + interval, durationSteps, velocity,
    }));
  });
  if (target) {
    const prefix = use === 'bass' ? 'tap-bass-' : 'tap-pulse-';
    return updateChannel(next, target.id, { notes: [...target.notes.filter((note) => !note.id.startsWith(prefix)), ...notes] });
  }
  if (next.channels.length >= MAX_CHANNELS) return project;
  next = addChannel(next, use === 'bass' ? 'Tapped bass' : 'Pulses', use === 'bass' ? 'electric-bass' : 'lead-9');
  return updateChannel(next, next.channels.at(-1)!.id, { notes });
}
