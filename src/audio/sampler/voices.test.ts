import { describe, expect, it } from 'vitest';
import { chooseVictim, VoiceTracker, type TrackedVoice } from './voices';

const v = (id: number, start: number, extra: Partial<TrackedVoice> = {}): TrackedVoice => ({
  id, start, noteEnd: start + 10, end: start + 20, level: 1, polyKey: 'p', ...extra,
});

describe('VoiceTracker', () => {
  it('never exceeds the polyphony limit', () => {
    const tracker = new VoiceTracker();
    let cuts = 0;
    for (let i = 0; i < 50; i++) cuts += tracker.add(v(i, i * 0.01), 4).length;
    expect(tracker.size).toBe(4);
    expect(cuts).toBe(46);
  });

  it('steals released voices first, then the quietest, then the oldest', () => {
    expect(chooseVictim([v(1, 0), v(2, 1, { noteEnd: 2 }), v(3, 2, { noteEnd: 2.5 })], 3).id).toBe(2);
    expect(chooseVictim([v(1, 0, { level: 0.9 }), v(2, 1, { level: 0.2 }), v(3, 2, { level: 0.5 })], 3).id).toBe(2);
    expect(chooseVictim([v(1, 0), v(2, 1), v(3, 2)], 3).id).toBe(1);
  });

  it('chokes voices sharing a choke key, and only those', () => {
    const tracker = new VoiceTracker();
    tracker.add(v(1, 0, { chokeKey: 'hat' }), 8);
    tracker.add(v(2, 0.1), 8);
    expect(tracker.add(v(3, 0.2, { chokeKey: 'hat' }), 8)).toEqual([{ id: 1, at: 0.2 }]);
  });

  it('forgets voices that have finished', () => {
    const tracker = new VoiceTracker();
    tracker.add(v(1, 0, { end: 0.5 }), 1);
    expect(tracker.add(v(2, 1), 1)).toEqual([]);
  });
});
