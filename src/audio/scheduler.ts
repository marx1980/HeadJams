import { SWING_TEMPLATES, type SwingTemplate } from '../model/project';

export interface SchedulerOptions {
  now: () => number;
  bpm: () => number;
  totalSteps: () => number;
  /** Steps per bar (grid resolution); defaults to 16. */
  stepsPerBar?: () => number;
  swingTemplate?: () => SwingTemplate;
  onStep: (step: number, time: number) => void;
  lookAhead?: number;
}

/** Seconds per grid step at a given tempo (4/4 time). */
export function stepDuration(bpm: number, stepsPerBar = 16): number {
  return 240 / bpm / stepsPerBar;
}

export function stepDurationWithSwing(bpm: number, stepsPerBar: number, swingTemplate: SwingTemplate, step: number): number {
  const duration = stepDuration(bpm, stepsPerBar);
  if (stepsPerBar <= 4) return duration;
  const amount = SWING_TEMPLATES.find((template) => template.id === swingTemplate)?.amount ?? 0;
  return duration * (step % 2 === 0 ? 1 + amount : 1 - amount);
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
      this.nextTime += stepDurationWithSwing(
        this.o.bpm(),
        this.o.stepsPerBar?.() ?? 16,
        this.o.swingTemplate?.() ?? 'straight',
        this.step,
      );
      this.step = (this.step + 1) % this.o.totalSteps();
    }
  }
}
