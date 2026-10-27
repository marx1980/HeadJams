import type { SoundDef, SynthParams } from '../model/project';

export type SoundSource =
  | { kind: 'synth'; params: SynthParams }
  | { kind: 'sample'; sampleId: string; rootFrequency: number };

export function resolveSoundSource(sound: SoundDef): SoundSource {
  return sound.sampleId
    ? { kind: 'sample', sampleId: sound.sampleId, rootFrequency: Math.max(10, sound.params.freq) }
    : { kind: 'synth', params: sound.params };
}
