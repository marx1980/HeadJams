import type { SoundDef } from '../model/project';
import { STARTER_SOUNDS } from './sounds';

export type SoundGroup = 'Keys' | 'Guitars' | 'Strings' | 'Brass & Winds' | 'Synths' | 'Bass' | 'Drums' | 'Percussion' | 'FX & Other' | 'Samples';
export type SoundSourceDescriptor =
  | { kind: 'synth' }
  | { kind: 'sample'; sampleId: string };

export interface InstrumentDefinition extends SoundDef {
  group: SoundGroup;
  subgroup: string;
  soundType: 'pitched' | 'percussion';
  playbackMode: 'notes' | 'one-shot';
  source: SoundSourceDescriptor;
  version: 1;
  available: boolean;
}

export interface RegistryIssue {
  code: 'duplicate-id' | 'missing-asset';
  soundId: string;
}

export interface InstrumentRegistry {
  entries: InstrumentDefinition[];
  issues: RegistryIssue[];
}

export const LEGACY_SOUND_ID_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(STARTER_SOUNDS.map((sound) => [sound.id, sound.id])),
);

export function migrateSoundId(id: string): string {
  return LEGACY_SOUND_ID_MAP[id] ?? id;
}

function groupFor(sound: SoundDef): SoundGroup {
  switch (sound.category) {
    case 'Drums': return 'Drums';
    case 'Percussion': return 'Percussion';
    case 'Bass': return 'Bass';
    case 'Lead':
    case 'Mine': return 'Synths';
    case 'Samples': return 'Samples';
    default: return 'FX & Other';
  }
}

export function validateInstrumentRegistry(
  entries: InstrumentDefinition[],
  availableSampleIds?: ReadonlySet<string>,
): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) issues.push({ code: 'duplicate-id', soundId: entry.id });
    seen.add(entry.id);
    if (entry.source.kind === 'sample' && availableSampleIds && !availableSampleIds.has(entry.source.sampleId)) {
      issues.push({ code: 'missing-asset', soundId: entry.id });
    }
  }
  return issues;
}

export function createInstrumentRegistry(
  sounds: SoundDef[],
  availableSampleIds?: ReadonlySet<string>,
): InstrumentRegistry {
  const entries = sounds.map((sound): InstrumentDefinition => {
    const group = groupFor(sound);
    const source: SoundSourceDescriptor = sound.sampleId
      ? { kind: 'sample', sampleId: sound.sampleId }
      : { kind: 'synth' };
    const soundType = group === 'Drums' || group === 'Percussion' ? 'percussion' : 'pitched';
    return {
      ...sound,
      id: migrateSoundId(sound.id),
      group,
      subgroup: sound.category,
      soundType,
      playbackMode: soundType === 'percussion' ? 'one-shot' : 'notes',
      source,
      version: 1,
      available: source.kind !== 'sample' || !availableSampleIds || availableSampleIds.has(source.sampleId),
    };
  });
  const issues = validateInstrumentRegistry(entries, availableSampleIds);
  const unique = new Map<string, InstrumentDefinition>();
  for (const entry of entries) if (!unique.has(entry.id)) unique.set(entry.id, entry);
  return { entries: [...unique.values()], issues };
}
