import type { PlaybackMode, SoundDef, SoundType, SynthParams } from '../model/project';

export interface InstrumentRegistryEntry {
  id: string;
  sound: SoundDef;
  origin: 'built-in' | 'custom';
  source: 'synth' | 'sample';
  group: string;
  subgroup?: string;
  type: SoundType;
  playbackMode: PlaybackMode;
}

export interface InstrumentRegistryIssue {
  type: 'duplicate-id' | 'invalid-sample-id' | 'missing-sample';
  id: string;
}

export function soundLibraryGroup(sound: SoundDef): string {
  if (sound.category === 'Synths') return 'Synths';
  if (sound.category === 'Lead') return 'Synths';
  if (sound.category === 'FX') return 'FX & Other';
  return sound.category;
}

function starterSubgroup(id: string, category: string): string | undefined {
  const group = category === 'Lead' ? 'Synths' : category === 'FX' ? 'FX & Other' : category;
  if (group === 'Drums') {
    if (id.startsWith('kick-')) return 'Kick';
    if (id.startsWith('snare-')) return 'Snare';
    if (id.startsWith('hat-')) return 'Hi-Hat';
    if (id.startsWith('tom-')) return 'Toms';
    if (id.startsWith('cymbal-')) return 'Cymbal';
    if (id.startsWith('clap-')) return 'Clap';
  }
  if (group === 'Percussion') {
    if (['perc-3', 'perc-7', 'perc-8'].includes(id)) return 'Shakers';
    if (['perc-4', 'perc-5'].includes(id)) return 'Hand Percussion';
    return 'Auxiliary';
  }
  if (group === 'Keys') return id === 'keys-3' ? 'Other Keys' : 'Piano';
  if (group === 'Strings') return id === 'strings-3' ? 'Ensemble' : 'Solo';
  if (group === 'Guitars') return id.startsWith('guitar-acoustic') ? 'Acoustic' : 'Electric';
  if (group === 'Bass') return id === 'bass-6' || id === 'bass-7' || id === 'bass-8' ? 'Electric' : 'Synth';
  if (group === 'Synths') {
    if (id === 'lead-8') return 'Pad';
    if (id === 'lead-9') return 'Pluck';
    return 'Lead';
  }
  if (group === 'Brass & Winds') return id === 'brass-1' ? 'Brass' : 'Woodwind';
  if (group === 'FX & Other') return 'FX';
  return undefined;
}

const s = (id: string, name: string, category: string, wave: SynthParams['wave'], freq: number, freqEnd: number, decay: number, cutoff: number): SoundDef => ({
  id,
  name,
  category: category === 'Lead' ? 'Synths' : category,
  params: { wave, freq, freqEnd, decay, cutoff },
  subcategory: starterSubgroup(id, category),
  type: ['Drums', 'Percussion', 'FX'].includes(category) ? 'percussion' : 'pitched',
  playbackMode: ['Drums', 'Percussion', 'FX'].includes(category) ? 'one-shot' : 'notes',
  assetSource: 'procedural',
  assetAttribution: 'MusicMaker procedural synthesizer',
  assetLicense: 'Original procedural synthesis; no third-party audio asset',
});

const guitarChord = (id: string, name: string, wave: SynthParams['wave'], freq: number, decay: number, cutoff: number): SoundDef => ({
  ...s(id, name, 'Guitars', wave, freq, freq, decay, cutoff),
  subcategory: 'Chords',
  type: 'chord',
  playbackMode: 'chord',
});

