import {
  arrangementLength, audibleChannels, channelsForPlaybackStep, totalSteps, type Project, type SoundDef,
} from '../model/project';
import { findSound, renderSound } from '../library/sounds';
import { resampleSample, type SampleData } from '../library/sampleStorage';
import { panGains } from './render';
import { Scheduler, stepDuration } from './scheduler';
import { pitchToFrequency } from '../model/music';
import { resolveSoundSource } from './soundSource';

export class Engine {
  private ctx?: AudioContext;
  private buffers = new Map<string, AudioBuffer>();
  private sched?: Scheduler;
  private timer?: number;
  private master?: GainNode;
  private previewBus?: GainNode;
  private filter?: BiquadFilterNode;
  private eqLow?: BiquadFilterNode;
  private eqMid?: BiquadFilterNode;
  private eqHigh?: BiquadFilterNode;
  private delay?: DelayNode;
  private delayFeedback?: GainNode;
  private delayWet?: GainNode;
  private reverbWet?: GainNode;
  private reverbDry?: GainNode;
  private convolver?: ConvolverNode;
  playing = false;

  constructor(private getProject: () => Project, private onStep: (step: number | null) => void, private getSample: (id: string) => SampleData | undefined = () => undefined) {}

  private buffer(def: SoundDef): AudioBuffer | undefined {
    const source = resolveSoundSource(def);
    const sample = source.kind === 'sample' ? this.getSample(source.sampleId) : undefined;
    if (source.kind === 'sample' && !sample) return undefined;
    const key = `${def.id}:${JSON.stringify(def.params)}:${sample?.id ?? ''}`;
    let b = this.buffers.get(key);
    if (!b) {
      const ctx = this.ctx!;
      const data = source.kind === 'sample'
        ? resampleSample(sample!.samples, sample!.sampleRate, ctx.sampleRate)
        : renderSound(source.params, ctx.sampleRate);
      b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(key, b);
    }
    return b;
  }

  private async ensureCtx(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.setupEffects(this.ctx);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.updateEffects();
    return this.ctx;
  }

  private setupEffects(ctx: AudioContext) {
    this.master = ctx.createGain();
    this.previewBus = ctx.createGain();
    this.previewBus.connect(ctx.destination);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 250;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 1;
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 6000;

    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.25;
    const delayDry = ctx.createGain();
    this.delayWet = ctx.createGain();
    const delaySum = ctx.createGain();
    this.delayFeedback = ctx.createGain();
    const convolver = ctx.createConvolver();
    const impulseLength = Math.floor(ctx.sampleRate * 1.5);
    const impulse = ctx.createBuffer(2, impulseLength, ctx.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < impulseLength; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / impulseLength) ** 3;
      }
    }
    convolver.buffer = impulse;
    this.convolver = convolver;
    this.reverbDry = ctx.createGain();
    this.reverbWet = ctx.createGain();

    this.master.connect(this.filter).connect(this.eqLow).connect(this.eqMid).connect(this.eqHigh);
    this.eqHigh.connect(delayDry).connect(delaySum);
    this.eqHigh.connect(this.delay).connect(this.delayWet).connect(delaySum);
    this.delay.connect(this.delayFeedback).connect(this.delay);
    delaySum.connect(this.reverbDry).connect(ctx.destination);
    delaySum.connect(convolver).connect(this.reverbWet).connect(ctx.destination);
  }

  private updateEffects() {
    if (!this.ctx || !this.filter || !this.eqLow || !this.eqMid || !this.eqHigh
      || !this.delay || !this.delayFeedback || !this.delayWet || !this.reverbDry || !this.reverbWet) return;
    const effects = this.getProject().effects;
    const now = this.ctx.currentTime;
    this.filter.type = effects.filterCutoff >= 20000 ? 'allpass' : 'lowpass';
    this.filter.frequency.setTargetAtTime(effects.filterCutoff, now, 0.02);
    this.eqLow.gain.setTargetAtTime(effects.eqLow, now, 0.02);
    this.eqMid.gain.setTargetAtTime(effects.eqMid, now, 0.02);
    this.eqHigh.gain.setTargetAtTime(effects.eqHigh, now, 0.02);
    this.delayFeedback.gain.setTargetAtTime(effects.delay * 0.35, now, 0.02);
    this.delayWet.gain.setTargetAtTime(effects.delay * 0.45, now, 0.02);
    this.reverbDry.gain.setTargetAtTime(1, now, 0.02);
    this.reverbWet.gain.setTargetAtTime(effects.reverb * 0.45, now, 0.02);
  }

  private play(def: SoundDef, time: number, volume: number, pan: number, destination: AudioNode = this.master!) {
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
    src.connect(gain).connect(panner).connect(destination);
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
    gain.connect(panner).connect(this.master!);

    const sourceDefinition = resolveSoundSource(def);
    if (sourceDefinition.kind === 'sample') {
      const buffer = this.buffer(def);
      if (!buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const rate = pitchToFrequency(pitch) / sourceDefinition.rootFrequency;
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
    this.play(def, ctx.currentTime, volume, 0, this.previewBus!);
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
      swingTemplate: () => this.getProject().swingTemplate,
      lookAhead: 0.15,
      onStep: (step, time) => {
        const p = this.getProject();
        this.updateEffects();
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
