/**
 * Regression projects (expansion.md E8): Classic templates and one project per sampled instrument family.
 * Each render is stored as an exact hash and a loudness fingerprint (RMS per 2048 samples, ×10⁴).
 * The fingerprint must match within ±2 everywhere; the exact hash is checked with STRICT_REGRESSION=1
 * (same machine and Node version). After an intended sound change: `npm run regression:update`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderProject, type InstrumentAudio } from './render';
import { TEMPLATES } from '../model/templates';
import { addSampleSound, createChannel, createProject, setLoopBars, type ChordEvent, type NoteEvent, type Project } from '../model/project';
import { STARTER_SOUNDS } from '../library/instrumentRegistry';
import { addKitChannel, findDrumKit } from '../library/drumKits';
import { setChordRow } from '../model/chordRow';
import { addPersonalInstrument, personalAudio, personalManifest } from '../model/personalInstrument';
import type { SampleData } from '../library/sampleStorage';
import { diskStore } from './sampler/testing';
import { instrumentNeeds } from './sampler/instrumentStore';

const FILE = new URL('./__regression__/fingerprints.json', import.meta.url);
const UPDATE = process.env.UPDATE_REGRESSION === '1';
const STRICT = process.env.STRICT_REGRESSION === '1';

interface Print { hash: string; length: number; rms: number[] }

function print(out: { left: Float32Array; right: Float32Array }): Print {
  const hash = createHash('sha256').update(Buffer.from(out.left.buffer)).update(Buffer.from(out.right.buffer)).digest('hex');
  const rms: number[] = [];
  for (let i = 0; i < out.left.length; i += 2048) {
    let sum = 0;
    const end = Math.min(out.left.length, i + 2048);
    for (let j = i; j < end; j++) sum += out.left[j] * out.left[j] + out.right[j] * out.right[j];
    rms.push(Math.round(Math.sqrt(sum / (2 * (end - i))) * 1e4));
  }
  return { hash, length: out.left.length, rms };
}

const notes = (spec: [number, number, number][]): NoteEvent[] => spec.map(([step, pitch, durationSteps], i) => ({ id: `n${i}`, step, pitch, durationSteps }));
const melody = notes([[0, 60, 2], [2, 64, 2], [4, 67, 4], [8, 72, 2], [10, 69, 2], [12, 65, 4], [16, 62, 4], [20, 59, 4], [24, 55, 8]]);
const chordEvents: ChordEvent[] = [
  { id: 'c1', step: 0, root: 57, quality: 'minor', articulation: 'down-strum', durationSteps: 8 },
  { id: 'c2', step: 8, root: 53, quality: 'major', articulation: 'up-strum', durationSteps: 8, velocity: 0.8 },
  { id: 'c3', step: 16, root: 48, quality: 'major7', articulation: 'sustained', durationSteps: 8 },
  { id: 'c4', step: 24, root: 55, quality: 'seventh', articulation: 'muted', durationSteps: 8 },
];

function base(): Project {
  return { ...setLoopBars(createProject('regression'), 2), bpm: 110, channels: [] };
}

/** One project per sampled family (sounds as the app ships them). */
function sampledProjects(): Record<string, Project> {
  const one = (soundId: string, extra: Partial<ReturnType<typeof createChannel>>) =>
    ({ ...base(), channels: [{ ...createChannel('a', soundId, soundId, 32), ...extra }] });
  let kit = addKitChannel(base(), findDrumKit('acoustic-kit')!);
  const lanes = kit.channels[0].lanes!.map((lane) => ({
    ...lane,
    steps: lane.steps.map((_, i) => lane.id === 'kick' ? i % 8 === 0 : lane.id === 'snare' ? i % 8 === 4 : lane.id === 'hat-closed' ? i % 2 === 0 : lane.id === 'hat-open' ? i % 16 === 14 : lane.id === 'crash' ? i === 0 : false),
  }));
  kit = { ...kit, channels: [{ ...kit.channels[0], lanes }] };
  const row = setChordRow({ ...base(), channels: [{ ...createChannel('g', 'Gtr', 'clean-chords', 32) }] }, 'g',
    { chords: 'Am F | C G', pattern: 'pop', strumMs: 30, humanise: 0.6, capo: 0 });
  return {
    'acoustic-kit-lanes': kit,
    'nylon-chords': one('nylon-chords', { chordEvents }),
    'clean-chords-row': row,
    'clean-guitar': one('clean-guitar', { notes: melody }),
    'grand-piano': one('grand-piano', { notes: [...melody, ...notes([[0, 48, 8], [8, 53, 8], [16, 50, 8], [24, 43, 8]]).map((n) => ({ ...n, id: `b${n.id}` }))] }),
    'electric-piano': one('electric-piano', { notes: melody }),
    'electric-bass': one('electric-bass', { notes: melody.map((n) => ({ ...n, pitch: n.pitch - 24 })) }),
    strings: one('strings', { notes: notes([[0, 57, 16], [0, 64, 16], [16, 55, 16], [16, 62, 16]]) }),
    brass: one('brass', { notes: melody.map((n) => ({ ...n, pitch: n.pitch - 5 })) }),
    harp: one('harp', { notes: melody }),
    'pizzicato-strings': one('pizzicato-strings', { notes: melody }),
    flute: one('flute', { notes: melody.map((n) => ({ ...n, pitch: n.pitch + 7 })) }),
    clarinet: one('clarinet', { notes: melody }),
    'french-horn': one('french-horn', { notes: melody.map((n) => ({ ...n, pitch: n.pitch - 12 })) }),
    'church-organ': one('church-organ', { notes: notes([[0, 48, 16], [0, 55, 16], [0, 64, 16], [16, 53, 16], [16, 57, 16], [16, 65, 16]]) }),
    marimba: one('marimba', { notes: melody }),
    bassoon: one('bassoon', { notes: melody.map((n) => ({ ...n, pitch: n.pitch - 12 })) }),
    oboe: one('oboe', { notes: melody }),
    piccolo: one('piccolo', { notes: melody.map((n) => ({ ...n, pitch: n.pitch + 12 })) }),
    tuba: one('tuba', { notes: melody.map((n) => ({ ...n, pitch: n.pitch - 24 })) }),
    'soprano-sax': one('soprano-sax', { notes: melody }),
    'alto-sax': one('alto-sax', { notes: melody }),
    'tenor-sax': one('tenor-sax', { notes: melody.map((n) => ({ ...n, pitch: n.pitch - 7 })) }),
    'baritone-sax': one('baritone-sax', { notes: melody.map((n) => ({ ...n, pitch: n.pitch - 19 })) }),
    viola: one('viola', { notes: melody }),
    contrabass: one('contrabass', { notes: melody.map((n) => ({ ...n, pitch: n.pitch - 24 })) }),
    xylophone: one('xylophone', { notes: melody.map((n) => ({ ...n, pitch: n.pitch + 12 })) }),
    'tubular-bells': one('tubular-bells', { notes: melody }),
    timpani: one('timpani', { notes: melody.map((n) => ({ ...n, pitch: n.pitch - 12 })) }),
    'phrased-tenor-sax': one('tenor-sax', { notes: melody.map((n) => ({ ...n, pitch: n.pitch - 7 })), phrasing: 'natural' }),
    'phrased-strings': one('strings', { notes: melody, phrasing: 'expressive' }),
    'phrased-alto-sax': one('alto-sax', { notes: melody, phrasing: 'expressive' }),
    'phrased-lead-synth': one('lead-2', { notes: melody, phrasing: 'natural' }),
    glockenspiel: one('glockenspiel', { notes: melody.map((n) => ({ ...n, pitch: n.pitch + 12 })) }),
  };
}

