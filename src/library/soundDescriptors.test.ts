import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DESCRIPTORS, looksLikeBass, rankSounds, SOUND_DESCRIPTORS } from './soundDescriptors';
import { SAMPLED_SOUNDS, STARTER_SOUNDS } from './instrumentRegistry';
import { PUBLIC_DIR } from '../audio/sampler/testing';

const sounds = [...STARTER_SOUNDS, ...SAMPLED_SOUNDS];

describe('find the sound', () => {
  it('describes every melodic and bass sound with known words; sampled manifests carry the same words', () => {
    const words = new Set(DESCRIPTORS.map((word) => word.id));
    for (const [id, list] of Object.entries(SOUND_DESCRIPTORS)) {
      expect(sounds.some((sound) => sound.id === id), id).toBe(true);
      expect(list.every((word) => words.has(word)), id).toBe(true);
    }
    for (const sound of sounds.filter((item) => item.playbackMode === 'notes' && ['Keys', 'Strings', 'Bass', 'Guitars', 'Brass & Winds', 'Synths'].includes(item.category))) {
      expect(SOUND_DESCRIPTORS[sound.id], sound.id).toBeDefined();
    }
    for (const sound of SAMPLED_SOUNDS.filter((item) => item.playbackMode === 'notes')) {
      const manifest = JSON.parse(readFileSync(new URL(`instruments/${sound.instrumentId}/manifest.json`, PUBLIC_DIR), 'utf8'));
      expect(manifest.tags, sound.id).toEqual(SOUND_DESCRIPTORS[sound.id]);
    }
  });

  it('ranks by chosen words, against opposites, preferring real instruments, and keeps bass lines on bass sounds', () => {
    const warmAcoustic = rankSounds(sounds, ['warm', 'acoustic', 'sustained'], { bass: false });
    expect(warmAcoustic[0].sound.instrumentId).toBeDefined();
    expect(warmAcoustic[0].matches).toEqual(expect.arrayContaining(['warm', 'acoustic', 'sustained']));
    expect(warmAcoustic.every((item) => item.matches.length > 0)).toBe(true);
    const brightElectronic = rankSounds(sounds, ['bright', 'electronic', 'punchy'], { bass: false });
    expect(brightElectronic.slice(0, 3).every((item) => item.sound.id.startsWith('lead') || item.sound.id === 'brass-1')).toBe(true);
    const bass = rankSounds(sounds, ['warm'], { bass: true });
    expect(bass.every((item) => item.sound.category === 'Bass' || item.sound.id === 'grand-piano')).toBe(true);
    expect(bass[0].sound.id).toBe('electric-bass');
    expect(rankSounds(sounds, [], { bass: false })[0].sound.instrumentId).toBeDefined();
    expect(rankSounds(sounds, [], { bass: false })).toHaveLength(6);
  });

  it('tells a bass line from a melody', () => {
    expect(looksLikeBass([{ pitch: 36 }, { pitch: 43 }, { pitch: 40 }])).toBe(true);
    expect(looksLikeBass([{ pitch: 60 }, { pitch: 64 }, { pitch: 48 }])).toBe(false);
  });
});