export const STARTER_SOUNDS: SoundDef[] = [
  s('kick-1', 'Kick Deep', 'Drums', 'sine', 150, 45, 0.35, 8000),
  s('kick-2', 'Kick Punch', 'Drums', 'sine', 200, 55, 0.25, 12000),
  s('kick-3', 'Kick Soft', 'Drums', 'triangle', 120, 50, 0.3, 3000),
  s('kick-4', 'Kick Boom', 'Drums', 'sine', 100, 35, 0.6, 5000),
  s('snare-1', 'Snare Crisp', 'Drums', 'noise', 200, 200, 0.18, 9000),
  s('snare-2', 'Snare Fat', 'Drums', 'noise', 200, 200, 0.28, 5000),
  s('snare-3', 'Snare Tight', 'Drums', 'noise', 200, 200, 0.1, 12000),
  s('clap-1', 'Clap', 'Drums', 'noise', 200, 200, 0.15, 7000),
  s('clap-2', 'Clap Long', 'Drums', 'noise', 200, 200, 0.3, 6000),
  s('hat-1', 'Hat Closed', 'Drums', 'noise', 200, 200, 0.05, 20000),
  s('hat-2', 'Hat Tight', 'Drums', 'noise', 200, 200, 0.03, 18000),
  s('hat-3', 'Hat Open', 'Drums', 'noise', 200, 200, 0.3, 20000),
  s('hat-4', 'Hat Soft', 'Drums', 'noise', 200, 200, 0.07, 9000),
  s('tom-1', 'Tom Low', 'Drums', 'sine', 130, 80, 0.35, 6000),
  s('tom-2', 'Tom Mid', 'Drums', 'sine', 190, 120, 0.3, 6000),
  s('tom-3', 'Tom High', 'Drums', 'sine', 260, 170, 0.25, 6000),
  s('perc-1', 'Rim', 'Percussion', 'square', 800, 700, 0.04, 6000),
  s('perc-2', 'Cowbell', 'Percussion', 'square', 560, 540, 0.2, 4000),
  s('perc-3', 'Shaker', 'Percussion', 'noise', 200, 200, 0.12, 14000),
  s('kick-5', 'Kick Electronic', 'Drums', 'sine', 95, 35, 0.45, 6000),
  s('snare-4', 'Snare Deep', 'Drums', 'noise', 200, 200, 0.35, 3500),
  s('hat-5', 'Hat Pedal', 'Drums', 'noise', 200, 200, 0.045, 10000),
  s('cymbal-1', 'Cymbal Crash', 'Drums', 'noise', 200, 200, 0.9, 16000),
  s('cymbal-2', 'Cymbal Ride', 'Drums', 'noise', 200, 200, 0.55, 13000),
  s('perc-4', 'Conga Low', 'Percussion', 'sine', 180, 100, 0.45, 4000),
  s('perc-5', 'Bongo High', 'Percussion', 'sine', 420, 260, 0.22, 5000),
  s('perc-6', 'Woodblock', 'Percussion', 'square', 900, 800, 0.08, 5000),
  s('perc-7', 'Tambourine', 'Percussion', 'noise', 200, 200, 0.18, 14000),
  s('keys-1', 'Soft Keys', 'Keys', 'sine', 440, 440, 0.45, 6000),
  s('keys-2', 'Bright Keys', 'Keys', 'triangle', 660, 660, 0.25, 10000),
  s('keys-3', 'Organ Synth', 'Keys', 'square', 330, 330, 0.7, 5000),
  s('strings-1', 'Strings Sustained', 'Strings', 'triangle', 440, 440, 0.8, 5000),
  s('strings-2', 'Strings Pluck', 'Strings', 'saw', 330, 330, 0.3, 3000),
  s('strings-3', 'Strings Pad', 'Strings', 'sine', 220, 220, 1, 2500),
  s('brass-1', 'Brass Synth', 'Brass & Winds', 'saw', 440, 440, 0.5, 4000),
  s('brass-2', 'Flute Synth', 'Brass & Winds', 'sine', 660, 660, 0.6, 8000),
  s('brass-3', 'Reed Synth', 'Brass & Winds', 'square', 392, 392, 0.4, 3500),
  s('guitar-acoustic-1', 'Nylon Guitar · Synth', 'Guitars', 'triangle', 330, 330, 0.35, 4500),
  s('guitar-acoustic-2', 'Steel Guitar · Synth', 'Guitars', 'saw', 392, 392, 0.28, 6500),
  s('guitar-electric-1', 'Clean Electric Guitar · Synth', 'Guitars', 'triangle', 440, 440, 0.4, 5000),
  s('guitar-electric-2', 'Muted Electric Guitar · Synth', 'Guitars', 'square', 330, 330, 0.12, 2800),
  s('guitar-electric-3', 'Guitar Harmonics · Synth', 'Guitars', 'sine', 880, 880, 0.5, 9000),
  guitarChord('guitar-chord-acoustic', 'Acoustic Chord · Synth', 'triangle', 220, 0.45, 5000),
  guitarChord('guitar-chord-clean', 'Clean Electric Chord · Synth', 'triangle', 247, 0.4, 5500),
  guitarChord('guitar-chord-crunch', 'Crunch Chord · Synth', 'saw', 196, 0.35, 3600),
  guitarChord('guitar-chord-power', 'Distorted Power Chord · Synth', 'square', 146, 0.3, 3000),
  s('bass-6', 'Bass Finger', 'Bass', 'triangle', 73, 73, 0.32, 2200),
  s('bass-7', 'Bass Pick', 'Bass', 'square', 82, 82, 0.24, 1800),
  s('bass-8', 'Bass Slap', 'Bass', 'saw', 98, 98, 0.16, 3200),
  s('lead-6', 'Analog Lead', 'Lead', 'saw', 440, 440, 0.3, 3800),
  s('lead-7', 'Digital Lead', 'Lead', 'square', 523, 523, 0.24, 7000),
  s('lead-8', 'Warm Pad', 'Lead', 'triangle', 330, 330, 0.9, 2400),
  s('lead-9', 'Soft Pluck', 'Lead', 'sine', 660, 660, 0.2, 5500),
  s('kick-6', 'Kick 808', 'Drums', 'sine', 85, 28, 0.55, 5000),
  s('snare-5', 'Snare Rimshot', 'Drums', 'noise', 200, 200, 0.12, 11500),
  s('perc-8', 'Maraca', 'Percussion', 'noise', 200, 200, 0.1, 15000),
  s('bass-1', 'Bass Sub', 'Bass', 'sine', 55, 55, 0.5, 4000),
  s('bass-2', 'Bass Saw', 'Bass', 'saw', 55, 55, 0.4, 1200),
  s('bass-3', 'Bass Square', 'Bass', 'square', 65, 65, 0.35, 900),
  s('bass-4', 'Bass Pluck', 'Bass', 'saw', 82, 82, 0.2, 1500),
  s('bass-5', 'Bass Wobble', 'Bass', 'triangle', 110, 55, 0.45, 2000),
  s('lead-1', 'Lead Square', 'Lead', 'square', 440, 440, 0.35, 5000),
  s('lead-2', 'Lead Saw', 'Lead', 'saw', 523, 523, 0.4, 6000),
  s('lead-3', 'Lead Soft', 'Lead', 'triangle', 392, 392, 0.5, 8000),
  s('lead-4', 'Lead Bell', 'Lead', 'sine', 880, 880, 0.6, 12000),
  s('lead-5', 'Lead Zap', 'FX', 'saw', 1200, 300, 0.2, 9000),
  s('fx-1', 'Laser', 'FX', 'square', 2000, 200, 0.3, 8000),
];

