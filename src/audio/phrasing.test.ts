import { describe, expect, it } from 'vitest';
import { monophonicLine, phraseNotes, phraseTrack, phrasingProfile, type PhrasingOptions, type PhrasingStyle } from './phrasing';
import { compileStep, type PitchedVoice } from './performance';
import { createChannel, createProject, setLoopBars, type NoteEvent } from '../model/project';
import { findSound } from '../library/sounds';
import { normalizeProject } from '../model/storage';
import { curveAt, envelopeAt, planSampledVoice } from './sampler/sampledVoice';
import { readFileSync } from 'node:fs';
import { decodeWav16, PUBLIC_DIR } from './sampler/testing';
import type { InstrumentManifest } from './sampler/manifest';

const STEP = 0.125;
const note = (id: string, step: number, pitch: number, durationSteps: number, extra: Partial<NoteEvent> = {}): NoteEvent =>
  ({ id, step, pitch, durationSteps, ...extra });
const options = (sound: string, style: PhrasingStyle = 'natural'): PhrasingOptions => ({
  style, profile: phrasingProfile(findSound({ customSounds: [] }, sound)!)!, durationOf: (steps) => steps * STEP, stepsPerBar: 16, seed: '1:a',
});
// Two phrases: a slurred run of four notes, a rest, then a long held note.
const line = [note('a', 0, 60, 2), note('b', 2, 62, 2), note('c', 4, 64, 4), note('d', 8, 67, 4), note('e', 16, 65, 8)];

