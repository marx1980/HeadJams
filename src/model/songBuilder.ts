import { findSound } from '../library/sounds';
import { addPattern, syncedPatterns, totalSteps, type ArrangementClip, type Channel, type Project } from './project';

/** Song builder (hum.md H7): section templates over existing patterns, with a density per section. */

export type Density = 'sparse' | 'medium' | 'full';
export const DENSITIES: ReadonlyArray<{ id: Density; label: string }> = [
  { id: 'sparse', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'full', label: 'Big' },
];

export interface SongSection {
  name: string;
  patternId: string;
  density: Density;
}

export type SongTemplate = 'short' | 'loop' | 'full';
export const SONG_TEMPLATES: ReadonlyArray<{ id: SongTemplate; label: string }> = [
  { id: 'short', label: 'Short idea' },
  { id: 'loop', label: 'Loop' },
  { id: 'full', label: 'Full song' },
];

export type ChannelRole = 'drums' | 'bass' | 'chords' | 'melody' | 'extra';

/** What a track does in the mix, to decide what drops out in smaller sections. */
export function channelRole(project: Project, channel: Channel): ChannelRole {
  const sound = findSound(project, channel.soundId);
  const kind = channel.generatedMetadata?.kind;
  if (kind === 'harmony-generation') return 'extra';
  if (kind === 'chord-suggestions' || kind === 'accompaniment-generation') return 'chords';
  if (kind === 'bass-generation') return 'bass';
  if (channel.lanes || channel.role || sound?.playbackMode === 'one-shot') return 'drums';
  if (sound?.playbackMode === 'chord' || (channel.chordEvents?.length ?? 0) > 0) return 'chords';
  if (sound?.category === 'Bass') return 'bass';
  return 'melody';
}

/** Channels left out at a density: Medium drops extra layers; Small keeps only chords and melody (or drums if that is all). */
export function mutedForDensity(project: Project, channels: readonly Channel[], density: Density): string[] {
  if (density === 'full') return [];
  const roles = channels.map((channel) => ({ id: channel.id, role: channelRole(project, channel) }));
  if (density === 'medium') return roles.filter((item) => item.role === 'extra').map((item) => item.id);
  const keep = roles.filter((item) => item.role === 'chords' || item.role === 'melody');
  if (!keep.length) return roles.filter((item) => item.role !== 'drums').map((item) => item.id);
  return roles.filter((item) => item.role !== 'chords' && item.role !== 'melody').map((item) => item.id);
}

/** Sections for a template. Verses use the first pattern, choruses the second when there is one. */
export function templateSections(project: Project, template: SongTemplate): SongSection[] {
  const patterns = project.patterns.length ? project.patterns.map((pattern) => pattern.id) : ['current'];
  const verse = project.currentPatternId && patterns.includes(project.currentPatternId) ? project.currentPatternId : patterns[0];
  const chorus = patterns.find((id) => id !== verse) ?? verse;
  if (template === 'short') return [{ name: 'Idea', patternId: verse, density: 'full' }, { name: 'Idea', patternId: chorus, density: 'full' }];
  if (template === 'loop') return Array.from({ length: 4 }, () => ({ name: 'Loop', patternId: verse, density: 'full' as const }));
  return [
    { name: 'Intro', patternId: verse, density: 'sparse' },
    { name: 'Verse', patternId: verse, density: 'medium' },
    { name: 'Chorus', patternId: chorus, density: 'full' },
    { name: 'Verse', patternId: verse, density: 'medium' },
    { name: 'Chorus', patternId: chorus, density: 'full' },
    { name: 'Outro', patternId: verse, density: 'sparse' },
  ];
}

/** Lay the sections out as the arrangement (replacing it). The loop becomes a pattern first if it is not one. */
export function buildSong(project: Project, sections: readonly SongSection[]): Project {
  if (!sections.length) return project;
  let next = project;
  let currentId = project.currentPatternId;
  if (!currentId) {
    next = addPattern(next, 'Pattern 1');
    currentId = next.currentPatternId!;
  }
  const patterns = syncedPatterns(next);
  const arrangement: ArrangementClip[] = [];
  let start = 0;
  sections.forEach((section, index) => {
    const id = section.patternId === 'current' ? currentId! : section.patternId;
    const pattern = patterns.find((item) => item.id === id);
    if (!pattern) return;
    const length = pattern.lengthSteps || totalSteps(next);
    const muted = mutedForDensity(next, pattern.channels, section.density);
    arrangement.push({
      id: `clip-${index + 1}`, patternId: pattern.id, startStep: start, lengthSteps: length, section: section.name,
      ...(muted.length ? { mutedChannelIds: muted } : {}),
    });
    start += length;
  });
  return { ...next, arrangement };
}
