import {
  arrangementLength, totalSteps, type PitchBendPoint, type Project, type SoundDef,
} from '../model/project';
import { createSoundSource } from '../library/soundSource';
import { resampleSample, type SampleData } from '../library/sampleStorage';
import { panGains } from './render';
import { Scheduler, stepDuration } from './scheduler';
import { durationAt, hasTempoMap, stepSeconds } from '../model/tempo';
import { pitchToFrequency } from '../model/music';
import { compileStep, type HitVoice, type PitchedVoice, type VoiceEvent } from './performance';
import type { InstrumentStore } from './sampler/instrumentStore';
import { instrumentNeeds } from './sampler/instrumentStore';
import { ROOM_SEND, roomImpulse } from './room';
import { blendGains, planSampledVoice, sanitizeBends, type DecodedRegion, type SampledVoicePlan } from './sampler/sampledVoice';
import { RoundRobin } from './sampler/selectRegion';
import { CUT_FADE_SEC, VoiceTracker } from './sampler/voices';

export class Engine {
  private ctx?: AudioContext;
  private buffers = new Map<string, AudioBuffer>();
  private sched?: Scheduler;
  private timer?: number;
  private master?: GainNode;
  private previewBus?: GainNode;
  private previewSource?: AudioBufferSourceNode;
  private previewGain?: GainNode;
  private liveNotes = new Map<string, { source: AudioScheduledSourceNode; gain: GainNode }>();
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
  /** Per-track room send (mono) into a shared room response (src/audio/room.ts). */
  private roomBus?: GainNode;
  private roundRobin = new RoundRobin(1);
  private tracker = new VoiceTracker();
  private sampledVoices = new Map<number, { source: AudioBufferSourceNode; blendSource?: AudioBufferSourceNode; cut: GainNode }>();
  private nextVoiceId = 0;
  private regionBuffers = new WeakMap<Float32Array, AudioBuffer>();
  private metronome = false;
  private beatZeroAudibleMs: number | undefined;
  playing = false;

  /** Click on every beat (accent on the bar) while playing, scheduled on the engine clock. */
  setMetronome(on: boolean) {
    this.metronome = on;
  }

  /** performance.now() when step 0 of the current playback was audible, or undefined when stopped. */
  get playbackBeatZeroMs(): number | undefined {
    return this.playing ? this.beatZeroAudibleMs : undefined;
  }

  private contextTimeToAudibleMs(ctx: AudioContext, time: number): number {
    const stamp = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : undefined;
    if (stamp?.contextTime !== undefined && stamp.performanceTime !== undefined && stamp.performanceTime > 0) {
      return stamp.performanceTime + (time - stamp.contextTime) * 1000;
    }
    const latency = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0;
    return performance.now() + (time - ctx.currentTime + latency) * 1000;
  }

  private click(time: number, accent: boolean) {
    const ctx = this.ctx!;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = accent ? 1000 : 700;
    gain.gain.setValueAtTime(0.13, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);
    oscillator.connect(gain).connect(this.previewBus!);
    oscillator.start(time);
    oscillator.stop(time + 0.04);
  }

  constructor(
    private getProject: () => Project,
    private onStep: (step: number | null) => void,
    private getSample: (id: string) => SampleData | undefined = () => undefined,
    private instruments?: InstrumentStore,
  ) {}

  private regionBuffer(audio: DecodedRegion): AudioBuffer {
    if (audio.buffer) return audio.buffer;
    let buffer = this.regionBuffers.get(audio.data);
    if (!buffer) {
      buffer = this.ctx!.createBuffer(1, audio.data.length, audio.sampleRate);
      buffer.copyToChannel(audio.data as Float32Array<ArrayBuffer>, 0);
      this.regionBuffers.set(audio.data, buffer);
    }
    return buffer;
  }

  private planSampled(voice: VoiceEvent, roundRobin?: RoundRobin): SampledVoicePlan | undefined {
    const store = this.instruments;
    const manifest = store?.manifest(voice.sound.instrumentId!);
    if (!store || !manifest) return undefined;
    return planSampledVoice(voice, manifest, (region) => store.audio(manifest, region), roundRobin);
  }