const acoustic = (piece: string, name: string, note: number, extra: Partial<SoundDef> = {}): SoundDef => ({
  id: `acoustic-${piece}`,
  name,
  category: 'Drums',
  subcategory: 'Acoustic kit',
  params: { wave: 'noise', freq: 200, freqEnd: 200, decay: 0.3, cutoff: 12000 },
  type: 'percussion',
  playbackMode: 'one-shot',
  instrumentId: 'acoustic-kit',
  instrumentNote: note,
  tags: ['acoustic', 'sampled'],
  assetAttribution: 'Big Rusty Drums by Karoryfer Samples',
  assetLicense: 'CC0-1.0',
  ...extra,
});

const sampledGuitar = (
  id: string, name: string, instrumentId: 'nylon-guitar' | 'clean-guitar', chords: boolean, extra: Partial<SoundDef> = {},
): SoundDef => ({
  id,
  name,
  category: 'Guitars',
  subcategory: chords ? 'Chords' : instrumentId === 'nylon-guitar' ? 'Acoustic' : 'Electric',
  params: { wave: 'triangle', freq: 220, freqEnd: 220, decay: 0.45, cutoff: 5000 },
  type: chords ? 'chord' : 'pitched',
  playbackMode: chords ? 'chord' : 'notes',
  instrumentId,
  tags: ['guitar', 'sampled'],
  assetAttribution: instrumentId === 'nylon-guitar'
    ? 'Spanish Classical Guitar by roberto@zenvoid.org (FreePats)'
    : 'Emily Guitar by Karoryfer Samples',
  assetLicense: 'CC0-1.0',
  ...extra,
});

