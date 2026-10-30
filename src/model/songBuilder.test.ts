import { describe, expect, it } from 'vitest';
import { buildSong, channelRole, mutedForDensity, templateSections } from './songBuilder';
import { addPattern, channelsForPlaybackStep, createChannel, createProject, type Project } from './project';
import { addKitChannel, findDrumKit } from '../library/drumKits';
import { withNextPhrase } from './phraseProject';

function band(): Project {
  let p = { ...createProject('s'), loopBars: 1 as never, channels: [] } as Project;
  p = addKitChannel(p, findDrumKit('acoustic-kit')!);
  p.channels = [
    ...p.channels,
    { ...createChannel('bass', 'Bass', 'electric-bass', 16), notes: [{ id: 'b', step: 0, pitch: 36, durationSteps: 4 }] },
    { ...createChannel('gtr', 'Guitar', 'nylon-chords', 16) },
    { ...createChannel('mel', 'Melody', 'grand-piano', 16), notes: [{ id: 'm', step: 0, pitch: 60, durationSteps: 4 }] },
    { ...createChannel('har', 'Harmony', 'strings', 16), generatedMetadata: { generatedBy: 'arrangement-assistant', kind: 'harmony-generation', sourceChannelId: 'mel', confidence: 1 } },
  ];
  return p;
}

describe('song builder', () => {
  it('knows what each track does and what drops out in smaller sections', () => {
    const p = band();
    expect(p.channels.map((c) => channelRole(p, c))).toEqual(['drums', 'bass', 'chords', 'melody', 'extra']);
    expect(mutedForDensity(p, p.channels, 'full')).toEqual([]);
    expect(mutedForDensity(p, p.channels, 'medium')).toEqual(['har']);
    expect(mutedForDensity(p, p.channels, 'sparse')).toEqual([p.channels[0].id, 'bass', 'har']);
    const drumsOnly = { ...p, channels: [p.channels[0]] };
    expect(mutedForDensity(drumsOnly, drumsOnly.channels, 'sparse')).toEqual([]);
  });

  it('builds a full song from one loop: the loop becomes a pattern and sections set what plays', () => {
    const p = band();
    const sections = templateSections(p, 'full');
    expect(sections.map((s) => [s.name, s.density])).toEqual([
      ['Intro', 'sparse'], ['Verse', 'medium'], ['Chorus', 'full'], ['Verse', 'medium'], ['Chorus', 'full'], ['Outro', 'sparse'],
    ]);
    const song = buildSong(p, sections);
    expect(song.patterns).toHaveLength(1);
    expect(song.arrangement.map((clip) => [clip.section, clip.startStep, clip.lengthSteps])).toEqual([
      ['Intro', 0, 16], ['Verse', 16, 16], ['Chorus', 32, 16], ['Verse', 48, 16], ['Chorus', 64, 16], ['Outro', 80, 16],
    ]);
    const playing = (step: number) => channelsForPlaybackStep(song, step)[0].channels.map((c) => c.id);
    expect(playing(0)).toEqual(['gtr', 'mel']);
    expect(playing(20)).not.toContain('har');
    expect(playing(36)).toContain('har');
    expect(playing(36)).toHaveLength(5);
  });

  it('uses the second pattern for choruses, and replaces any earlier arrangement', () => {
    const withB = withNextPhrase(band(), 'mel', [{ id: 'x', step: 0, pitch: 64, durationSteps: 4 }], 'B');
    const sections = templateSections(withB, 'full');
    expect(sections.filter((s) => s.name === 'Chorus').every((s) => s.patternId === withB.patterns[1].id)).toBe(true);
    const song = buildSong(withB, templateSections(withB, 'short'));
    expect(song.arrangement.map((clip) => clip.patternId)).toEqual([withB.patterns[0].id, withB.patterns[1].id]);
    expect(buildSong(addPattern(band(), 'P'), templateSections(band(), 'loop')).arrangement).toHaveLength(4);
  });
});