  /** Build source -> envelope gain -> cut gain -> panner -> destination for a sampled voice. */
  private startSampledNodes(plan: SampledVoicePlan, start: number, pan: number, destination: AudioNode, sustainUntilStopped = false) {
    const ctx = this.ctx!;
    const bends = sanitizeBends(plan.pitchBend);
    const makeSource = (audio: DecodedRegion, rate: number, loop?: { startSec: number; endSec: number }) => {
      const node = ctx.createBufferSource();
      node.buffer = this.regionBuffer(audio);
      if (loop) {
        node.loop = true;
        node.loopStart = loop.startSec;
        node.loopEnd = loop.endSec;
      }
      node.playbackRate.setValueAtTime(rate, start);
      let previous = start;
      for (const point of bends) {
        const at = start + point.time;
        if (at <= previous) continue;
        node.playbackRate.linearRampToValueAtTime(rate * 2 ** (point.value / 12), at);
        previous = at;
      }
      return node;
    };
    const source = makeSource(plan.audio, plan.rate, plan.loop);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(plan.level, start + plan.attackSec);
    if (plan.mode === 'sustain' && !sustainUntilStopped) {
      envelope.gain.setValueAtTime(plan.level, start + Math.max(plan.attackSec, plan.durationSec));
      envelope.gain.linearRampToValueAtTime(0, start + plan.durationSec + plan.releaseSec);
    }
    const cut = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    let blendSource: AudioBufferSourceNode | undefined;
    let head: AudioNode = source;
    if (plan.blend) {
      // Soft and loud recordings, crossfaded by the blend weight (equal power), into one envelope.
      const blend = plan.blend;
      blendSource = makeSource(blend.audio, blend.rate, blend.loop);
      const softGain = ctx.createGain();
      const loudGain = ctx.createGain();
      const [soft0, loud0] = blendGains(blend.weight[0]?.value ?? 0, blend.gainRatio);
      softGain.gain.setValueAtTime(soft0, start);
      loudGain.gain.setValueAtTime(loud0, start);
      let last = start;
      for (const point of blend.weight) {
        const at = start + point.time;
        if (at <= last) continue;
        const [softValue, loudValue] = blendGains(point.value, blend.gainRatio);
        softGain.gain.linearRampToValueAtTime(softValue, at);
        loudGain.gain.linearRampToValueAtTime(loudValue, at);
        last = at;
      }
      const sum = ctx.createGain();
      source.connect(softGain).connect(sum);
      blendSource.connect(loudGain).connect(sum);
      head = sum;
      blendSource.start(start, blend.startSec ?? 0);
      if (!sustainUntilStopped) blendSource.stop(start + plan.endSec + 0.005);
    }
    if (plan.gainCurve?.length) {
      // Phrasing swell: its own gain stage, so the attack/release envelope above stays as it was.
      const swell = ctx.createGain();
      swell.gain.setValueAtTime(plan.gainCurve[0].value, start);
      let last = start;
      for (const point of plan.gainCurve) {
        const at = start + point.time;
        if (at <= last) continue;
        swell.gain.linearRampToValueAtTime(point.value, at);
        last = at;
      }
      head.connect(envelope).connect(swell).connect(cut).connect(panner).connect(destination);
    } else {
      head.connect(envelope).connect(cut).connect(panner).connect(destination);
    }
    source.start(start, plan.startSec ?? 0);
    if (!sustainUntilStopped) source.stop(start + plan.endSec + 0.005);
    return { source, blendSource, envelope, cut, panner };
  }

