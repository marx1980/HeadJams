import type { SoundDef, SynthParams } from '../model/project';

export interface InstrumentRegistryEntry {
  id: string;
  sound: SoundDef;
  origin: 'built-in' | 'custom';
  source: 'synth' | 'sample';
  group: string;
}

export interface InstrumentRegistryIssue {
  type: 'duplicate-id' | 'invalid-sample-id' | 'missing-sample';
  id: string;
}

const s = (id: string, name: string, category: string, wave: SynthParams['wave'], freq: number, freqEnd: number, decay: number, cutoff: number): SoundDef => ({
  id, name, category, params: { wave, freq, freqEnd, decay, cutoff },
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

export function createInstrumentRegistry(customSounds: readonly SoundDef[]): InstrumentRegistryEntry[] {
  return [
    ...STARTER_SOUNDS.map((sound) => ({ id: sound.id, sound, origin: 'built-in' as const })),
    ...customSounds.map((sound) => ({ id: sound.id, sound, origin: 'custom' as const })),
  ].map((entry) => ({
    ...entry,
    source: entry.sound.sampleId ? 'sample' : 'synth',
    group: entry.sound.category,
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
