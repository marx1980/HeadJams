import { parseChordSymbol } from '../../model/music';
import type { ChordEvent, ChordRow } from '../../model/project';

/**
 * Strum patterns as data (expansion.md E4). One character per sixteenth of a 4/4 bar:
 *   D/d down-strum (accented/normal), U/u up-strum, P/p power chord, x muted chop, k short up-chop,
 *   1–6 a single string of the shape (1 = lowest), . rest.
 */
export interface StrumPattern {
  id: string;
  label: string;
  bar: string;
}

export const STRUM_PATTERNS: readonly StrumPattern[] = [
  { id: 'quarters', label: 'Straight quarters', bar: 'D...d...D...d...' },
  { id: 'eighths', label: 'Straight eighths', bar: 'D.u.d.u.D.u.d.u.' },
  { id: 'pop', label: 'Pop', bar: 'D...d.u...u.d.u.' },
  { id: 'folk', label: 'Folk', bar: '1...d.u.2...d.u.' },
  { id: 'rock', label: 'Rock', bar: 'D.d.d.d.D.d.d.d.' },
  { id: 'ballad', label: 'Ballad', bar: 'D.....u.d...u...' },
  { id: 'reggae', label: 'Reggae offbeat', bar: '....k.......k...' },
  { id: 'power', label: 'Power chords', bar: 'P.p.p.p.P.p.p.p.' },
  { id: 'arp-up', label: 'Arpeggio up', bar: '1.2.3.4.1.2.3.4.' },
  { id: 'arp-updown', label: 'Arpeggio up/down', bar: '1.2.3.4.5.4.3.2.' },
];

export const STRUM_SPEEDS: ReadonlyArray<{ ms: number; label: string }> = [
  { ms: 12, label: 'Tight' },
  { ms: 30, label: 'Normal' },
  { ms: 50, label: 'Relaxed' },
  { ms: 80, label: 'Slow' },
];
export const HUMANISE_LEVELS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Off' },
  { value: 0.3, label: 'Light' },
  { value: 0.6, label: 'Natural' },
  { value: 1, label: 'Loose' },
];

export const DEFAULT_CHORD_ROW: ChordRow = { chords: 'Am F C G', pattern: 'pop', strumMs: 30, humanise: 0.6, capo: 0 };

export interface RowChord {
  symbol: string;
  step: number;
  durationSteps: number;
  root: number;
  quality: ChordEvent['quality'];
  power: boolean;
}

/** Lay chord symbols over the loop: "Am F C G" is one chord per bar; "Am G | F" splits a bar; the list repeats to fill. */
export function layoutChordRow(text: string, stepsPerBar: number, bars: number): { chords: RowChord[]; invalid: string[] } {
  const invalid: string[] = [];
  const barsText = text.includes('|')
    ? text.split('|').map((bar) => bar.trim().split(/\s+/).filter(Boolean))
    : text.trim().split(/\s+/).filter(Boolean).map((symbol) => [symbol]);
  const parsedBars = barsText.filter((bar) => bar.length).map((bar) => bar.flatMap((symbol) => {
    const parsed = parseChordSymbol(symbol);
    if (!parsed) { invalid.push(symbol); return []; }
    return [{ symbol, ...parsed }];
  })).filter((bar) => bar.length);
  const chords: RowChord[] = [];
  if (!parsedBars.length || stepsPerBar < 1 || bars < 1) return { chords, invalid };
  for (let bar = 0; bar < bars; bar++) {
    const symbols = parsedBars[bar % parsedBars.length];
    const share = Math.floor(stepsPerBar / symbols.length);
    symbols.forEach((chord, index) => {
      const step = bar * stepsPerBar + index * share;
      const durationSteps = index === symbols.length - 1 ? (bar + 1) * stepsPerBar - step : share;
      chords.push({ ...chord, step, durationSteps });
    });
  }
  return { chords, invalid };
}

/** Compile a chord row into chord events (ids start with "row-") on a loop of `bars` bars. */
export function compileChordRow(row: ChordRow, stepsPerBar: number, bars: number): ChordEvent[] {
  const pattern = STRUM_PATTERNS.find((item) => item.id === row.pattern) ?? STRUM_PATTERNS[0];
  const { chords } = layoutChordRow(row.chords, stepsPerBar, bars);
  const scale = stepsPerBar / 16;
  // Stroke positions in steps from the bar start (sixteenths that fall between steps are skipped).
  const strokes = [...pattern.bar].flatMap((symbol, index) => {
    const offset = index * scale;
    return symbol !== '.' && Number.isInteger(offset) ? [{ symbol, offset }] : [];
  });
  const arpeggio = strokes.some((stroke) => /[1-6]/.test(stroke.symbol));
  const shared = {
    strumMs: row.strumMs,
    humanise: row.humanise,
    ...(row.capo > 0 ? { capo: row.capo } : {}),
  };
  const events: ChordEvent[] = [];
  for (const chord of chords) {
    const end = chord.step + chord.durationSteps;
    const barStart = Math.floor(chord.step / stepsPerBar) * stepsPerBar;
    const inChord = strokes.map((stroke) => ({ ...stroke, step: barStart + stroke.offset }))
      .filter((stroke) => stroke.step >= chord.step && stroke.step < end);
    // A chord change always sounds on its first step.
    if (!inChord.length || inChord[0].step !== chord.step) {
      inChord.unshift({ symbol: arpeggio ? '1' : 'D', offset: chord.step - barStart, step: chord.step });
    }
    inChord.forEach((stroke, index) => {
      const next = inChord[index + 1]?.step ?? end;
      const base = {
        id: `row-${chord.step}-${stroke.step}`,
        step: stroke.step,
        root: chord.root,
        quality: chord.quality,
        ...shared,
      };
      const symbol = stroke.symbol;
      if (/[1-6]/.test(symbol)) {
        events.push({ ...base, articulation: 'sustained', durationSteps: end - stroke.step, velocity: symbol === '1' ? 0.85 : 0.7, strings: [Number(symbol)] });
      } else if (symbol === 'x') {
        events.push({ ...base, articulation: 'muted', durationSteps: Math.max(1, next - stroke.step), velocity: 0.8 });
      } else if (symbol === 'k') {
        events.push({ ...base, articulation: 'up-strum', durationSteps: Math.max(1, Math.round(scale)), velocity: 0.7 });
      } else {
        const power = chord.power || symbol === 'P' || symbol === 'p';
        const up = symbol === 'U' || symbol === 'u';
        events.push({
          ...base,
          articulation: power ? 'power' : up ? 'up-strum' : 'down-strum',
          durationSteps: Math.max(1, next - stroke.step),
          velocity: symbol === symbol.toUpperCase() ? 0.95 : 0.75,
        });
      }
    });
  }
  return events;
}
