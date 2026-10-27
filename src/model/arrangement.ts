import { CHORD_QUALITIES, chordPitches } from './music';
import {
  addChannel, MAX_CHANNELS, MAX_PITCH, removeChannel, totalSteps, updateChannel, type NoteEvent, type Project,
} from './project';
import type { ChordSuggestion } from '../library/chordSuggestion';

function validSuggestions(project: Project, suggestions: readonly ChordSuggestion[]): ChordSuggestion[] {
  const length = totalSteps(project);
  return suggestions.filter((suggestion) =>
    Number.isInteger(suggestion.root) && suggestion.root >= 0 && suggestion.root <= MAX_PITCH
    && CHORD_QUALITIES.some((item) => item.id === suggestion.quality)
    && Number.isInteger(suggestion.step) && suggestion.step >= 0 && suggestion.step < length
    && Number.isFinite(suggestion.durationSteps) && suggestion.durationSteps > 0
    && Number.isFinite(suggestion.confidence) && suggestion.confidence >= 0 && suggestion.confidence <= 1,
  );
}

function channelNotes(suggestions: readonly ChordSuggestion[]): NoteEvent[] {
  return suggestions.flatMap((suggestion, suggestionIndex) => chordPitches(suggestion.root, suggestion.quality).map((pitch, index) => ({
    id: `suggested-${suggestion.step}-${suggestionIndex}-${pitch}-${index}`,
    step: suggestion.step,
    pitch,
    durationSteps: suggestion.durationSteps,
    confidence: suggestion.confidence,
  })));
}

function validNotes(project: Project, notes: readonly NoteEvent[]): NoteEvent[] {
  const length = totalSteps(project);
  return notes.filter((note) =>
    typeof note.id === 'string' && note.id.length > 0
    && Number.isInteger(note.step) && note.step >= 0 && note.step < length
    && Number.isFinite(note.pitch) && note.pitch >= 0 && note.pitch <= MAX_PITCH
    && Number.isFinite(note.durationSteps) && note.durationSteps > 0
    && (note.confidence === undefined || (Number.isFinite(note.confidence) && note.confidence >= 0 && note.confidence <= 1)),
  ).map((note) => ({ ...note }));
}

function averageConfidence(notes: readonly NoteEvent[]): number {
  return notes.reduce((sum, note) => sum + (note.confidence ?? 0.7), 0) / notes.length;
}

function bassPitch(root: number): number {
  return 36 + ((Math.round(root) % 12) + 12) % 12;
}

export function generateBassFromChords(
  suggestions: readonly ChordSuggestion[],
  stepsPerBar: number,
  stepCount: number,
): NoteEvent[] {
  if (!Number.isInteger(stepsPerBar) || stepsPerBar < 1 || !Number.isInteger(stepCount) || stepCount < 1) return [];
  const beatSteps = Math.max(1, Math.floor(stepsPerBar / 4));
  return suggestions.flatMap((suggestion, suggestionIndex) => {
    if (!Number.isInteger(suggestion.root) || suggestion.root < 0 || suggestion.root > MAX_PITCH
      || !CHORD_QUALITIES.some((item) => item.id === suggestion.quality)
      || !Number.isInteger(suggestion.step) || suggestion.step < 0 || suggestion.step >= stepCount
      || !Number.isFinite(suggestion.durationSteps) || suggestion.durationSteps <= 0
      || !Number.isFinite(suggestion.confidence) || suggestion.confidence < 0 || suggestion.confidence > 1) return [];
    const rootPitch = bassPitch(suggestion.root);
    const duration = Math.min(suggestion.durationSteps, stepCount - suggestion.step);
    const beatCount = Math.ceil(duration / beatSteps);
    return Array.from({ length: beatCount }, (_, beat) => {
      const step = suggestion.step + beat * beatSteps;
      const remaining = suggestion.step + duration - step;
      const pitch = rootPitch + (beat % 2 ? 7 : 0);
      return {
        id: `bass-chord-${suggestionIndex}-${beat}-${step}`,
        step,
        pitch,
        durationSteps: Math.min(beatSteps, remaining),
        confidence: suggestion.confidence,
      };
    }).filter((note) => note.step < stepCount);
  });
}

