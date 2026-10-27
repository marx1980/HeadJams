import type { SoundDef } from '../model/project';
import { renderSound } from './sounds';
import { resampleSample, type SampleData } from './sampleStorage';

export type SoundSource =
  | {
    kind: 'synth';
    cacheKey: string;
    load: (sampleRate: number) => Float32Array;
  }
  | {
    kind: 'sample';
    cacheKey: string;
    sampleId: string;
    load: (sampleRate: number, getSample: (id: string) => SampleData | undefined) => Float32Array | undefined;
  };

export function createSoundSource(sound: SoundDef): SoundSource {
  if (sound.sampleId) {
    return {
      kind: 'sample',
      cacheKey: `sample:${sound.id}:${sound.sampleId}:${sound.sampleVersion ?? 'processed'}:${JSON.stringify(sound.params)}`,
      sampleId: sound.sampleId,
      load: (sampleRate, getSample) => {
        const sample = getSample(sound.sampleId!);
        const data = sound.sampleVersion === 'original' ? sample?.originalSamples ?? sample?.samples : sample?.samples;
        return sample && data ? resampleSample(data, sample.sampleRate, sampleRate) : undefined;
      },
    };
  }

  return {
    kind: 'synth',
    cacheKey: `synth:${sound.id}:${JSON.stringify(sound.params)}`,
    load: (sampleRate) => renderSound(sound.params, sampleRate),
  };
}