async function renderSampled(p: Project, extra?: { manifest: ReturnType<typeof personalManifest>; audio: ReturnType<typeof personalAudio> }) {
  const store = diskStore();
  if (extra) store.register(extra.manifest, extra.audio);
  const needs = instrumentNeeds(p);
  await store.prepare(needs);
  const audio = store.exportAudio(needs.keys());
  const instruments: InstrumentAudio = { manifests: new Map(audio.manifests.map((m) => [m.id, m])), regions: new Map(audio.regions.map((r) => [r.key, r])) };
  return renderProject(p, 44100, new Map(), instruments);
}

describe('regression projects', () => {
  it('render as recorded (Classic templates, a stress project and every sampled family)', async () => {
    const prints: Record<string, Print> = {};
    for (const template of TEMPLATES) prints[`template-${template.id}`] = print(renderProject(template.make(), 44100));

    // Classic stress: every voice type, swing, effects and a user sample.
    let stress = base();
    stress = addSampleSound(stress, 'smp', 'smp1');
    const sample: SampleData = { id: 'smp1', sampleRate: 22050, samples: Float32Array.from({ length: 4000 }, (_, i) => Math.sin(i / 7) * (1 - i / 4000)) };
    stress = {
      ...stress, swingTemplate: 'light' as Project['swingTemplate'],
      effects: { ...stress.effects, reverb: 0.3, delay: 0.2, filterCutoff: 9000, eqLow: 2, eqMid: -1, eqHigh: 3 },
      channels: [
        { ...createChannel('k', 'Kick', 'kick-1', 32), steps: Array.from({ length: 32 }, (_, i) => i % 4 === 0) },
        { ...createChannel('l', 'Lead', STARTER_SOUNDS.find((s) => s.playbackMode === 'notes')!.id, 32), notes: melody },
        { ...createChannel('c', 'Gtr', 'guitar-chord-acoustic', 32), chordEvents },
        { ...createChannel('s', 'Smp', stress.customSounds[0].id, 32), steps: Array.from({ length: 32 }, (_, i) => i % 8 === 6) },
      ],
    };
    prints['classic-stress'] = print(renderProject(stress, 44100, new Map([['smp1', sample]])));

    for (const [name, project] of Object.entries(sampledProjects())) prints[`sampled-${name}`] = print(await renderSampled(project));

    const { project: mine } = addPersonalInstrument(base(), 'Mine', [{ sampleId: 'tone', rootMidi: 69 }]);
    const personal = { ...mine, channels: [{ ...createChannel('m', 'Mine', 'mine-1', 32), notes: melody }] };
    const tone = Float32Array.from({ length: 22050 }, (_, i) => Math.sin(2 * Math.PI * 440 * i / 22050) * Math.exp(-i / 9000));
    const instrument = personal.personalInstruments![0];
    prints['personal-instrument'] = print(await renderSampled(personal, {
      manifest: personalManifest(instrument), audio: personalAudio(instrument, new Map([['tone', { samples: tone, sampleRate: 22050 }]])),
    }));

    if (UPDATE || !existsSync(FILE)) {
      writeFileSync(FILE, `${JSON.stringify(prints, null, 1)}\n`);
      return;
    }
    const stored = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, Print>;
    expect(Object.keys(prints).sort()).toEqual(Object.keys(stored).sort());
    for (const [name, now] of Object.entries(prints)) {
      const was = stored[name];
      expect(now.length, name).toBe(was.length);
      const worst = now.rms.reduce((max, value, i) => Math.max(max, Math.abs(value - was.rms[i])), 0);
      expect(worst, `${name}: loudness fingerprint moved by ${worst}`).toBeLessThanOrEqual(2);
      if (STRICT) expect(now.hash, name).toBe(was.hash);
    }
  }, 120000);
});
