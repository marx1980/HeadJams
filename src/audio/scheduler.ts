export interface SchedulerOptions {
  now: () => number;
  bpm: () => number;
  totalSteps: () => number;
  onStep: (step: number, time: number) => void;
  lookAhead?: number;
}

/** Seconds per 16th-note step at a given tempo. */
export function stepDuration(bpm: number): number {
  return 60 / bpm / 4;
}

/** Look-ahead scheduler: call tick() frequently; schedules steps due within lookAhead. */
export class Scheduler {
  private nextTime = 0;
  private step = 0;
  private running = false;
  constructor(private o: SchedulerOptions) {}

  start(): void {
    this.running = true;
    this.step = 0;
    this.nextTime = this.o.now();
  }

  stop(): void {
    this.running = false;
  }

  tick(): void {
    if (!this.running) return;
    const horizon = this.o.now() + (this.o.lookAhead ?? 0.1);
    while (this.nextTime < horizon) {
      this.o.onStep(this.step, this.nextTime);
      this.nextTime += stepDuration(this.o.bpm());
      this.step = (this.step + 1) % this.o.totalSteps();
    }
  }
}