  private playSampled(voice: VoiceEvent, time: number) {
    const plan = this.planSampled(voice, this.roundRobin);
    if (!plan) return;
    const ctx = this.ctx!;
    const start = Math.max(time, ctx.currentTime);
    const manifest = this.instruments!.manifest(voice.sound.instrumentId!)!;
    const id = this.nextVoiceId++;
    const cuts = this.tracker.add({
      id, start, noteEnd: start + plan.noteEndSec, end: start + plan.endSec, level: plan.level,
      polyKey: `${voice.channelId}:${manifest.id}`, chokeKey: plan.chokeKey,
    }, manifest.maxPolyphony);
    for (const cut of cuts) {
      const victim = this.sampledVoices.get(cut.id);
      if (!victim) continue;
      victim.cut.gain.setValueAtTime(1, cut.at);
      victim.cut.gain.linearRampToValueAtTime(0, cut.at + CUT_FADE_SEC);
      try { victim.source.stop(cut.at + CUT_FADE_SEC + 0.002); } catch { /* already stopped */ }
      try { victim.blendSource?.stop(cut.at + CUT_FADE_SEC + 0.002); } catch { /* already stopped */ }
      this.sampledVoices.delete(cut.id);
    }
    const nodes = this.startSampledNodes(plan, start, voice.pan, this.master!);
    this.sendToRoom(nodes.panner, voice.room);
    nodes.source.onended = () => this.sampledVoices.delete(id);
    this.sampledVoices.set(id, { source: nodes.source, blendSource: nodes.blendSource, cut: nodes.cut });
  }

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

  /** 'running' when sound can be heard; browsers (iOS especially) suspend or interrupt audio until a tap. */
  get audioState(): AudioContextState | 'interrupted' | 'none' {
    return this.ctx ? this.ctx.state as AudioContextState | 'interrupted' : 'none';
  }

