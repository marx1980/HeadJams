import { describe, expect, it } from 'vitest';
import { STARTER_SOUNDS } from '../library/sounds';
import { resolveSoundSource } from './soundSource';

describe('sound sources', () => {
  it('resolves built-in sounds to synth sources', () => {
    expect(resolveSoundSource(STARTER_SOUNDS[0])).toEqual({ kind: 'synth', params: STARTER_SOUNDS[0].params });
  });

  it('resolves sample sounds with a safe root frequency', () => {
    const sound = { ...STARTER_SOUNDS[0], sampleId: 'sample-1', params: { ...STARTER_SOUNDS[0].params, freq: 0 } };
    expect(resolveSoundSource(sound)).toEqual({ kind: 'sample', sampleId: 'sample-1', rootFrequency: 10 });
  });
});
