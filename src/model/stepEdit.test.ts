import { describe, expect, it } from 'vitest';
import { canEditSteps, insertLosesHit, insertStep, removeStep } from './stepEdit';
import { createChannel, createProject, type Channel, type Project } from './project';
import { setTrackLength } from './trackPattern';

const hits = (steps: boolean[]) => steps.flatMap((on, index) => (on ? [index] : []));
const flags = (length: number, on: number[]) => Array.from({ length }, (_, index) => on.includes(index));

function withTrack(on: number[], patch: Partial<Channel> = {}): Project {
  const base = createProject('Steps');
  return { ...base, channels: [{ ...createChannel('t', 'Track', 'kick', 16), steps: flags(16, on), ...patch }] };
}

describe('insert and remove step', () => {
  it('pushes everything from the tapped step one later and leaves an empty step there', () => {
    const next = insertStep(withTrack([0, 2, 3, 5]), 't', 2);
    expect(hits(next.channels[0].steps)).toEqual([0, 3, 4, 6]);
    expect(next.channels[0].steps).toHaveLength(16);
  });

  it('inserting at step 1 pushes the whole pattern one step later', () => {
    expect(hits(insertStep(withTrack([0, 4, 8]), 't', 0).channels[0].steps)).toEqual([1, 5, 9]);
  });

  it('asks before losing a hit on the last step, then drops only that hit', () => {
    const p = withTrack([0, 15]);
    expect(insertLosesHit(p, 't')).toBe(true);
    expect(insertStep(p, 't', 4)).toBe(p);
    expect(hits(insertStep(p, 't', 4, true).channels[0].steps)).toEqual([0]);
  });

  it('does not ask when the last step is empty', () => {
    const p = withTrack([0, 14]);
    expect(insertLosesHit(p, 't')).toBe(false);
    expect(hits(insertStep(p, 't', 4).channels[0].steps)).toEqual([0, 15]);
  });

  it('remove pulls the rest earlier and empties the last step', () => {
    const next = removeStep(withTrack([0, 2, 3, 15]), 't', 2);
    expect(hits(next.channels[0].steps)).toEqual([0, 2, 14]);
  });

  it('keeps step markers with their steps', () => {
    const meta = { confidence: 0.9 };
    const p = withTrack([3, 6], { stepEventMetadata: { 3: meta, 6: { confidence: 0.4 } } });
    expect(insertStep(p, 't', 4).channels[0].stepEventMetadata).toEqual({ 3: meta, 7: { confidence: 0.4 } });
    expect(removeStep(p, 't', 3).channels[0].stepEventMetadata).toEqual({ 5: { confidence: 0.4 } });
  });

  it('works inside a shortened track and leaves the steps beyond its length alone', () => {
    const p = setTrackLength({ ...createProject('Short'), loopBars: 2, channels: [{ ...createChannel('t', 'Track', 'kick', 32), steps: flags(32, [1, 7, 20]) }] }, 't', 'bar');
    expect(p.channels[0].lengthSteps).toBe(16);
    expect(insertLosesHit(p, 't')).toBe(false);
    expect(hits(insertStep(p, 't', 1).channels[0].steps)).toEqual([2, 8, 20]);
  });

  it('moves every lane of a kit together', () => {
    const lane = (id: string, on: number[]) => ({ id, name: id, soundId: id, steps: flags(16, on) });
    const kit = { ...createChannel('k', 'Kit', 'kick', 16), lanes: [lane('kick', [0, 8]), lane('snare', [4, 12])] };
    const p = { ...createProject('Kit'), channels: [kit] };
    const next = insertStep(p, 'k', 4);
    expect(next.channels[0].lanes!.map((l) => hits(l.steps))).toEqual([[0, 9], [5, 13]]);
    expect(insertLosesHit({ ...p, channels: [{ ...kit, lanes: [lane('kick', [15])] }] }, 'k')).toBe(true);
  });

  it('ignores note tracks, unknown tracks and steps outside the track', () => {
    const notes = withTrack([1], { notes: [{ id: 'n', step: 0, pitch: 60, durationSteps: 2 }] });
    expect(canEditSteps(notes.channels[0])).toBe(false);
    expect(insertStep(notes, 't', 0)).toBe(notes);
    const p = withTrack([1]);
    expect(insertStep(p, 'nope', 0)).toBe(p);
    expect(insertStep(p, 't', 16)).toBe(p);
    expect(removeStep(p, 't', -1)).toBe(p);
  });
});
