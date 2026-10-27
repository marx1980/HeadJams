import { chordPitches, type ChordQuality, SCALES } from '../model/music';
import type { NoteEvent } from '../model/project';
import type { ChordSuggestion } from './chordSuggestion';

export type AccompanimentPattern = 'block' | 'pulses' | 'offbeat' | 'arpeggio';

export interface ArrangementStyle {
  id: string;
  name: string;
  soundId: string;
  pattern: AccompanimentPattern;
}

export const ARRANGEMENT_STYLES: readonly ArrangementStyle[] = [
  { id: 'acoustic', name: 'Acoustic', soundId: 'guitar-acoustic-1', pattern: 'block' },
  { id: 'pop', name: 'Pop', soundId: 'keys-2', pattern: 'pulses' },
  { id: 'electronic', name: 'Electronic', soundId: 'lead-9', pattern: 'offbeat' },
  { id: 'orchestral', name: 'Orchestral', soundId: 'strings-3', pattern: 'arpeggio' },
];

export function generateHarmonyFromMelody(
  notes: readonly NoteEvent[],
  scaleRoot: number,
  scaleId: string,
  stepCount: number,
): NoteEvent[] {
  const scale = SCALES.find((item) => item.id === scaleId) ?? SCALES[0];
  if (!Number.isInteger(stepCount) || stepCount < 1 || !scale) return [];
  const root = ((Math.round(scaleRoot) % 12) + 12) % 12;
  return notes.flatMap((note, index) => {
    if (!Number.isInteger(note.step) || note.step < 0 || note.step >= stepCount
      || !Number.isFinite(note.pitch) || note.pitch < 0 || note.pitch > 127
      || !Number.isFinite(note.durationSteps) || note.durationSteps <= 0) return [];
    const pitchClass = ((Math.round(note.pitch) - root) % 12 + 12) % 12;
    let degree = scale.intervals.findIndex((interval) => interval === pitchClass);
    if (degree < 0) {
      degree = scale.intervals.reduce((best, interval, candidate) =>
        Math.abs(interval - pitchClass) < Math.abs(scale.intervals[best] - pitchClass) ? candidate : best, 0);
    }
    const targetDegree = degree + 2;
    const octave = Math.floor((Math.round(note.pitch) - root) / 12);
    const targetPitch = root + (octave + Math.floor(targetDegree / scale.intervals.length)) * 12
      + scale.intervals[targetDegree % scale.intervals.length];
    if (targetPitch > 127) return [];
    return [{
      id: `harmony-${index}-${note.step}-${targetPitch}`,
      step: note.step,
      pitch: targetPitch,
      durationSteps: Math.min(note.durationSteps, stepCount - note.step),
      ...(Number.isFinite(note.confidence) ? { confidence: Math.max(0, Math.min(1, note.confidence!)) } : {}),
      ...(note.sourceTakeId ? { sourceTakeId: note.sourceTakeId } : {}),
    }];
  });
}

export function generateChordAccompaniment(
  suggestions: readonly ChordSuggestion[],
  style: ArrangementStyle,
  stepsPerBar: number,
  stepCount: number,
): NoteEvent[] {
  if (!Number.isInteger(stepsPerBar) || stepsPerBar < 1 || !Number.isInteger(stepCount) || stepCount < 1) return [];
  const beat = Math.max(1, Math.floor(stepsPerBar / 4));
  const validQuality = (quality: string): quality is ChordQuality =>
    ['major', 'minor', 'diminished', 'augmented', 'sus2', 'sus4', 'seventh', 'major7', 'minor7'].includes(quality);
  const makeHits = (start: number, duration: number): number[] => {
    switch (style.pattern) {
      case 'pulses': return Array.from({ length: 4 }, (_, index) => start + index * beat).filter((step) => step < start + duration);
      case 'offbeat': return Array.from({ length: 4 }, (_, index) => start + Math.floor(beat / 2) + index * beat).filter((step) => step < start + duration);
      case 'arpeggio': return Array.from({ length: Math.ceil(duration / beat) }, (_, index) => start + index * beat);
      default: return [start];
    }
  };
  return suggestions.flatMap((suggestion, suggestionIndex) => {
    if (!Number.isInteger(suggestion.root) || suggestion.root < 0 || suggestion.root > 127
      || !validQuality(suggestion.quality) || !Number.isInteger(suggestion.step)
      || suggestion.step < 0 || suggestion.step >= stepCount || !Number.isFinite(suggestion.durationSteps)
      || suggestion.durationSteps <= 0 || !Number.isFinite(suggestion.confidence)
      || suggestion.confidence < 0 || suggestion.confidence > 1) return [];
    const duration = Math.min(suggestion.durationSteps, stepCount - suggestion.step);
    const tones = chordPitches(suggestion.root, suggestion.quality);
    const hits = makeHits(suggestion.step, duration);
    return hits.flatMap((step, hitIndex) => {
      const toneIndexes = style.pattern === 'arpeggio' ? [hitIndex % tones.length] : tones.map((_, index) => index);
      return toneIndexes.map((toneIndex) => ({
        id: `accompaniment-${suggestionIndex}-${hitIndex}-${toneIndex}-${step}`,
        step,
        pitch: tones[toneIndex],
        durationSteps: style.pattern === 'block' ? duration : Math.max(1, Math.min(beat, suggestion.step + duration - step)),
        confidence: suggestion.confidence,
      }));
    });
  });
}
