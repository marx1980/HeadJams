import { describe, expect, it } from 'vitest';
import { decodeSong, encodeSong, projectForLink, songLink, songPayload } from './songLink';
import { addSampleSound, createChannel, createProject, type Project } from './project';
import { addPersonalInstrument } from './personalInstrument';
import { TEMPLATES } from './templates';

function rich(): Project {
  let p = TEMPLATES.find((item) => item.id === 'rock')!.make();
  p = addSampleSound(p, 'Clap', 'sample-1');
  const sample = p.customSounds.at(-1)!;
  const { project, sound } = addPersonalInstrument(p, 'Voice', [{ sampleId: 'sample-2', rootMidi: 60 }]);
  p = project;
  p = {
    ...p,
    name: 'Shared',
    channels: [
      ...p.channels,
      { ...createChannel('clap', 'Clap', sample.id, 16), steps: Array.from({ length: 16 }, (_, i) => i === 4) },
      { ...createChannel('voice', 'Voice', sound!.id, 16), notes: [{ id: 'n', step: 0, pitch: 60, durationSteps: 4 }],
        original: { soundId: sample.id, offsetSec: 0 }, playOriginal: true },
    ],
  };
  return p;
}

describe('song links', () => {
  it('leaves the user\'s recordings behind', () => {
    const p = rich();
    const shared = projectForLink(p);
    expect(shared.personalInstruments).toBeUndefined();
    expect(shared.customSounds.some((sound) => sound.sampleId || sound.assetSource === 'user-sample')).toBe(false);
    expect(shared.channels.find((c) => c.id === 'voice')?.soundId).toBe('grand-piano');
    expect(shared.channels.find((c) => c.id === 'voice')?.original).toBeUndefined();
    expect(shared.channels.find((c) => c.id === 'clap')?.soundId).toBe(p.channels.find((c) => c.id === 'clap')?.soundId);
  });

  it('round-trips through a link', async () => {
    const p = rich();
    const link = await songLink(p, 'https://example.org/MusicMaker/#old');
    expect(link.startsWith('https://example.org/MusicMaker/#song=1.')).toBe(true);
    const payload = songPayload(new URL(link).hash)!;
    const back = await decodeSong(payload);
    expect(back?.name).toBe('Shared');
    expect(back?.channels.map((c) => c.id)).toEqual(p.channels.map((c) => c.id));
    expect(back?.channels.find((c) => c.id === 'voice')?.notes).toEqual(p.channels.find((c) => c.id === 'voice')?.notes);
    expect(back?.bpm).toBe(p.bpm);
    // Compressed well below the raw JSON.
    expect(payload.length).toBeLessThan(JSON.stringify(projectForLink(p)).length / 2);
  });

  it('rejects broken links', async () => {
    expect(await decodeSong('1.not-base64!')).toBeUndefined();
    expect(await decodeSong('9.abc')).toBeUndefined();
    expect(await encodeSong(createProject())).toMatch(/^1\./);
    expect(songPayload('#other=1')).toBeUndefined();
  });
});