describe('phrasing', () => {
  it('applies to melodic instruments only, with the right behaviour per family', () => {
    const profile = (id: string) => phrasingProfile(findSound({ customSounds: [] }, id)!);
    expect(profile('tenor-sax')).toMatchObject({ kind: 'wind', bends: true });
    expect(profile('strings')?.kind).toBe('bowed');
    expect(profile('church-organ')?.kind).toBe('organ');
    expect(profile('grand-piano')?.kind).toBe('struck');
    expect(profile('lead-2')?.kind).toBe('lead');
    expect(profile('acoustic-kick')).toBeUndefined();
    expect(profile('clean-chords')).toBeUndefined();
  });

  it('shapes each phrase as a dynamic arch and is deterministic', () => {
    const first = phraseNotes(line, options('alto-sax'));
    expect(phraseNotes(line, options('alto-sax'))).toEqual(first);
    const v = (id: string) => first.get(id)!.velocity;
    expect(v('c')).toBeGreaterThan(v('a'));
    expect(v('c')).toBeGreaterThan(v('d') - 0.06);
    for (const shaped of first.values()) expect(shaped.velocity).toBeGreaterThanOrEqual(0.25);
    const wider = phraseNotes(line, options('alto-sax', 'expressive'));
    const spread = (map: typeof first) => Math.max(...[...map.values()].map((x) => x.velocity)) - Math.min(...[...map.values()].map((x) => x.velocity));
    expect(spread(wider)).toBeGreaterThan(spread(first));
  });

  it('slurs connected notes on sustained instruments: crossfade, glide, no re-attack', () => {
    const shaped = phraseNotes(line, options('tenor-sax'));
    expect(shaped.get('a')!.expression).toMatchObject({ releaseSec: 0.05 });
    expect(shaped.get('a')!.expression?.legato).toBeUndefined();
    expect(shaped.get('b')!.expression?.legato).toBe(true);
    expect(shaped.get('b')!.pitchBend?.slice(0, 2)).toEqual([{ time: 0, value: -2 }, { time: 0.045, value: 0 }]);
    // The phrase break before 'e' starts a fresh, attacked note.
    expect(shaped.get('e')!.expression?.legato).toBeUndefined();
    // The last note of a phrase does not slur into the next phrase.
    expect(shaped.get('d')!.expression?.releaseSec).toBeUndefined();
  });

  it('adds a delayed vibrato and a swell on long notes, and keeps hummed bends', () => {
    const shaped = phraseNotes(line, options('alto-sax')).get('e')!;
    const bends = shaped.pitchBend!;
    expect(bends.filter((point) => point.time < 0.3).every((point) => point.value === 0)).toBe(true);
    expect(Math.max(...bends.map((point) => point.value))).toBeCloseTo(0.24, 2);
    expect(shaped.expression?.gain?.map((point) => point.value)).toEqual([0.88, 1, 0.72]);
    const hummed = [note('h', 0, 60, 8, { pitchBend: [{ time: 0, value: 0.3 }, { time: 0.5, value: 0 }] })];
    expect(phraseNotes(hummed, options('alto-sax')).get('h')!.pitchBend).toEqual(hummed[0].pitchBend);
  });

  it('scoops into and falls off phrases on sax in the expressive style only', () => {
    // Natural: no scoop into the phrase ('a' only bends at its end, gliding into 'b').
    const natural = phraseNotes(line, options('alto-sax')).get('a')!.pitchBend!;
    expect(natural[0].value).toBe(0);
    expect(natural.at(-1)!.value).toBe(2);
    expect(natural.at(-1)!.time).toBeCloseTo(0.295, 5);
    const expressive = phraseNotes(line, options('alto-sax', 'expressive'));
    expect(expressive.get('e')!.pitchBend?.[0]).toEqual({ time: 0, value: -0.7 });
    expect(expressive.get('e')!.pitchBend?.at(-1)).toEqual({ time: 1.1, value: -2 });
    expect(phraseNotes(line, options('flute', 'expressive')).get('e')!.pitchBend?.at(-1)?.value).not.toBe(-2);
  });

  it('gives struck instruments and chords dynamics only', () => {
    const piano = phraseNotes(line, options('grand-piano'));
    for (const shaped of piano.values()) expect(Object.keys(shaped)).toEqual(['velocity']);
    const chord = [note('x', 0, 60, 4), note('y', 0, 64, 4), note('z', 4, 67, 4)];
    const sax = phraseNotes(chord, options('alto-sax'));
    expect(sax.get('x')!.expression).toBeUndefined();
    expect(sax.get('z')!.expression?.legato).toBeUndefined();
  });

  it('is off by default, saved with the project, and compiled into voices when on', () => {
    let p = setLoopBars(createProject(), 2);
    p = { ...p, channels: [{ ...createChannel('s', 'Sax', 'alto-sax', 32), notes: line }] };
    const off = compileStep(p, 2, (steps) => steps * STEP)[0] as PitchedVoice;
    expect(off.velocity).toBeUndefined();
    // Off: no phrasing, only the one-note-at-a-time handover of a monophonic sax.
    expect(off.expression).toEqual({ releaseSec: 0.05 });
    const on = { ...p, channels: [{ ...p.channels[0], phrasing: 'natural' as const }] };
    const voice = compileStep(on, 2, (steps) => steps * STEP)[0] as PitchedVoice;
    expect(voice.expression?.legato).toBe(true);
    expect(voice.velocity).toBeGreaterThan(0);
    const saved = normalizeProject(JSON.stringify(on))!;
    expect(saved.channels[0].phrasing).toBe('natural');
    expect(normalizeProject(JSON.stringify({ ...on, channels: [{ ...on.channels[0], phrasing: 'loud' }] }))!.channels[0].phrasing).toBeUndefined();
  });

  it('plays slurred voices past the attack with the swell applied', () => {
    const dir = new URL('instruments/alto-sax/', PUBLIC_DIR);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as InstrumentManifest;
    const read = (file: string) => { const bytes = readFileSync(new URL(file, dir)); return decodeWav16(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); };
    const audio = new Map(manifest.regions.map((region) => [region.id, read(region.file)]));
    const sound = findSound({ customSounds: [] }, 'alto-sax')!;
    const voice: PitchedVoice = {
      sound, channelId: 'c', kind: 'pitched', origin: 'note', offsetSec: 0, volume: 1, pan: 0, pitch: 60, durationSec: 1,
      velocity: 1, expression: { legato: true, releaseSec: 0.05, gain: [{ time: 0, value: 0.5 }, { time: 1, value: 1 }] },
    };
    const plan = planSampledVoice(voice, manifest, (region) => audio.get(region.id))!;
    expect(plan.startSec).toBeGreaterThan(0);
    expect(plan.attackSec).toBeLessThanOrEqual(0.03);
    expect(plan.releaseSec).toBe(0.05);
    expect(curveAt(plan.gainCurve!, 0.5)).toBeCloseTo(0.75);
    expect(envelopeAt(plan, 0.5)).toBeCloseTo(0.75);
    const plain = planSampledVoice({ ...voice, expression: undefined }, manifest, (region) => audio.get(region.id))!;
    expect(plain.startSec).toBeUndefined();
    expect(plain.gainCurve).toBeUndefined();
  });
});

