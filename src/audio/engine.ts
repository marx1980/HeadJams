import { audibleChannels, totalSteps, type Project, type SoundDef } from '../model/project';
import { findSound, renderSound } from '../library/sounds';
import type { SampleData } from '../library/sampleStorage';
import { panGains } from './render';
import { Scheduler } from './scheduler';

export class Engine {
  private ctx?: AudioContext;
  private buffers = new Map<string, AudioBuffer>();
  private sched?: Scheduler;
  private timer?: number;
  playing = false;

  constructor(private getProject: () => Project, private onStep: (step: number | null) => void, private getSample: (id: string) => SampleData | undefined = () => undefined) {}

  private buffer(def: SoundDef): AudioBuffer | undefined {
    const sample = def.sampleId ? this.getSample(def.sampleId) : undefined;
    if (def.sampleId && !sample) return undefined;
    const key = `${def.id}:${JSON.stringify(def.params)}:${sample?.id ?? ''}`;
    let b = this.buffers.get(key);
    if (!b) {
      const ctx = this.ctx!;
      const data = sample ? resample(sample.samples, sample.sampleRate, ctx.sampleRate) : renderSound(def.params, ctx.sampleRate);
      b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(key, b);
    }
    return b;
  }

  private async ensureCtx(): Promise<AudioContext> {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  private play(def: SoundDef, time: number, volume: number, pan: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    const buffer = this.buffer(def);
    if (!buffer) return;
    src.buffer = buffer;
    const [l, r] = panGains(volume, pan);
    const gain = ctx.createGain();
    gain.gain.value = Math.max(l, r);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(gain).connect(panner).connect(ctx.destination);
    src.start(time);
  }

  async preview(def: SoundDef, volume = 0.8) {
    const ctx = await this.ensureCtx();
    this.play(def, ctx.currentTime, volume, 0);
  }

  function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (!input.length || fromRate <= 0 || fromRate === toRate) return input;
    const output = new Float32Array(Math.max(1, Math.round(input.length * toRate / fromRate)));
    for (let i = 0; i < output.length; i++) {
      const position = i * fromRate / toRate;
      const left = Math.min(input.length - 1, Math.floor(position));
      const right = Math.min(input.length - 1, left + 1);
      const mix = position - left;
      output[i] = input[left] * (1 - mix) + input[right] * mix;
    }
    return output;
  }

  async start() {
    if (this.playing) return;
    const ctx = await this.ensureCtx();
    this.playing = true;
    this.sched = new Scheduler({
      now: () => ctx.currentTime,
      bpm: () => this.getProject().bpm,
      totalSteps: () => totalSteps(this.getProject()),
      stepsPerBar: () => this.getProject().noteLength,
      lookAhead: 0.15,
      onStep: (step, time) => {
        const p = this.getProject();
        for (const c of audibleChannels(p)) {
          const def = findSound(p, c.soundId);
          if (def && c.steps[step]) this.play(def, time, c.volume, c.pan);
        }
        window.setTimeout(() => this.playing && this.onStep(step), Math.max(0, (time - ctx.currentTime) * 1000));
      },
    });
    this.sched.start();
    this.timer = window.setInterval(() => this.sched?.tick(), 25);
  }

  stop() {
    this.playing = false;
    this.sched?.stop();
    window.clearInterval(this.timer);
    this.onStep(null);
  }
}
