import {
  arrangementLength, audibleChannels, channelsForPlaybackStep, totalSteps, type Project, type SoundDef,
} from '../model/project';
import { findSound, renderSound } from '../library/sounds';
import { resampleSample, type SampleData } from '../library/sampleStorage';
import { panGains } from './render';
import { Scheduler, stepDuration } from './scheduler';
import { pitchToFrequency } from '../model/music';

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
      const data = sample ? resampleSample(sample.samples, sample.sampleRate, ctx.sampleRate) : renderSound(def.params, ctx.sampleRate);
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

  private playPitch(def: SoundDef, pitch: number, time: number, duration: number, volume: number, pan: number, velocity = 1) {
    const ctx = this.ctx!;
    const start = Math.max(time, ctx.currentTime);
    const length = Math.max(0.01, duration);
    const end = start + length;
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const level = Math.max(0, volume * (Number.isFinite(velocity) ? Math.min(1, Math.max(0, velocity)) : 1));
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.008);
    gain.gain.setValueAtTime(level, end);
    gain.gain.linearRampToValueAtTime(0, end + 0.03);
    panner.pan.setValueAtTime(pan, start);
    gain.connect(panner).connect(ctx.destination);

    if (def.sampleId) {
      const buffer = this.buffer(def);
      if (!buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const rate = pitchToFrequency(pitch) / Math.max(10, def.params.freq);
      source.playbackRate.setValueAtTime(Math.min(8, Math.max(0.125, rate)), start);
      source.connect(gain);
      source.start(start);
      source.stop(end + 0.03);
      return;
    }

    const oscillator = ctx.createOscillator();
    oscillator.type = def.params.wave === 'saw' ? 'sawtooth' : def.params.wave === 'noise' ? 'triangle' : def.params.wave;
    oscillator.frequency.setValueAtTime(pitchToFrequency(pitch), start);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(def.params.cutoff, ctx.sampleRate / 2), start);
    oscillator.connect(filter).connect(gain);
    oscillator.start(start);
    oscillator.stop(end + 0.03);
  }

  async preview(def: SoundDef, volume = 0.8) {
    const ctx = await this.ensureCtx();
    this.play(def, ctx.currentTime, volume, 0);
  }

  async start() {
    if (this.playing) return;
    const ctx = await this.ensureCtx();
    this.playing = true;
    this.sched = new Scheduler({
      now: () => ctx.currentTime,
      bpm: () => this.getProject().bpm,
      totalSteps: () => arrangementLength(this.getProject()) || totalSteps(this.getProject()),
      stepsPerBar: () => this.getProject().noteLength,
      lookAhead: 0.15,
      onStep: (step, time) => {
        const p = this.getProject();
        const stepLen = stepDuration(p.bpm, p.noteLength);
        for (const source of channelsForPlaybackStep(p, step)) {
          for (const c of audibleChannels({ ...p, channels: source.channels })) {
            const def = findSound(p, c.soundId);
            if (!def) continue;
            if (c.steps[source.localStep]) this.play(def, time, c.volume, c.pan);
            for (const note of c.notes ?? []) {
              if (note.step === source.localStep) {
                this.playPitch(def, note.pitch, time, stepLen * note.durationSteps, c.volume, c.pan, note.velocity);
              }
            }
          }
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