describe('phrasing, round two', () => {
  const sax = (style: 'natural' | 'expressive' | 'jazz' | 'classical' | 'pop' = 'natural') => options('tenor-sax', style);

  it('plays a hummed note the way it was sung: level and pitch contour, centred and in tune', () => {
    const sung = {
      // A slide up into the note, then a slightly sharp hold.
      pitch: [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t, i) => ({ time: t, value: 0.2 + [-0.9, -0.5, 0, 0.05, 0, -0.05][i] })),
      level: [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t, i) => ({ time: t, value: [0.5, 0.9, 1, 1.1, 1, 0.6][i] })),
    };
    const shaped = phraseNotes([note('s', 0, 60, 8, { sung })], sax('expressive')).get('s')!;
    expect(shaped.pitchBend?.length).toBe(6);
    // The slide is kept, and the hold is centred on the sung median (the 0.2 sharpness is removed).
    expect(shaped.pitchBend![0].value).toBeCloseTo(-0.9, 5);
    expect(shaped.pitchBend![3].value).toBeCloseTo(0, 5);
    // The hummed onset dip is humming articulation and is not copied; the phrase-end fade is.
    expect(shaped.expression?.gain?.map((point) => point.value)[0]).toBeGreaterThan(0.85);
    expect(shaped.expression?.gain?.map((point) => point.value).at(-1)).toBeLessThan(0.75);
    // A struck instrument ignores the contour.
    expect(phraseNotes([note('s', 0, 60, 8, { sung })], options('grand-piano')).get('s')!.pitchBend).toBeUndefined();
  });

  it('uses the staccato recording for short detached notes only', () => {
    const run = [note('a', 0, 60, 1), note('b', 2, 62, 1), note('c', 3, 64, 1), note('d', 4, 65, 4)];
    const shaped = phraseNotes(run, sax());
    expect(shaped.get('a')!.expression?.articulation).toBe('staccato');
    // 'b' slurs into 'c' and 'c' into 'd', so they stay legato.
    expect(shaped.get('b')!.expression?.articulation).toBeUndefined();
    expect(shaped.get('c')!.expression?.legato).toBe(true);
  });

  it('breathes before phrases and inside very long ones, and clicks keys in expressive feels', () => {
    const long = Array.from({ length: 16 }, (_, i) => note(`l${i}`, 8 + i * 4, 60 + (i % 3), 4));
    const track = phraseTrack(long, sax('expressive'));
    const breaths = track.extras.filter((extra) => extra.expression.articulation === 'breath');
    expect(breaths[0]).toMatchObject({ step: 5, expression: { optional: true } });
    // 64 steps at 0.125 s = 8 s without a rest: one breath break, with the note before it shortened.
    expect(breaths.length).toBe(2);
    const cut = [...track.notes.entries()].find(([, shaped]) => shaped.durationSec !== undefined && shaped.durationSec < 0.5);
    expect(cut?.[1].durationSec).toBeCloseTo(0.35, 5);
    expect(track.extras.some((extra) => extra.expression.articulation === 'keys')).toBe(true);
    expect(phraseTrack(long, sax('natural')).extras.some((extra) => extra.expression.articulation === 'keys')).toBe(false);
    expect(phraseTrack(long, options('grand-piano')).extras).toEqual([]);
  });

  it('feels differ: jazz lays back off-beats and bends, classical slurs wider and does not', () => {
    const offbeat = [note('o', 2, 60, 4), note('p', 8, 62, 8)];
    expect(phraseNotes(offbeat, sax('jazz')).get('o')!.offsetSec).toBeCloseTo(0.03, 5);
    expect(phraseNotes(offbeat, sax('jazz')).get('p')!.offsetSec).toBeCloseTo(0.012, 5);
    expect(phraseNotes(offbeat, sax('natural')).get('o')!.offsetSec).toBeUndefined();
    const gap = [note('g', 0, 60, 3), note('h', 4, 62, 4)];
    expect(phraseNotes(gap, sax('classical')).get('h')!.expression?.legato).toBe(true);
    expect(phraseNotes(gap, sax('pop')).get('h')!.expression?.legato).toBeUndefined();
    expect(phraseNotes(line, sax('classical')).get('e')!.pitchBend?.[0].value).toBe(0);
  });

  it('compiles breaths only for sampled instruments, and the sampler skips missing noises and blends layers', () => {
    let p = setLoopBars(createProject(), 2);
    const notes = [note('a', 4, 60, 4), note('b', 8, 62, 8)];
    p = { ...p, channels: [{ ...createChannel('s', 'Sax', 'tenor-sax', 32), notes, phrasing: 'natural' as const }] };
    const durationOf = (steps: number) => steps * STEP;
    const breath = compileStep(p, 1, durationOf).find((voice) => (voice as PitchedVoice).expression?.articulation === 'breath');
    expect(breath).toBeDefined();
    const synth = { ...p, channels: [{ ...p.channels[0], soundId: 'lead-2' }] };
    expect(compileStep(synth, 1, durationOf)).toEqual([]);

    const dir = new URL('instruments/flute/', PUBLIC_DIR);
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as InstrumentManifest;
    const read = (file: string) => { const bytes = readFileSync(new URL(file, dir)); return decodeWav16(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); };
    const audio = new Map(manifest.regions.map((region) => [region.id, read(region.file)]));
    const get = (region: { id: string }) => audio.get(region.id);
    const base: PitchedVoice = {
      sound: findSound({ customSounds: [] }, 'flute')!, channelId: 'c', kind: 'pitched', origin: 'note', offsetSec: 0,
      volume: 1, pan: 0, pitch: 72, durationSec: 1, velocity: 0.9,
    };
    expect(planSampledVoice({ ...base, expression: { articulation: 'breath', optional: true } }, manifest, get)).toBeUndefined();
    const staccato = planSampledVoice({ ...base, durationSec: 0.15, expression: { articulation: 'staccato' } }, manifest, get)!;
    expect(staccato.region.articulation).toBe('staccato');
    expect(staccato.mode).toBe('one-shot');
    const blended = planSampledVoice({ ...base, expression: { blend: true, gain: [{ time: 0, value: 0.6 }, { time: 1, value: 1 }] } }, manifest, get)!;
    expect(blended.blend).toBeDefined();
    expect(blended.blend!.weight[0].value).toBeLessThan(blended.blend!.weight[1].value);
    expect(blended.region.velocityLow).toBe(1);
  });
});

