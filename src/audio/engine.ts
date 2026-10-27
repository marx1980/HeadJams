import {
  arrangementLength, audibleChannels, channelsForPlaybackStep, totalSteps, type Project, type SoundDef,
} from '../model/project';
import { findSound } from '../library/sounds';
import { createSoundSource } from '../library/soundSource';
import type { SampleData } from '../library/sampleStorage';
import { panGains } from './render';
import { Scheduler, stepDuration } from './scheduler';
import { guitarChordPitches, pitchToFrequency } from '../model/music';

export class Engine {
  private ctx?: AudioContext;
  private buffers = new Map<string, AudioBuffer>();
  private sched?: Scheduler;
  private timer?: number;
  private master?: GainNode;
  private previewBus?: GainNode;
  private previewSource?: AudioBufferSourceNode;
  private previewGain?: GainNode;
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
    const source = createSoundSource(def);
    let b = this.buffers.get(source.cacheKey);
    if (!b) {
      const ctx = this.ctx!;
      const data = source.kind === 'sample'
        ? source.load(ctx.sampleRate, this.getSample)
        : source.load(ctx.sampleRate);
      if (!data) return undefined;
      b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(source.cacheKey, b);
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
    src.connect(gain).connect(panner).connect(this.master!);
    src.start(time);
  }

  private stopPreview() {
    if (!this.ctx || !this.previewSource || !this.previewGain) return;
    const now = this.ctx.currentTime;
    this.previewGain.gain.cancelScheduledValues(now);
    this.previewGain.gain.setValueAtTime(this.previewGain.gain.value, now);
    this.previewGain.gain.linearRampToValueAtTime(0, now + 0.01);
    try { this.previewSource.stop(now + 0.012); } catch { /* source already ended */ }
    this.previewSource = undefined;
    this.previewGain = undefined;
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
    this.stopPreview();
    const buffer = this.buffer(def);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8, ctx.currentTime);
    source.connect(gain).connect(this.previewBus!);
    source.onended = () => {
      if (this.previewSource === source) {
        this.previewSource = undefined;
        this.previewGain = undefined;
      }
    };
    this.previewSource = source;
    this.previewGain = gain;
    source.start(ctx.currentTime);
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
            if (def.playbackMode === 'chord') {
              for (const event of c.chordEvents ?? []) {
                if (event.step !== source.localStep) continue;
                const pitches = guitarChordPitches(event.root, event.quality, event.articulation);
                if (event.articulation === 'up-strum') pitches.reverse();
                const duration = event.articulation === 'muted'
                  ? Math.min(0.08, stepLen * event.durationSteps)
                  : stepLen * event.durationSteps;
                const velocity = (event.velocity ?? 1) * (event.articulation === 'muted' ? 0.75 : 1);
                for (let index = 0; index < pitches.length; index++) {
                  const stagger = event.articulation === 'down-strum' || event.articulation === 'up-strum'
                    ? index * 0.018
                    : 0;
                  this.playPitch(def, pitches[index], time + stagger, Math.max(0.01, duration - stagger), c.volume, c.pan, velocity);
                }
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
