import { chordPitches } from './music';
import { addChannel, createChannel, MAX_CHANNELS, totalSteps, updateChannel, type Channel, type ChordEvent, type NoteEvent, type Project } from './project';
import type { Progression, ProgressionChord } from '../library/progressions';

/** What a chord progression is played on (hum.md H3). */
export type Accompaniment = 'guitar' | 'piano' | 'strings';

export const ACCOMPANIMENTS: ReadonlyArray<{ id: Accompaniment; label: string; soundId: string }> = [
  { id: 'guitar', label: 'Guitar', soundId: 'nylon-chords' },
  { id: 'piano', label: 'Piano', soundId: 'grand-piano' },
  { id: 'strings', label: 'Strings', soundId: 'strings' },
];

/** Chord tones voiced between E3 and G4, each chord moving as little as possible from the last. */
function voice(chord: ProgressionChord, previous: number[] | undefined): number[] {
  const classes = [...new Set(chordPitches(chord.root, chord.quality).map((pitch) => ((pitch % 12) + 12) % 12))];
  const options: number[][] = [];
  for (let low = 52; low <= 60; low++) {
    if (!classes.includes(low % 12)) continue;
    const voiced = [low];
    for (const pc of classes) {
      if (pc === low % 12) continue;
      let pitch = low + ((pc - low % 12 + 12) % 12);
      if (pitch <= low) pitch += 12;
      voiced.push(pitch);
    }
    options.push(voiced.sort((a, b) => a - b));
  }
  if (!previous) return options.find((option) => option[0] % 12 === chord.root % 12) ?? options[0];
  const centre = (pitches: number[]) => pitches.reduce((sum, pitch) => sum + pitch, 0) / pitches.length;
  return options.reduce((best, option) =>
    Math.abs(centre(option) - centre(previous)) < Math.abs(centre(best) - centre(previous)) ? option : best);
}

/** The notes or strums that play a progression on an accompaniment instrument. */
export function progressionEvents(progression: Progression, accompaniment: Accompaniment, stepsPerBar: number, idPrefix = 'prog'):
  { notes: NoteEvent[]; chordEvents: ChordEvent[] } {
  const chords = progression.chords;
  if (accompaniment === 'guitar') {
    // Strum every half bar: down on the bar, down again on beat 3.
    const half = Math.max(1, Math.floor(stepsPerBar / 2));
    const chordEvents: ChordEvent[] = chords.flatMap((chord, index) => {
      const strums: ChordEvent[] = [];
      for (let step = chord.step; step < chord.step + chord.durationSteps; step += half) {
        strums.push({
          id: `${idPrefix}-${index}-${step}`, step, root: chord.root, quality: chord.quality,
          articulation: 'down-strum', durationSteps: Math.min(half, chord.step + chord.durationSteps - step),
          velocity: step === chord.step ? 0.9 : 0.75,
        });
      }
      return strums;
    });
    return { notes: [], chordEvents };
  }
  let previous: number[] | undefined;
  const notes = chords.flatMap((chord, index) => {
    const voiced = voice(chord, previous);
    previous = voiced;
    const bass = 36 + ((chord.root % 12) + 12) % 12;
    const velocity = accompaniment === 'piano' ? 0.7 : 0.6;
    return [bass, ...voiced].map((pitch, n) => ({
      id: `${idPrefix}-${index}-${n}`, step: chord.step, pitch, durationSteps: chord.durationSteps,
      velocity: n === 0 ? velocity + 0.05 : velocity,
    }));
  });
  return { notes, chordEvents: [] };
}

const soundFor = (accompaniment: Accompaniment) => ACCOMPANIMENTS.find((item) => item.id === accompaniment)!.soundId;

/** Fit a progression's events to the project's loop. */
function clip(project: Project, events: { notes: NoteEvent[]; chordEvents: ChordEvent[] }) {
  const length = totalSteps(project);
  return {
    notes: events.notes.filter((note) => note.step < length).map((note) => ({ ...note, durationSteps: Math.min(note.durationSteps, length - note.step) })),
    chordEvents: events.chordEvents.filter((event) => event.step < length)
      .map((event) => ({ ...event, durationSteps: Math.min(event.durationSteps, length - event.step) })),
  };
}

/** A project that plays only the melody and the progression, for auditioning before Use. Nothing is saved. */
export function auditionProject(project: Project, sourceChannelId: string, progression: Progression, accompaniment: Accompaniment): Project | undefined {
  const source = project.channels.find((channel) => channel.id === sourceChannelId);
  if (!source) return undefined;
  const events = clip(project, progressionEvents(progression, accompaniment, project.noteLength, 'audition'));
  const chords: Channel = {
    ...createChannel('audition-chords', 'Chords', soundFor(accompaniment), totalSteps(project)),
    ...events,
  };
  return {
    ...project,
    arrangement: [],
    channels: [{ ...source, mute: false, solo: false }, chords],
  };
}

/** "Use": add the progression as its own generated track (the melody is untouched). */
export function addProgressionTrack(project: Project, sourceChannelId: string, progression: Progression, accompaniment: Accompaniment): Project {
  const source = project.channels.find((channel) => channel.id === sourceChannelId);
  if (!source || project.channels.length >= MAX_CHANNELS || !progression.chords.length) return project;
  const accompanimentLabel = ACCOMPANIMENTS.find((item) => item.id === accompaniment)!.label;
  const next = addChannel(project, `${progression.label} chords · ${accompanimentLabel}`, soundFor(accompaniment));
  const channel = next.channels.at(-1);
  if (next === project || !channel) return project;
  const events = clip(next, progressionEvents(progression, accompaniment, next.noteLength, `chords-${channel.id}`));
  return updateChannel(next, channel.id, {
    ...events,
    generatedMetadata: { generatedBy: 'arrangement-assistant', kind: 'chord-suggestions', sourceChannelId, confidence: progression.fit },
  });
}
