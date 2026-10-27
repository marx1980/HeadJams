import { chordPitches, SCALES, type ChordQuality } from '../model/music';
import type { NoteEvent } from '../model/project';

const QUALITIES: readonly ChordQuality[] = ['major', 'minor', 'diminished', 'sus2', 'sus4'];

export interface ChordChoice {
  root: number;
  quality: ChordQuality;
}

export interface ChordSuggestion extends ChordChoice {
  step: number;
  durationSteps: number;
  confidence: number;
  alternatives: ChordChoice[];
}

interface ScoredChoice extends ChordChoice {
  score: number;
  scaleOrder: number;
}

function choicesForScale(root: number, intervals: readonly number[]): ScoredChoice[] {
  const choices: ScoredChoice[] = [];
  for (const [scaleOrder, offset] of intervals.entries()) {
    const chordRoot = 60 + ((root + offset) % 12);
    for (const [qualityOrder, quality] of QUALITIES.entries()) {
      const tones = chordPitches(chordRoot, quality);
      if (tones.every((pitch) => intervals.includes(((pitch - root) % 12 + 12) % 12))) {
        choices.push({ root: chordRoot, quality, score: 0, scaleOrder: scaleOrder * QUALITIES.length + qualityOrder });
      }
    }
  }
  return choices;
}

function scoreChoices(choices: readonly ScoredChoice[], notes: readonly NoteEvent[], root: number, intervals: readonly number[]): ScoredChoice[] {
  const totalWeight = notes.reduce((sum, note) => {
    const confidence = Number.isFinite(note.confidence) ? Math.max(0, Math.min(1, note.confidence!)) : 0.7;
    return sum + Math.max(0.25, note.durationSteps) * (0.5 + confidence * 0.5);
  }, 0);
  return choices.map((choice) => {
    const chordTones = new Set(chordPitches(choice.root, choice.quality).map((pitch) => pitch % 12));
    const supportedWeight = notes.reduce((sum, note) => {
      const confidence = Number.isFinite(note.confidence) ? Math.max(0, Math.min(1, note.confidence!)) : 0.7;
      const weight = Math.max(0.25, note.durationSteps) * (0.5 + confidence * 0.5);
      return sum + (chordTones.has(((Math.round(note.pitch) % 12) + 12) % 12) ? weight : 0);
    }, 0);
    const tonicBonus = ((choice.root - 60 - root + 12) % 12) === 0 ? 0.025 : 0;
    return { ...choice, score: totalWeight ? supportedWeight / totalWeight + tonicBonus : 0 };
  });
}

export function suggestChordsFromNotes(
  notes: readonly NoteEvent[],
  scaleRoot: number,
  scaleId: string,
  stepsPerBar: number,
  bars: number,
): ChordSuggestion[] {
  if (!notes.length || !Number.isInteger(stepsPerBar) || stepsPerBar < 1 || !Number.isInteger(bars) || bars < 1) return [];
  const scale = SCALES.find((item) => item.id === scaleId) ?? SCALES[0];
  const root = ((Math.round(scaleRoot) % 12) + 12) % 12;
  const choices = choicesForScale(root, scale.intervals);
  if (!choices.length) return [];

  return Array.from({ length: bars }, (_, bar) => {
    const start = bar * stepsPerBar;
    const barNotes = notes.filter((note) =>
      Number.isFinite(note.step) && note.step >= start && note.step < start + stepsPerBar
      && Number.isFinite(note.pitch) && Number.isFinite(note.durationSteps) && note.durationSteps > 0,
    );
    if (!barNotes.length) return undefined;
    const ranked = scoreChoices(choices, barNotes, root, scale.intervals)
      .sort((a, b) => b.score - a.score || a.scaleOrder - b.scaleOrder);
    const best = ranked[0];
    const runnerUp = ranked[1];
    const averageInputConfidence = barNotes.reduce((sum, note) =>
      sum + (Number.isFinite(note.confidence) ? Math.max(0, Math.min(1, note.confidence!)) : 0.7),
    0) / barNotes.length;
    const confidence = Math.min(0.95, Math.max(0.1,
      0.3 + best.score * 0.45 + (best.score - (runnerUp?.score ?? 0)) * 0.15 + averageInputConfidence * 0.1,
    ));
    return {
      root: best.root,
      quality: best.quality,
      step: start,
      durationSteps: stepsPerBar,
      confidence,
      alternatives: ranked.slice(1, 4).map(({ root: candidateRoot, quality }) => ({ root: candidateRoot, quality })),
    };
  }).filter((suggestion): suggestion is ChordSuggestion => suggestion !== undefined);
}
