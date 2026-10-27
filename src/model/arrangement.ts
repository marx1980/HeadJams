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
