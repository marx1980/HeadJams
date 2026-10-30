import { describe, expect, it } from 'vitest';
import { parseChordSymbol } from '../../model/music';
import { compileChordRow, layoutChordRow, STRUM_PATTERNS } from './patterns';
import { chooseVoicing } from './voicings';
import { performChord, voiceChordSequence } from './performer';
import { createChannel, createProject, setLoopBars, type ChordRow } from '../../model/project';
import { clearChordRow, refreshChordRows, setChordRow } from '../../model/chordRow';
import { compileStep, type PitchedVoice } from '../../audio/performance';

const row = (patch: Partial<ChordRow> = {}): ChordRow => ({ chords: 'Am F C G', pattern: 'pop', strumMs: 30, humanise: 0.6, capo: 0, ...patch });

describe('chord symbols', () => {
  it('parses common symbols', () => {
    expect(parseChordSymbol('Am')).toEqual({ root: 57, quality: 'minor', power: false });
    expect(parseChordSymbol('F#m7')).toEqual({ root: 54, quality: 'minor7', power: false });
    expect(parseChordSymbol('Bb')).toEqual({ root: 58, quality: 'major', power: false });
    expect(parseChordSymbol('Gsus4')).toMatchObject({ root: 55, quality: 'sus4' });
    expect(parseChordSymbol('D7')).toMatchObject({ quality: 'seventh' });
    expect(parseChordSymbol('Cmaj7')).toMatchObject({ quality: 'major7' });
    expect(parseChordSymbol('E5')).toEqual({ root: 52, quality: 'major', power: true });
    expect(parseChordSymbol('Bdim')).toMatchObject({ root: 59, quality: 'diminished' });
    expect(parseChordSymbol('H7')).toBeUndefined();
    expect(parseChordSymbol('Cxyz')).toBeUndefined();
  });
});

describe('chord row layout', () => {
  it('puts one chord per bar, splits bars with |, repeats to fill, and reports unknown symbols', () => {
    expect(layoutChordRow('Am F C G', 16, 4).chords.map((c) => [c.symbol, c.step, c.durationSteps]))
      .toEqual([['Am', 0, 16], ['F', 16, 16], ['C', 32, 16], ['G', 48, 16]]);
    expect(layoutChordRow('Am G | F', 16, 2).chords.map((c) => [c.symbol, c.step, c.durationSteps]))
      .toEqual([['Am', 0, 8], ['G', 8, 8], ['F', 16, 16]]);
    expect(layoutChordRow('C G', 16, 4).chords.map((c) => c.symbol)).toEqual(['C', 'G', 'C', 'G']);
    expect(layoutChordRow('C Q7 G', 16, 2).invalid).toEqual(['Q7']);
  });
});

describe('strum patterns', () => {
  it('pop strums D d u u d u, each stroke lasting to the next', () => {
    const events = compileChordRow(row({ chords: 'C' }), 16, 1);
    expect(events.map((e) => [e.step, e.articulation, e.durationSteps])).toEqual([
      [0, 'down-strum', 4], [4, 'down-strum', 2], [6, 'up-strum', 4], [10, 'up-strum', 2], [12, 'down-strum', 2], [14, 'up-strum', 2],
    ]);
    expect(events[0].velocity).toBeGreaterThan(events[1].velocity!);
    expect(events.every((e) => e.strumMs === 30 && e.humanise === 0.6 && e.capo === undefined)).toBe(true);
  });

  it('every preset compiles for four chords at 1/16 and 1/8 grids, with a stroke on every chord change', () => {
    for (const pattern of STRUM_PATTERNS) {
      for (const stepsPerBar of [16, 8]) {
        const events = compileChordRow(row({ chords: 'Am F | C G', pattern: pattern.id }), stepsPerBar, 2);
        expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
        for (const change of [0, stepsPerBar / 2, stepsPerBar, stepsPerBar * 1.5]) {
          expect(events.some((e) => e.step === change), `${pattern.id} ${stepsPerBar} @${change}`).toBe(true);
        }
        expect(events.every((e) => Number.isInteger(e.step) && e.step < stepsPerBar * 2 && e.durationSteps >= 1)).toBe(true);
      }
    }
  });

  it('arpeggios pick single strings; power chords use power shapes', () => {
    const arp = compileChordRow(row({ chords: 'C', pattern: 'arp-up' }), 16, 1);
    expect(arp.map((e) => e.strings)).toEqual([[1], [2], [3], [4], [1], [2], [3], [4]]);
    const voicing = voiceChordSequence(arp).get(arp[0].id)!;
    expect(performChord(arp[0], voicing, 's').map((s) => s.pitch)).toEqual([48]);
    expect(compileChordRow(row({ chords: 'E5 A5', pattern: 'eighths' }), 16, 2).every((e) => e.articulation === 'power')).toBe(true);
  });

  it('a capo moves the shape up the neck but keeps the sounding chord', () => {
    const open = chooseVoicing(2, 'major')!; // D
    const capo2 = chooseVoicing(2, 'major', undefined, 2)!; // C shape at fret 2
    expect(new Set(capo2.notes.map((n) => n.midi % 12))).toEqual(new Set(open.notes.map((n) => n.midi % 12)));
    expect(capo2.frets).toEqual([null, 5, 4, 2, 3, 2]);
  });

  it('strum speed and string subsets also reach Classic synth guitars, without changing older events', () => {
    const p = createProject('g');
    p.channels = [{ ...createChannel('g', 'Guitar', 'guitar-chord-acoustic'), chordEvents: [
      { id: 'a', step: 0, root: 48, quality: 'major', articulation: 'down-strum', durationSteps: 4, strumMs: 60 },
      { id: 'b', step: 1, root: 48, quality: 'major', articulation: 'sustained', durationSteps: 4, strings: [1] },
    ] }];
    const strum = compileStep(p, 0, (s) => s * 0.125) as PitchedVoice[];
    expect(strum.at(-1)!.offsetSec).toBeCloseTo(0.06, 6);
    const single = compileStep(p, 1, (s) => s * 0.125) as PitchedVoice[];
    expect(single).toHaveLength(1);
  });
});

describe('chord row on a channel', () => {
  it('replaces only its own events, follows loop changes, and can be removed', () => {
    let p = createProject('g');
    p.channels = [{ ...createChannel('g', 'Guitar', 'nylon-chords', 16), chordEvents: [
      { id: 'mine', step: 3, root: 50, quality: 'minor', articulation: 'muted', durationSteps: 1 },
    ] }];
    p = setChordRow(p, 'g', row({ chords: 'C G', pattern: 'quarters' }));
    const events = () => p.channels[0].chordEvents ?? [];
    expect(events().filter((e) => e.id.startsWith('row-')).map((e) => e.step)).toEqual([0, 4, 8, 12]);
    expect(events().some((e) => e.id === 'mine')).toBe(true);
    p = refreshChordRows(setLoopBars(p, 2));
    expect(events().filter((e) => e.id.startsWith('row-')).map((e) => e.step)).toEqual([0, 4, 8, 12, 16, 20, 24, 28]);
    expect(events().find((e) => e.step === 16)!.root).toBe(55);
    p = clearChordRow(p, 'g');
    expect(events().map((e) => e.id)).toEqual(['mine']);
    expect(p.channels[0].chordRow).toBeUndefined();
  });
});
