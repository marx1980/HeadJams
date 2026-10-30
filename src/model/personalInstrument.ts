import type { InstrumentManifest } from '../audio/sampler/manifest';
import type { DecodedRegion } from '../audio/sampler/sampledVoice';
import type { ChordEvent, Project, SoundDef } from './project';
import type { ChordQuality } from './music';

/** Personal instruments (expansion.md E6): your own saved samples played across the keyboard. */

export interface PersonalSample {
  sampleId: string;
  /** The note the recording sounds at. */
  rootMidi: number;
}

/** A recorded whole chord (expansion.md E7). */
export interface RecordedChord {
  sampleId: string;
  /** Root pitch class (0 = C). */
  root: number;
  quality: ChordQuality;
  direction: 'down' | 'up';
}

export interface PersonalInstrument {
  id: string;
  name: string;
  samples: PersonalSample[];
  /** Recorded-chord instruments: whole-chord samples, with a factory guitar for chords not recorded. */
  chords?: RecordedChord[];
  fallback?: string;
}

export const chordArticulation = (root: number, quality: ChordQuality, direction: 'down' | 'up') =>
  `chord-${((root % 12) + 12) % 12}-${quality}-${direction}`;

/** Qualities a missing chord may borrow from, nearest first. */
const COMPATIBLE: Partial<Record<ChordQuality, ChordQuality[]>> = {
  seventh: ['major'], major7: ['major'], minor7: ['minor'], sus2: ['major', 'minor'], sus4: ['major'],
};

/**
 * The recorded chord to play for a chord event (expansion.md E7 lookup order): the exact chord and direction,
 * then the same chord the other way, then a compatible chord on the same root; undefined → build it on the guitar.
 */
export function findRecordedChord(chords: readonly RecordedChord[], root: number, quality: ChordQuality, direction: 'down' | 'up'): RecordedChord | undefined {
  const pc = ((root % 12) + 12) % 12;
  const matching = (q: ChordQuality) => chords.filter((chord) => chord.root === pc && chord.quality === q);
  for (const q of [quality, ...(COMPATIBLE[quality] ?? [])]) {
    const found = matching(q);
    const exact = found.find((chord) => chord.direction === direction) ?? found[0];
    if (exact) return exact;
  }
  return undefined;
}

/** How far a personal instrument stretches its samples (they are often sparse). */
export const PERSONAL_PITCH_LIMIT = 12;
const PERSONAL_PEAK = 0.6;

const fileFor = (sampleId: string) => `sample-${sampleId}`;

/** A sampler manifest for a personal instrument: each sample covers the keys up to halfway to its neighbours. */
export function personalManifest(instrument: PersonalInstrument): InstrumentManifest {
  if (instrument.chords?.length) return chordManifest(instrument, instrument.chords);
  const sorted = [...instrument.samples].sort((a, b) => a.rootMidi - b.rootMidi);
  const unique = sorted.filter((sample, index) => index === 0 || sample.rootMidi !== sorted[index - 1].rootMidi);
  const regions = unique.map((sample, index) => {
    const previous = unique[index - 1];
    const next = unique[index + 1];
    const low = previous ? Math.floor((previous.rootMidi + sample.rootMidi) / 2) + 1 : Math.max(0, sample.rootMidi - PERSONAL_PITCH_LIMIT);
    const high = next ? Math.floor((sample.rootMidi + next.rootMidi) / 2) : Math.min(127, sample.rootMidi + PERSONAL_PITCH_LIMIT);
    return {
      id: `r${index + 1}`, file: fileFor(sample.sampleId), rootMidi: sample.rootMidi, lowMidi: low, highMidi: high,
      velocityLow: 1, velocityHigh: 127, articulation: 'sustain',
    };
  });
  return {
    schemaVersion: 1, id: instrument.id, name: instrument.name, family: 'user', version: 1, engine: 'sampler',
    defaultArticulation: 'sustain', maxPolyphony: 16, pitchShiftLimitSemitones: PERSONAL_PITCH_LIMIT, preloadStrategy: 'all',
    envelope: { mode: 'sustain', attackMs: 2, releaseMs: 150 },
    provenance: {
      source: 'Your recordings', url: 'local', creator: 'You', licence: 'Personal (not shared)', obtained: 'local',
      redistribution: false, modification: true,
    },
    regions,
  };
}

function chordManifest(instrument: PersonalInstrument, chords: readonly RecordedChord[]): InstrumentManifest {
  const seen = new Set<string>();
  const regions = chords.flatMap((chord, index) => {
    const articulation = chordArticulation(chord.root, chord.quality, chord.direction);
    if (seen.has(articulation)) return [];
    seen.add(articulation);
    return [{ id: `c${index + 1}`, file: fileFor(chord.sampleId), rootMidi: 60, lowMidi: 60, highMidi: 60, velocityLow: 1, velocityHigh: 127, articulation }];
  });
  return {
    ...personalManifest({ ...instrument, chords: undefined, samples: [{ sampleId: chords[0].sampleId, rootMidi: 60 }] }),
    defaultArticulation: regions[0].articulation,
    pitchShiftLimitSemitones: 0,
    envelope: { mode: 'sustain', attackMs: 1, releaseMs: 200 },
    regions,
  };
}

