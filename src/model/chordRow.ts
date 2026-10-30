import { compileChordRow } from '../library/guitar/patterns';
import { totalSteps, updateChannel, type ChordRow, type Project } from './project';

const ROW_PREFIX = 'row-';

/** Set a guitar channel's chord row and rebuild the chord events it generates; hand-added chords stay. */
export function setChordRow(project: Project, channelId: string, row: ChordRow): Project {
  const channel = project.channels.find((item) => item.id === channelId);
  if (!channel) return project;
  const bars = Math.max(1, Math.round(totalSteps(project) / project.noteLength));
  const kept = (channel.chordEvents ?? []).filter((event) => !event.id.startsWith(ROW_PREFIX));
  const events = compileChordRow(row, project.noteLength, bars).filter((event) => event.step < totalSteps(project));
  return updateChannel(project, channelId, { chordRow: { ...row }, chordEvents: [...kept, ...events] });
}

/** Remove a channel's chord row and the events it generated. */
export function clearChordRow(project: Project, channelId: string): Project {
  const channel = project.channels.find((item) => item.id === channelId);
  if (!channel) return project;
  return updateChannel(project, channelId, {
    chordRow: undefined,
    chordEvents: (channel.chordEvents ?? []).filter((event) => !event.id.startsWith(ROW_PREFIX)),
  });
}

/** After the loop length or grid resolution changes, rebuild every chord row so patterns stay aligned. */
export function refreshChordRows(project: Project): Project {
  return project.channels.reduce((next, channel) => channel.chordRow ? setChordRow(next, channel.id, channel.chordRow) : next, project);
}
