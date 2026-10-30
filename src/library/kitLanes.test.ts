import { describe, expect, it } from 'vitest';
import { addKitChannel, DRUM_KITS, findDrumKit, setKitChannelKit } from './drumKits';
import { createProject, duplicateChannel, setLoopBars, setNoteLength, toggleLaneStep, totalSteps } from '../model/project';
import { compileStep, type HitVoice } from '../audio/performance';
import { instrumentNeeds } from '../audio/sampler/instrumentStore';

const kitProject = () => {
  const p = addKitChannel({ ...createProject('k'), channels: [] }, findDrumKit('acoustic-kit')!);
  return { p, id: p.channels[0].id };
};

describe('kit channel with lanes', () => {
  it('holds a whole kit on one channel', () => {
    const { p } = kitProject();
    expect(p.channels).toHaveLength(1);
    const channel = p.channels[0];
    expect(channel.kitId).toBe('acoustic-kit');
    expect(channel.lanes!.map((lane) => lane.id)).toEqual(findDrumKit('acoustic-kit')!.lanes.map((lane) => lane.id));
    expect(channel.lanes!.every((lane) => lane.steps.length === totalSteps(p))).toBe(true);
    for (const kit of DRUM_KITS) expect(kit.lanes.length).toBeGreaterThan(0);
  });

  it('plays each lane with its own sound through the channel mixer, and loads only what is used', () => {
    let { p, id } = kitProject();
    p = toggleLaneStep(p, id, 'kick', 0);
    p = toggleLaneStep(p, id, 'hat-closed', 0);
    p = toggleLaneStep(p, id, 'snare', 4);
    const voices = compileStep(p, 0, (s) => s * 0.125) as HitVoice[];
    expect(voices.map((v) => [v.kind, v.sound.id, v.channelId])).toEqual([['hit', 'acoustic-kick', id], ['hit', 'acoustic-hat-closed', id]]);
    expect((compileStep(p, 4, (s) => s * 0.125) as HitVoice[]).map((v) => v.sound.id)).toEqual(['acoustic-snare']);
    expect([...instrumentNeeds(p).get('acoustic-kit')!].sort()).toEqual([36, 38, 42]);
    const muted = { ...p, channels: p.channels.map((c) => ({ ...c, lanes: c.lanes!.map((l) => l.id === 'kick' ? { ...l, mute: true } : l) })) };
    expect((compileStep(muted, 0, (s) => s * 0.125) as HitVoice[]).map((v) => v.sound.id)).toEqual(['acoustic-hat-closed']);
  });

  it('follows loop and grid changes, duplicates, and switches kit keeping the steps', () => {
    let { p, id } = kitProject();
    p = toggleLaneStep(p, id, 'kick', 8);
    p = setLoopBars(p, 2);
    expect(p.channels[0].lanes![0].steps).toHaveLength(32);
    p = setNoteLength(p, 8);
    expect(p.channels[0].lanes![0].steps.findIndex(Boolean)).toBe(4);
    p = duplicateChannel(p, id);
    expect(p.channels[1].lanes![0].steps).toEqual(p.channels[0].lanes![0].steps);
    expect(p.channels[1].lanes).not.toBe(p.channels[0].lanes);
    const studio = setKitChannelKit(p, id, findDrumKit('studio-kit')!);
    const lanes = studio.channels[0].lanes!;
    expect(lanes.find((l) => l.id === 'kick')!.soundId).toBe('kick-1');
    expect(lanes.find((l) => l.id === 'kick')!.steps.findIndex(Boolean)).toBe(4);
    expect(lanes.find((l) => l.id === 'ride')!.soundId).toBe('acoustic-ride');
    expect(lanes.some((l) => l.id === 'clap')).toBe(true);
    expect(studio.channels[0].kitId).toBe('studio-kit');
    expect(studio.channels[0].name).toBe('Studio Kit');
  });
});