/** Decoded audio for a personal instrument's regions, from saved samples. */
export function personalAudio(instrument: PersonalInstrument, samples: ReadonlyMap<string, { samples: Float32Array; sampleRate: number }>): Map<string, DecodedRegion> {
  const audio = new Map<string, DecodedRegion>();
  for (const { sampleId } of [...instrument.samples, ...(instrument.chords ?? [])]) {
    const sample = samples.get(sampleId);
    if (!sample) continue;
    // Recordings arrive at any level: bring each to the same peak as the bundled instruments (about −4 dBFS).
    let peak = 0;
    for (const value of sample.samples) peak = Math.max(peak, Math.abs(value));
    const gain = peak > 0 ? PERSONAL_PEAK / peak : 1;
    audio.set(fileFor(sampleId), { sampleRate: sample.sampleRate, data: sample.samples.map((value) => value * gain) });
  }
  return audio;
}

/** Add a personal instrument and a sound that plays it (category Mine). */
export function addPersonalInstrument(project: Project, name: string, samples: PersonalSample[]): { project: Project; sound?: SoundDef } {
  const valid = samples.filter((sample) => Number.isInteger(sample.rootMidi) && sample.rootMidi >= 0 && sample.rootMidi <= 127);
  if (!valid.length) return { project };
  let number = (project.personalInstruments?.length ?? 0) + 1;
  while ((project.personalInstruments ?? []).some((item) => item.id === `mine-${number}`)) number++;
  const id = `mine-${number}`;
  const instrument: PersonalInstrument = { id, name: name.trim() || `My instrument ${number}`, samples: valid };
  const sound: SoundDef = {
    id, name: instrument.name, category: 'Mine', subcategory: 'My instruments',
    params: { wave: 'sine', freq: 440, freqEnd: 440, decay: 0.5, cutoff: 8000 },
    type: 'pitched', playbackMode: 'notes', instrumentId: id, tags: ['mine'],
    assetSource: 'user-sample', assetAttribution: 'Your recordings', assetLicense: 'Personal',
  };
  return {
    project: { ...project, personalInstruments: [...(project.personalInstruments ?? []), instrument], customSounds: [...project.customSounds, sound] },
    sound,
  };
}

/** The note a recording sounds at: the duration-weighted median of its detected notes. */
export function rootFromNotes(notes: readonly { pitch: number; durationSeconds: number }[]): number | undefined {
  const weighted = notes.filter((note) => Number.isFinite(note.pitch) && note.durationSeconds > 0)
    .map((note) => ({ pitch: Math.round(note.pitch), weight: note.durationSeconds }))
    .sort((a, b) => a.pitch - b.pitch);
  const total = weighted.reduce((sum, note) => sum + note.weight, 0);
  let seen = 0;
  for (const note of weighted) {
    seen += note.weight;
    if (seen >= total / 2) return note.pitch;
  }
  return undefined;
}

/** Add a recorded-chord guitar: chords you recorded play as they are; other chords are built on a factory guitar. */
export function addRecordedChords(project: Project, name: string, chords: RecordedChord[], fallback = 'nylon-guitar'): { project: Project; sound?: SoundDef } {
  if (!chords.length) return { project };
  let number = (project.personalInstruments?.length ?? 0) + 1;
  while ((project.personalInstruments ?? []).some((item) => item.id === `mine-${number}`)) number++;
  const id = `mine-${number}`;
  const instrument: PersonalInstrument = { id, name: name.trim() || `My chords ${number}`, samples: [], chords, fallback };
  const sound: SoundDef = {
    id, name: instrument.name, category: 'Mine', subcategory: 'My chords',
    params: { wave: 'triangle', freq: 220, freqEnd: 220, decay: 0.45, cutoff: 5000 },
    type: 'chord', playbackMode: 'chord', instrumentId: fallback, recordedChordsId: id, tags: ['mine'],
    assetSource: 'user-sample', assetAttribution: 'Your recordings', assetLicense: 'Personal',
  };
  return {
    project: { ...project, personalInstruments: [...(project.personalInstruments ?? []), instrument], customSounds: [...project.customSounds, sound] },
    sound,
  };
}

/** The recorded chord a chord event plays, or undefined when it is built on the guitar (muted strokes and arpeggios are built). */
export function recordedChordFor(chords: readonly RecordedChord[], event: Pick<ChordEvent, 'root' | 'quality' | 'articulation' | 'strings'>): RecordedChord | undefined {
  if (event.articulation === 'muted' || event.articulation === 'power' || event.strings?.length) return undefined;
  return findRecordedChord(chords, event.root, event.quality, event.articulation === 'up-strum' ? 'up' : 'down');
}