describe('one note at a time', () => {
  it('hands each note of a wind line over to the next instead of ringing under it, and leaves chords alone', () => {
    const durationOf = (steps: number) => steps * STEP;
    const notes = [note('a', 0, 60, 3), note('b', 2, 62, 2), note('c', 4, 64, 2), note('d', 7, 65, 2), note('e', 12, 67, 2), note('x', 16, 60, 2), note('y', 16, 64, 2)];
    const line = monophonicLine(notes, durationOf);
    // 'a' overlaps 'b': it stops 15 ms after b starts and fades in 50 ms.
    expect(line.get('a')!.durationSec).toBeCloseTo(0.265, 5);
    expect(line.get('a')!.releaseSec).toBe(0.05);
    // 'b' meets 'c': no overlap, a short release.
    expect(line.get('b')).toEqual({ releaseSec: 0.05 });
    // 'c' ends 125 ms before 'd': its release lasts the gap.
    expect(line.get('c')!.releaseSec).toBeCloseTo(0.125, 5);
    // 'd' is followed by a long rest, and 'e' by a chord: untouched.
    expect(line.has('d')).toBe(false);
    expect(line.has('e')).toBe(false);

    let p = setLoopBars(createProject(), 2);
    p = { ...p, channels: [{ ...createChannel('s', 'Sax', 'alto-sax', 32), notes }] };
    const voice = compileStep(p, 0, durationOf)[0] as PitchedVoice;
    expect(voice.durationSec).toBeCloseTo(0.265, 5);
    expect(voice.expression).toEqual({ releaseSec: 0.05 });
    const piano = { ...p, channels: [{ ...p.channels[0], soundId: 'grand-piano' }] };
    expect((compileStep(piano, 0, durationOf)[0] as PitchedVoice).expression).toBeUndefined();
  });
});

