import { describe, expect, it } from 'vitest';
import { Scheduler, stepDuration } from './scheduler';

describe('Scheduler', () => {
  it('computes step duration', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125);
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
});