/** Built-in sounds played by sampled instruments (app/public/instruments). */
export const SAMPLED_SOUNDS: SoundDef[] = [
  acoustic('kick', 'Acoustic Kick', 36),
  acoustic('snare', 'Acoustic Snare', 38),
  acoustic('sidestick', 'Acoustic Side Stick', 37),
  acoustic('hat-closed', 'Acoustic Hat Closed', 42),
  acoustic('hat-pedal', 'Acoustic Hat Pedal', 44),
  acoustic('hat-half', 'Acoustic Hat Half-Open', 45),
  acoustic('hat-open', 'Acoustic Hat Open', 46),
  acoustic('tom-high', 'Acoustic Tom High', 50),
  acoustic('tom-mid', 'Acoustic Tom Mid', 48),
  acoustic('tom-low', 'Acoustic Tom Low', 43),
  acoustic('crash', 'Acoustic Crash', 49),
  acoustic('ride', 'Acoustic Ride', 51),
  acoustic('ride-bell', 'Acoustic Ride Bell', 53),
  sampledGuitar('nylon-guitar', 'Nylon Guitar', 'nylon-guitar', false),
  sampledGuitar('nylon-chords', 'Nylon Chords', 'nylon-guitar', true),
  sampledGuitar('clean-guitar', 'Clean Electric Guitar', 'clean-guitar', false),
  sampledGuitar('clean-chords', 'Clean Electric Chords', 'clean-guitar', true),
  sampledGuitar('clean-chords-tight', 'Clean Electric Chords Tight', 'clean-guitar', true, { chordRing: 'tight' }),
];

export function createInstrumentRegistry(customSounds: readonly SoundDef[]): InstrumentRegistryEntry[] {
  return [
    ...STARTER_SOUNDS.map((sound) => ({ id: sound.id, sound, origin: 'built-in' as const })),
    ...SAMPLED_SOUNDS.map((sound) => ({ id: sound.id, sound, origin: 'built-in' as const })),
    ...customSounds.map((sound) => ({ id: sound.id, sound, origin: 'custom' as const })),
  ].map((entry) => ({
    ...entry,
    source: entry.sound.sampleId ? 'sample' : 'synth',
    group: soundLibraryGroup(entry.sound),
    subgroup: entry.sound.subcategory,
    type: entry.sound.type ?? (entry.sound.sampleId ? 'percussion' : 'pitched'),
    playbackMode: entry.sound.playbackMode ?? (entry.sound.sampleId ? 'one-shot' : 'notes'),
  }));
}

export function validateInstrumentRegistry(
  entries: readonly InstrumentRegistryEntry[],
  availableSampleIds?: ReadonlySet<string>,
): InstrumentRegistryIssue[] {
  const issues: InstrumentRegistryIssue[] = [];
  const seenIds = new Set<string>();

  for (const entry of entries) {
    if (seenIds.has(entry.id)) issues.push({ type: 'duplicate-id', id: entry.id });
    seenIds.add(entry.id);

    if (entry.sound.sampleId !== undefined) {
      if (!entry.sound.sampleId.trim()) issues.push({ type: 'invalid-sample-id', id: entry.id });
      else if (availableSampleIds && !availableSampleIds.has(entry.sound.sampleId)) {
        issues.push({ type: 'missing-sample', id: entry.id });
      }
    }
  }

  return issues;
}
