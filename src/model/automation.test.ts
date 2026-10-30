import { describe, expect, it } from 'vitest';
import { createChannel, createProject, setLoopBars, type Project } from './project';
import {
  automatedMix, clearAutomation, moveAutomationPoint, nextFreeAutomationBar, normalizeAutomation, removeAutomationPoint, setAutomationPoint,
} from './automation';
import { compileStep } from '../audio/performance';
import { renderProject } from '../audio/render';

function song(): Project {
  const base = setLoopBars({ ...createProject('Auto'), bpm: 120, noteLength: 4 }, 4);
  return { ...base, channels: [{ ...createChannel('k', 'Kick', 'kick-1', 16), volume: 0.8, pan: 0.2, steps: Array.from({ length: 16 }, () => true) }] };
}

describe('automation', () => {
  it('leaves the track alone without points', () => {
    expect(automatedMix(song(), song().channels[0], 5)).toEqual({ volume: 0.8, pan: 0.2 });
  });

  it('volume is a share of the track volume, in a line between bars, held before and after', () => {
    let p = setAutomationPoint(song(), 'k', 'volume', 1, 1);
    p = setAutomationPoint(p, 'k', 'volume', 3, 0);
    const channel = p.channels[0];
    expect(automatedMix(p, channel, 0).volume).toBeCloseTo(0.8, 9);
    expect(automatedMix(p, channel, 4).volume).toBeCloseTo(0.8, 9);
    expect(automatedMix(p, channel, 8).volume).toBeCloseTo(0.4, 9);
    expect(automatedMix(p, channel, 12).volume).toBeCloseTo(0, 9);
    expect(automatedMix(p, channel, 15).volume).toBeCloseTo(0, 9);
  });

  it('pan replaces the track pan and is clamped', () => {
    let p = setAutomationPoint(song(), 'k', 'pan', 0, -3);
    p = setAutomationPoint(p, 'k', 'pan', 4, 1);
    expect(p.automation?.[0].points[0].value).toBe(-1);
    expect(automatedMix(p, p.channels[0], 8).pan).toBeCloseTo(0, 9);
  });

  it('playback and export both use it', () => {
    let p = setAutomationPoint(song(), 'k', 'volume', 2, 1);
    p = setAutomationPoint(p, 'k', 'volume', 3, 0);
    expect(compileStep(p, 13, (steps) => steps)[0].volume).toBe(0);
    const sr = 8000;
    const { left } = renderProject(p, sr);
    const peak = (from: number, to: number) => { let max = 0; for (let i = Math.round(from * sr); i < Math.round(to * sr); i++) max = Math.max(max, Math.abs(left[i])); return max; };
    // 120 BPM, four steps per bar: a bar is 2 s. Bar 4 (6–8 s) is silent; bar 1 plays.
    expect(peak(0, 1.9)).toBeGreaterThan(0.01);
    expect(peak(6.05, 8)).toBe(0);
  });

  it('edits: one point per bar up to the end of the song, move, remove, clear', () => {
    let p = setAutomationPoint(song(), 'k', 'volume', 4, 0.5);
    expect(setAutomationPoint(p, 'k', 'volume', 5, 0.5)).toBe(p);
    expect(setAutomationPoint(p, 'nope', 'volume', 1, 0.5)).toBe(p);
    expect(nextFreeAutomationBar(p, 'k', 'volume')).toBe(0);
    p = moveAutomationPoint(p, 'k', 'volume', 4, 2);
    expect(p.automation?.[0].points).toEqual([{ bar: 2, value: 0.5 }]);
    p = setAutomationPoint(p, 'k', 'pan', 1, 0.5);
    p = removeAutomationPoint(p, 'k', 'volume', 2);
    expect(p.automation?.map((lane) => lane.param)).toEqual(['pan']);
    p = clearAutomation(p, 'k', 'pan');
    expect(p.automation).toBeUndefined();
  });

  it('loads only valid lanes', () => {
    expect(normalizeAutomation([
      { channelId: 'k', param: 'volume', points: [{ bar: 2, value: 3 }, { bar: -1, value: 0 }, { bar: 1, value: 0.5 }] },
      { channelId: 'k', param: 'tone', points: [{ bar: 1, value: 1 }] },
    ])).toEqual([{ channelId: 'k', param: 'volume', points: [{ bar: 1, value: 0.5 }, { bar: 2, value: 1 }] }]);
  });
});