describe('hummed takes', () => {
  it('drops slides the recognition heard as short quiet notes, and the line glides over them', () => {
    const take = { sourceTakeId: 't' };
    const notes = [note('g', 9, 67, 4, { velocity: 0.99, ...take }), note('f', 12, 65, 1, { velocity: 0.21, ...take }),
      note('e', 13, 64, 3, { velocity: 0.99, ...take }), note('c', 19, 60, 4, { velocity: 0.99, ...take }),
      note('cs', 19, 61, 1, { velocity: 0.2, ...take })];
    const shaped = phraseNotes(notes, options('alto-sax'));
    expect(shaped.get('f')!.silent).toBe(true);
    expect(shaped.get('cs')!.silent).toBe(true);
    // G is no longer cut by the slide: it holds into E and E slurs from G with a glide.
    expect(shaped.get('g')!.durationSec).toBeCloseTo(4 * STEP + 0.015, 5);
    expect(shaped.get('e')!.pitchBend?.[0]).toEqual({ time: 0, value: 3 });
    // Written (not hummed) quiet short notes are real notes.
    const written = phraseNotes(notes.map(({ sourceTakeId, ...n }) => n), options('alto-sax'));
    expect(written.get('f')!.silent).toBeUndefined();
  });

  it('keeps the sung body level: the hum onset dip is not copied, the phrase-end fade is', () => {
    const level = [0.3, 0.8, 1, 1, 1, 1, 0.7, 0.3].map((value, i) => ({ time: i * 0.06, value }));
    const sung = { pitch: [], level };
    const line = [note('a', 0, 60, 4, { sung }), note('b', 4, 62, 4, { sung })];
    const shaped = phraseNotes(line, options('alto-sax'));
    const gain = (id: string) => shaped.get(id)!.expression!.gain!.map((point) => point.value);
    expect(Math.min(...gain('a'))).toBeGreaterThan(0.8);
    expect(gain('b')[0]).toBeGreaterThan(0.8);
    expect(gain('b').at(-1)).toBeLessThan(0.65);
  });
});

describe('glides between slurred notes', () => {
  it('moves both notes together and glides as long as the sung slide', () => {
    const take = { sourceTakeId: 't', velocity: 0.99 };
    const notes = [note('g', 9, 67, 4, take), note('f', 12, 65, 1, { ...take, velocity: 0.21 }), note('e', 13, 64, 3, take)];
    const shaped = phraseNotes(notes, options('alto-sax'));
    const g = shaped.get('g')!;
    const e = shaped.get('e')!;
    // The slide note lasted one step (0.125 s): E glides in from G over 0.125 s.
    expect(e.pitchBend!.slice(0, 2)).toEqual([{ time: 0, value: 3 }, { time: 0.125, value: 0 }]);
    // G, fading out, bends to E over the same 0.125 s from the moment E starts (4 steps in).
    expect(g.pitchBend!.slice(-2)).toEqual([{ time: 0.5, value: 0 }, { time: 0.625, value: -3 }]);
    expect(g.expression?.releaseSec).toBeCloseTo(0.1125, 5);
  });
});