  /** Try to (re)start audio, e.g. after the app comes back from the background. */
  async resumeAudio(): Promise<boolean> {
    if (!this.ctx) return false;
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => undefined);
    return this.ctx.state === 'running';
  }

  private async ensureCtx(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.setupEffects(this.ctx);
      // iOS suspends ("interrupted") audio in the background; resume when the app is visible again.
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
        });
      }
    }
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => undefined);
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

    const [roomLeft, roomRight] = roomImpulse(ctx.sampleRate);
    const roomBuffer = ctx.createBuffer(2, roomLeft.length, ctx.sampleRate);
    roomBuffer.copyToChannel(roomLeft as Float32Array<ArrayBuffer>, 0);
    roomBuffer.copyToChannel(roomRight as Float32Array<ArrayBuffer>, 1);
    const room = ctx.createConvolver();
    room.normalize = false;
    room.buffer = roomBuffer;
    this.roomBus = ctx.createGain();
    this.roomBus.channelCount = 1;
    this.roomBus.channelCountMode = 'explicit';
    this.roomBus.connect(room).connect(this.master);
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

  /** Also send a voice's output to the room, when its track has one. */
  private sendToRoom(node: AudioNode, room?: number) {
    if (!room || room <= 0 || !this.roomBus || !this.ctx) return;
    const send = this.ctx.createGain();
    send.gain.value = Math.min(1, room) * ROOM_SEND;
    node.connect(send).connect(this.roomBus);
  }

  private play(def: SoundDef, time: number, volume: number, pan: number, skipSec = 0, room?: number) {
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
    this.sendToRoom(panner, room);
    if (skipSec > 0 && skipSec >= buffer.duration) return;
    src.start(time, skipSec > 0 ? skipSec : 0);
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

  private playPitch(
    def: SoundDef, pitch: number, time: number, duration: number, volume: number, pan: number, velocity = 1,
    pitchBend: PitchBendPoint[] = [], room?: number,
  ) {
    const ctx = this.ctx!;
    const start = Math.max(time, ctx.currentTime);
    const length = Math.max(0.01, duration);
    const end = start + length;
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const level = Math.max(0, volume * (Number.isFinite(velocity) ? Math.min(1, Math.max(0, velocity)) : 1));
    const bends = pitchBend.filter((point) => Number.isFinite(point.time) && point.time >= 0
      && Number.isFinite(point.value)).map((point) => ({ ...point, value: Math.max(-48, Math.min(48, point.value)) }))
      .sort((a, b) => a.time - b.time);
    const automateBends = (parameter: AudioParam, base: number) => {
      parameter.setValueAtTime(base, start);
      let previousTime = start;
      for (const point of bends) {
        const bendTime = Math.min(end, start + point.time);
        if (bendTime <= previousTime) continue;
        parameter.linearRampToValueAtTime(base * 2 ** (point.value / 12), bendTime);
        previousTime = bendTime;
      }
    };
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.008);
    gain.gain.setValueAtTime(level, end);
    gain.gain.linearRampToValueAtTime(0, end + 0.03);
    panner.pan.setValueAtTime(pan, start);
    gain.connect(panner).connect(this.master!);
    this.sendToRoom(panner, room);

    if (def.sampleId) {
      const buffer = this.buffer(def);
      if (!buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const rate = pitchToFrequency(pitch) / Math.max(10, def.params.freq);
      automateBends(source.playbackRate, Math.min(8, Math.max(0.125, rate)));
      source.connect(gain);
      source.start(start);
      source.stop(end + 0.03);
      return;
    }

    const oscillator = ctx.createOscillator();
    oscillator.type = def.params.wave === 'saw' ? 'sawtooth' : def.params.wave === 'noise' ? 'triangle' : def.params.wave;
    automateBends(oscillator.frequency, pitchToFrequency(pitch));
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
    if (def.instrumentId) {
      if (!await this.instruments?.ensure(def.instrumentId, new Set([def.instrumentNote ?? 60]))) return;
      const voice: HitVoice = { kind: 'hit', sound: def, channelId: 'preview', offsetSec: 0, volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8, pan: 0 };
      const plan = this.planSampled(voice);
      if (!plan) return;
      const nodes = this.startSampledNodes(plan, ctx.currentTime, 0, this.previewBus!);
      this.previewSource = nodes.source;
      this.previewGain = nodes.cut;
      nodes.source.onended = () => {
        if (this.previewSource === nodes.source) {
          this.previewSource = undefined;
          this.previewGain = undefined;
        }
      };
      return;
    }
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

  async previewSample(sample: SampleData, volume = 0.8) {
    const ctx = await this.ensureCtx();
    this.stopPreview();
    if (!sample.samples.length || sample.sampleRate <= 0) return;
    const data = resampleSample(sample.samples, sample.sampleRate, ctx.sampleRate);
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
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

  async startLiveNote(voiceId: string, def: SoundDef, pitch: number, velocity = 1, volume = 0.8, pan = 0) {
    const ctx = await this.ensureCtx();
    this.stopLiveNote(voiceId);
    const now = ctx.currentTime;
    if (def.instrumentId) {
      const voice: PitchedVoice = {
        kind: 'pitched', origin: 'note', sound: def, channelId: 'live', offsetSec: 0, pitch, durationSec: 30,
        velocity, volume: Math.max(0, Math.min(1, volume)), pan,
      };
      const plan = this.planSampled(voice);
      if (!plan) {
        void this.instruments?.ensure(def.instrumentId, new Set([Math.round(pitch)]));
        return;
      }
      const nodes = this.startSampledNodes(plan, now, pan, this.master!, plan.mode === 'sustain');
      nodes.source.onended = () => {
        if (this.liveNotes.get(voiceId)?.source === nodes.source) this.liveNotes.delete(voiceId);
      };
      this.liveNotes.set(voiceId, { source: nodes.source, gain: nodes.cut });
      return;
    }
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const level = Math.max(0, Math.min(1, velocity * volume));
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.01);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    let source: AudioScheduledSourceNode;

    if (def.sampleId) {
      const buffer = this.buffer(def);
      if (!buffer) return;
      const sampleSource = ctx.createBufferSource();
      sampleSource.buffer = buffer;
      sampleSource.playbackRate.value = Math.min(8, Math.max(0.125, pitchToFrequency(pitch) / Math.max(10, def.params.freq)));
      sampleSource.connect(gain);
      source = sampleSource;
    } else {
      const oscillator = ctx.createOscillator();
      oscillator.type = def.params.wave === 'saw' ? 'sawtooth' : def.params.wave === 'noise' ? 'triangle' : def.params.wave;
      oscillator.frequency.value = pitchToFrequency(pitch);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = Math.min(def.params.cutoff, ctx.sampleRate / 2);
      oscillator.connect(filter).connect(gain);
      source = oscillator;
    }

    gain.connect(panner).connect(this.master!);
    source.onended = () => {
      if (this.liveNotes.get(voiceId)?.source === source) this.liveNotes.delete(voiceId);
    };
    this.liveNotes.set(voiceId, { source, gain });
    source.start(now);
  }

  stopLiveNote(voiceId: string) {
    const voice = this.liveNotes.get(voiceId);
    if (!voice || !this.ctx) return;
    this.liveNotes.delete(voiceId);
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.025);
    try { voice.source.stop(now + 0.03); } catch { /* source already ended */ }
  }

  stopLiveNotes() {
    for (const voiceId of this.liveNotes.keys()) this.stopLiveNote(voiceId);
  }

  /** Start playing, from song step `fromStep` (seek) or the beginning. */
  async start(fromStep = 0) {
    if (this.playing) return;
    const ctx = await this.ensureCtx();
    if (this.instruments) await this.instruments.prepare(instrumentNeeds(this.getProject()));
    if (this.playing) return;
    this.playing = true;
    this.beatZeroAudibleMs = undefined;
    this.roundRobin = new RoundRobin(this.getProject().seed);
    this.tracker = new VoiceTracker();
    this.sampledVoices.clear();
    this.sched = new Scheduler({
      now: () => ctx.currentTime,
      bpm: () => this.getProject().bpm,
      totalSteps: () => arrangementLength(this.getProject()) || totalSteps(this.getProject()),
      stepsPerBar: () => this.getProject().noteLength,
      swingTemplate: () => this.getProject().swingTemplate,
      stepSeconds: (step) => stepSeconds(this.getProject(), step),
      lookAhead: 0.15,
      onStep: (step, time) => {
        const p = this.getProject();
        this.updateEffects();
        if (step === 0 && this.beatZeroAudibleMs === undefined) this.beatZeroAudibleMs = this.contextTimeToAudibleMs(ctx, time);
        const stepsPerBeat = Math.max(1, p.noteLength / 4);
        if (this.metronome && step % stepsPerBeat === 0) this.click(time, step % p.noteLength === 0);
        const stepLen = stepDuration(p.bpm, p.noteLength);
        const durationOf = hasTempoMap(p) ? (steps: number) => durationAt(p, step, steps) : (steps: number) => stepLen * steps;
        for (const voice of compileStep(p, step, durationOf)) {
          // A sampled sound whose instrument failed to load falls back to its synth parameters.
          if (voice.sound.instrumentId && this.instruments?.status(voice.sound.instrumentId)?.state !== 'error') {
            this.playSampled(voice, time + voice.offsetSec);
          }
          else if (voice.kind === 'pitched' && voice.expression?.optional) continue;
          else if (voice.kind === 'hit') this.play(voice.sound, time + voice.offsetSec, voice.volume, voice.pan, voice.skipSec, voice.room);
          else {
            this.playPitch(voice.sound, voice.pitch, time + voice.offsetSec, voice.durationSec, voice.volume, voice.pan,
              voice.velocity, voice.pitchBend, voice.room);
          }
        }
        window.setTimeout(() => this.playing && this.onStep(step), Math.max(0, (time - ctx.currentTime) * 1000));
      },
    });
    this.sched.start(fromStep);
    this.timer = window.setInterval(() => this.sched?.tick(), 25);
  }

  /** Jump to song step `step` while playing. */
  seek(step: number) {
    if (this.playing) this.sched?.jump(step);
  }

  stop() {
    this.playing = false;
    this.sched?.stop();
    window.clearInterval(this.timer);
    this.stopLiveNotes();
    this.onStep(null);
  }
}
