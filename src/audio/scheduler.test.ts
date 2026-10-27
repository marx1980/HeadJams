import { describe, expect, it } from 'vitest';
import { Scheduler, stepDuration, stepDurationWithSwing } from './scheduler';

describe('Scheduler', () => {
  it('computes step duration', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125);
    expect(stepDuration(120, 4)).toBeCloseTo(0.5);
  });
  it('schedules steps within look-ahead and loops', () => {
    let t = 0;
    const steps: number[] = [];
    const s = new Scheduler({ now: () => t, bpm: () => 120, totalSteps: () => 4, onStep: (n) => steps.push(n), lookAhead: 0.4 });
    s.start();
    s.tick();
    expect(steps).toEqual([0, 1, 2, 3]);
    t = 0.5;
    s.tick();
    expect(steps.slice(4)).toEqual([0, 1, 2, 3]);
  });
  it('delays offbeats with swing while preserving each beat pair length', () => {
    const straight = stepDuration(120, 8);
    const swungFirst = stepDurationWithSwing(120, 8, 'triplet', 0);
    const swungSecond = stepDurationWithSwing(120, 8, 'triplet', 1);
    expect(swungFirst).toBeCloseTo(straight * 4 / 3);
    expect(swungSecond).toBeCloseTo(straight * 2 / 3);
    expect(swungFirst + swungSecond).toBeCloseTo(straight * 2);
    expect(stepDurationWithSwing(120, 4, 'triplet', 0)).toBeCloseTo(stepDuration(120, 4));
  });
  it('schedules swing timing through the look-ahead clock', () => {
    let t = 0;
    const times: number[] = [];
    const scheduler = new Scheduler({
      now: () => t, bpm: () => 120, totalSteps: () => 4, stepsPerBar: () => 8,
      swingTemplate: () => 'triplet', onStep: (_step, time) => times.push(time), lookAhead: 0.4,
    });
    scheduler.start();
    scheduler.tick();
    expect(times).toHaveLength(2);
    expect(times[1]).toBeCloseTo(stepDuration(120, 8) * 4 / 3);
  });
});
