import type { InstrumentManifest } from '../audio/sampler/manifest';
import type { DecodedRegion } from '../audio/sampler/sampledVoice';
import type { Project, SoundDef } from './project';

/** Personal instruments (expansion.md E6): your own saved samples played across the keyboard. */

export interface PersonalSample {
  sampleId: string;
  /** The note the recording sounds at. */
  rootMidi: number;
}

export interface PersonalInstrument {
  id: string;
  name: string;
  samples: PersonalSample[];
}

/** How far a personal instrument stretches its samples (they are often sparse). */
export const PERSONAL_PITCH_LIMIT = 12;
const PERSONAL_PEAK = 0.6;

const fileFor = (sampleId: string) => `sample-${sampleId}`;

/** A sampler manifest for a personal instrument: each sample covers the keys up to halfway to its neighbours. */
export function personalManifest(instrument: PersonalInstrument): InstrumentManifest {
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

/** Decoded audio for a personal instrument's regions, from saved samples. */
export function personalAudio(instrument: PersonalInstrument, samples: ReadonlyMap<string, { samples: Float32Array; sampleRate: number }>): Map<string, DecodedRegion> {
  const audio = new Map<string, DecodedRegion>();
  for (const { sampleId } of instrument.samples) {
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
