import {
  addArrangementClip, addPattern, arrangementLength, selectPattern, totalSteps, updateChannel, type NoteEvent, type Project,
} from './project';

/**
 * Put a generated next phrase after the current one (hum.md H6): the current loop becomes pattern A (if it is not
 * a pattern yet), a copy with the melody replaced becomes the next pattern, and the arrangement plays A then B.
 * The new melody is marked as generated. The user stays on pattern A.
 */
export function withNextPhrase(project: Project, sourceChannelId: string, notes: readonly NoteEvent[], name: string): Project {
  if (!notes.length || !project.channels.some((channel) => channel.id === sourceChannelId)) return project;
  let next = project.currentPatternId ? project : addPattern(project, 'Phrase A');
  const first = next.currentPatternId!;
  const length = totalSteps(next);
  next = addPattern(next, name);
  const second = next.currentPatternId!;
  next = updateChannel(next, sourceChannelId, {
    notes: notes.filter((note) => note.step < length).map((note) => ({ ...note })),
    generatedMetadata: { generatedBy: 'arrangement-assistant', kind: 'phrase-variation', sourceChannelId, confidence: 1 },
  });
  next = selectPattern(next, first);
  if (!next.arrangement.length) next = addArrangementClip(next, first, 0, length);
  return addArrangementClip(next, second, arrangementLength(next), length);
}
