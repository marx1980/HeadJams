import { describe, expect, it } from 'vitest';
import { pickVideoType, videoFrame, videoPlan } from './videoPlan';
import { addArrangementClip, addPattern, createChannel, createProject, setLoopBars } from '../model/project';

describe('video plan', () => {
  it('repeats a short loop to at least 8 seconds after the intro', () => {
    const p = { ...createProject(), bpm: 120 }; // one bar of 4/4 at 120 = 2 s
    const plan = videoPlan(p, 3);
    expect(plan.passSeconds).toBeCloseTo(2);
    expect(plan.passes).toBe(4);
    expect(plan.totalSeconds).toBeCloseTo(3 + 8 + 1);
    expect(videoPlan(p, 90).introSeconds).toBe(20);
  });

  it('keeps long songs to one pass', () => {
    const p = setLoopBars({ ...createProject(), bpm: 60 }, 4); // 16 s
    expect(videoPlan(p).passes).toBe(1);
  });

  it('prefers MP4, then WebM', () => {
    expect(pickVideoType((type) => type.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(pickVideoType(() => true)).toMatch(/^video\/mp4/);
    expect(pickVideoType(() => false)).toBeUndefined();
  });

  it('lights the notes and hits that are playing', () => {
    let p = setLoopBars({ ...createProject(), noteLength: 8 }, 1);
    p = { ...p, channels: [
      { ...createChannel('m', 'Melody', 'grand-piano', 8), notes: [{ id: 'a', step: 0, pitch: 60, durationSteps: 2 }, { id: 'b', step: 4, pitch: 67, durationSteps: 2 }] },
      { ...createChannel('k', 'Kick', 'kick', 8), steps: [true, false, false, false, true, false, false, false] },
    ] };
    const frame = videoFrame(p, 4.5);
    expect(frame.notes.map((note) => note.active)).toEqual([false, true]);
    expect(frame.hits.map((hit) => hit.active)).toEqual([false, true]);
    expect([frame.low, frame.high, frame.rows, frame.windowSteps]).toEqual([60, 67, 1, 8]);
  });

  it('follows the arrangement and shows the section', () => {
    let p = setLoopBars({ ...createProject(), noteLength: 8 }, 1);
    p = addPattern(p, 'A');
    p = addArrangementClip(p, p.currentPatternId!, 0, 8);
    p = { ...p, arrangement: [...p.arrangement.map((clip) => ({ ...clip, section: 'Verse' }))] };
    expect(videoFrame(p, 3).section).toBe('Verse');
    expect(videoFrame(p, 3).playhead).toBe(3);
  });
});
