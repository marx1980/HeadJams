import { SCALES, snapPitchToScale } from '../model/music';
import type { NoteEvent } from '../model/project';

/** Draw a melody (hum.md H5): a finger contour becomes notes, like a hummed take. */

export interface ContourPoint {
  /** Position in steps (fractional). */
  x: number;
  /** Pitch in semitones (fractional MIDI). */
  y: number;
}

export type DrawMode = 'original' | 'cleaned' | 'tight';

/**
 * Average the contour over each step, then join neighbouring steps that sit on the same note.
 * Original keeps chromatic pitches; Cleaned snaps to the key and folds one-step blips into their neighbour;
 * Tight also aligns notes to eighths.
 */
export function contourToNotes(
  strokes: readonly ContourPoint[][], totalSteps: number, mode: DrawMode, key: { root: number; scaleId: string },
  stepsPerBar = 16,
): NoteEvent[] {
  const scale = SCALES.find((item) => item.id === key.scaleId) ?? SCALES[0];
  const columns = new Map<number, number[]>();
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length; i++) {
      const point = stroke[i];
      const next = stroke[i + 1];
      // Fill the steps a fast stroke jumps over, so a quick line still makes notes.
      const from = Math.floor(point.x);
      const to = next ? Math.floor(next.x) : from;
      for (let step = Math.min(from, to); step <= Math.max(from, to); step++) {
        if (step < 0 || step >= totalSteps) continue;
        const t = next && to !== from ? (step - from) / (to - from) : 0;
        const y = next ? point.y + (next.y - point.y) * Math.max(0, Math.min(1, t)) : point.y;
        columns.set(step, [...(columns.get(step) ?? []), y]);
      }
    }
  }
  const pitchAt = (values: number[]) => {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const rounded = Math.round(average);
    return mode === 'original' ? rounded : snapPitchToScale(rounded, key.root, scale);
  };
  const steps = [...columns.keys()].sort((a, b) => a - b);
  const notes: { step: number; durationSteps: number; pitch: number }[] = [];
  for (const step of steps) {
    const pitch = pitchAt(columns.get(step)!);
    const last = notes.at(-1);
    if (last && last.pitch === pitch && last.step + last.durationSteps === step) last.durationSteps += 1;
    else notes.push({ step, durationSteps: 1, pitch });
  }
  let result = notes;
  if (mode !== 'original') {
    // Fold one-step blips between two notes into the longer neighbour.
    result = [];
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const prev = result.at(-1);
      const next = notes[i + 1];
      const touchingPrev = prev && prev.step + prev.durationSteps === note.step;
      if (note.durationSteps === 1 && touchingPrev && next && next.step === note.step + 1) { prev!.durationSteps += 1; continue; }
      if (touchingPrev && prev!.pitch === note.pitch) { prev!.durationSteps += note.durationSteps; continue; }
      result.push({ ...note });
    }
  }
  if (mode === 'tight') {
    const grid = Math.max(1, Math.round(stepsPerBar / 8));
    const aligned: typeof result = [];
    for (const note of result) {
      const start = Math.round(note.step / grid) * grid;
      const end = Math.max(start + grid, Math.round((note.step + note.durationSteps) / grid) * grid);
      const prev = aligned.at(-1);
      if (prev && start < prev.step + prev.durationSteps) {
        if (prev.pitch === note.pitch) { prev.durationSteps = Math.max(prev.durationSteps, end - prev.step); continue; }
        if (start <= prev.step) continue; // swallowed by the previous note on the coarser grid
        prev.durationSteps = start - prev.step;
      }
      if (start < totalSteps) aligned.push({ step: start, durationSteps: Math.min(end, totalSteps) - start, pitch: note.pitch });
    }
    result = aligned;
  }
  return result.map((note, index) => ({ id: `drawn-${index}-${note.step}`, ...note, velocity: 0.85 }));
}
