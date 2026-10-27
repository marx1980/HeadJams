import {
  MAX_CHANNELS, addChannel, updateChannel, type DrumRole, type Project,
} from '../model/project';

export interface DrumKitChannel {
  role: DrumRole;
  name: string;
  soundId: string;
}

export interface DrumKit {
  id: string;
  name: string;
  group: string;
  channels: DrumKitChannel[];
}

export const DRUM_KITS: DrumKit[] = [
  {
    id: 'studio-kit',
    name: 'Studio Kit',
    group: 'Acoustic',
    channels: [
      { role: 'kick', name: 'Kick', soundId: 'kick-1' },
      { role: 'snare', name: 'Snare', soundId: 'snare-1' },
      { role: 'hat', name: 'Hi-Hat', soundId: 'hat-1' },
      { role: 'tom', name: 'Tom', soundId: 'tom-2' },
      { role: 'cymbal', name: 'Cymbal', soundId: 'cymbal-2' },
      { role: 'clap', name: 'Clap', soundId: 'clap-1' },
    ],
  },
  {
    id: '808-kit',
    name: '808 Kit',
    group: 'Electronic',
    channels: [
      { role: 'kick', name: 'Kick', soundId: 'kick-6' },
      { role: 'snare', name: 'Snare', soundId: 'snare-4' },
      { role: 'hat', name: 'Hi-Hat', soundId: 'hat-2' },
      { role: 'tom', name: 'Tom', soundId: 'tom-1' },
      { role: 'clap', name: 'Clap', soundId: 'clap-2' },
    ],
  },
  {
    id: 'percussion-kit',
    name: 'Percussion Kit',
    group: 'Other',
    channels: [
      { role: 'hand-percussion', name: 'Hand Percussion', soundId: 'perc-4' },
      { role: 'shaker', name: 'Shaker', soundId: 'perc-8' },
      { role: 'auxiliary', name: 'Cowbell', soundId: 'perc-2' },
    ],
  },
];

export type DrumKitApplication =
  | { status: 'applied'; project: Project }
  | { status: 'confirmation-required'; project: Project }
  | { status: 'capacity-exceeded'; project: Project };

function roleFromSoundId(soundId: string): DrumRole | undefined {
  if (/^kick-\d+$/.test(soundId)) return 'kick';
  if (/^snare-\d+$/.test(soundId)) return 'snare';
  if (/^hat-\d+$/.test(soundId)) return 'hat';
  if (/^tom-\d+$/.test(soundId)) return 'tom';
  if (/^cymbal-\d+$/.test(soundId)) return 'cymbal';
  if (/^clap-\d+$/.test(soundId)) return 'clap';
  if (['perc-3', 'perc-7', 'perc-8'].includes(soundId)) return 'shaker';
  if (['perc-4', 'perc-5'].includes(soundId)) return 'hand-percussion';
  if (/^perc-\d+$/.test(soundId)) return 'auxiliary';
  return undefined;
}

export function applyDrumKit(project: Project, kit: DrumKit, confirmOverwrite = false): DrumKitApplication {
  const matched = new Map<DrumRole, Project['channels'][number]>();
  const usedChannels = new Set<string>();

  for (const assignment of kit.channels) {
    const channel = project.channels.find((candidate) =>
      !usedChannels.has(candidate.id)
      && (candidate.role === assignment.role || (!candidate.role && roleFromSoundId(candidate.soundId) === assignment.role)),
    );
    if (channel) {
      matched.set(assignment.role, channel);
      usedChannels.add(channel.id);
    }
  }

  const additions = kit.channels.filter((assignment) => !matched.has(assignment.role)).length;
  if (project.channels.length + additions > MAX_CHANNELS) return { status: 'capacity-exceeded', project };

  const overwrites = kit.channels.some((assignment) =>
    matched.get(assignment.role)?.soundId !== undefined
    && matched.get(assignment.role)?.soundId !== assignment.soundId,
  );
  if (overwrites && !confirmOverwrite) return { status: 'confirmation-required', project };

  let updated = project;
  for (const assignment of kit.channels) {
    const existing = matched.get(assignment.role);
    if (existing) {
      updated = updateChannel(updated, existing.id, {
        soundId: assignment.soundId,
        name: assignment.name,
        kitId: kit.id,
        role: assignment.role,
      });
    } else {
      updated = addChannel(updated, assignment.name, assignment.soundId);
      const channel = updated.channels.at(-1);
      if (channel) updated = updateChannel(updated, channel.id, { kitId: kit.id, role: assignment.role });
    }
  }
  return { status: 'applied', project: updated };
}

export function findDrumKit(id: string): DrumKit | undefined {
  return DRUM_KITS.find((kit) => kit.id === id);
}