export function generateBassFromMelody(notes: readonly NoteEvent[], stepCount: number): NoteEvent[] {
  if (!Number.isInteger(stepCount) || stepCount < 1) return [];
  return notes.flatMap((note, index) => {
    if (!Number.isInteger(note.step) || note.step < 0 || note.step >= stepCount
      || !Number.isFinite(note.pitch) || note.pitch < 0 || note.pitch > MAX_PITCH
      || !Number.isFinite(note.durationSteps) || note.durationSteps <= 0) return [];
    let pitch = Math.round(note.pitch) - 24;
    while (pitch > 55) pitch -= 12;
    while (pitch < 28) pitch += 12;
    return [{
      id: `bass-melody-${index}-${note.step}-${pitch}`,
      step: note.step,
      pitch,
      durationSteps: Math.min(note.durationSteps, stepCount - note.step),
      ...(note.confidence === undefined ? {} : { confidence: Math.max(0, Math.min(1, note.confidence)) }),
    }];
  });
}

export function addGeneratedBassChannel(project: Project, sourceChannelId: string, notes: readonly NoteEvent[]): Project {
  const source = project.channels.find((channel) => channel.id === sourceChannelId);
  const valid = validNotes(project, notes);
  if (!source || source.generatedMetadata || !valid.length || project.channels.length >= MAX_CHANNELS) return project;
  const next = addChannel(project, `Generated bass · ${source.name}`, 'bass-6');
  const channel = next.channels.at(-1);
  if (!channel || next === project) return project;
  return updateChannel(next, channel.id, {
    notes: valid,
    generatedMetadata: {
      generatedBy: 'arrangement-assistant',
      kind: 'bass-generation',
      sourceChannelId,
      confidence: averageConfidence(valid),
    },
  });
}

export function replaceGeneratedBassChannel(
  project: Project,
  channelId: string,
  sourceChannelId: string,
  notes: readonly NoteEvent[],
): Project {
  const channel = project.channels.find((item) => item.id === channelId);
  const source = project.channels.find((item) => item.id === sourceChannelId);
  const valid = validNotes(project, notes);
  if (!channel?.generatedMetadata || channel.generatedMetadata.kind !== 'bass-generation'
    || !source || source.generatedMetadata || !valid.length) return project;
  return updateChannel(project, channelId, {
    notes: valid,
    generatedMetadata: {
      ...channel.generatedMetadata,
      sourceChannelId,
      confidence: averageConfidence(valid),
    },
  });
}

export function addGeneratedChordChannel(
  project: Project,
  sourceChannelId: string,
  suggestions: readonly ChordSuggestion[],
): Project {
  const source = project.channels.find((channel) => channel.id === sourceChannelId);
  const valid = validSuggestions(project, suggestions);
  if (!source || source.generatedMetadata || !valid.length || project.channels.length >= MAX_CHANNELS) return project;
  const next = addChannel(project, `Suggested chords · ${source.name}`, 'keys-1');
  if (next === project) return project;
  const channel = next.channels.at(-1);
  if (!channel) return project;
  const confidence = valid.reduce((sum, suggestion) => sum + suggestion.confidence, 0) / valid.length;
  return updateChannel(next, channel.id, {
    notes: channelNotes(valid),
    generatedMetadata: { generatedBy: 'arrangement-assistant', kind: 'chord-suggestions', sourceChannelId, confidence },
  });
}

export function replaceGeneratedChordChannel(
  project: Project,
  channelId: string,
  sourceChannelId: string,
  suggestions: readonly ChordSuggestion[],
): Project {
  const channel = project.channels.find((item) => item.id === channelId);
  const source = project.channels.find((item) => item.id === sourceChannelId);
  const valid = validSuggestions(project, suggestions);
  if (!channel?.generatedMetadata || channel.generatedMetadata.kind !== 'chord-suggestions'
    || !source || source.generatedMetadata || !valid.length) return project;
  const confidence = valid.reduce((sum, suggestion) => sum + suggestion.confidence, 0) / valid.length;
  return updateChannel(project, channelId, {
    notes: channelNotes(valid),
    generatedMetadata: { ...channel.generatedMetadata, sourceChannelId, confidence },
  });
}

export function removeGeneratedChordChannel(project: Project, channelId: string): Project {
  const channel = project.channels.find((item) => item.id === channelId);
  return channel?.generatedMetadata?.kind === 'chord-suggestions' ? removeChannel(project, channelId) : project;
}

export function removeGeneratedTrack(project: Project, channelId: string): Project {
  return project.channels.some((channel) => channel.id === channelId && channel.generatedMetadata)
    ? removeChannel(project, channelId)
    : project;
}
