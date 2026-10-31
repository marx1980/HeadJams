import {
  MAX_CHANNELS, addChannel, totalSteps, updateChannel, type DrumRole, type KitLane, type Project,
} from '../model/project';

export interface DrumKitChannel {
  role: DrumRole;
  name: string;
  soundId: string;
}

export interface DrumKitLane {
  /** Drum-map role; lanes with the same id map onto each other when a kit channel changes kit. */
  id: string;
  name: string;
  soundId: string;
}

export interface DrumKit {
  id: string;
  name: string;
  group: string;
  channels: DrumKitChannel[];
  /** The kit as one channel's lanes (expansion.md E2b). */
  lanes: DrumKitLane[];
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
    lanes: [
      { id: 'kick', name: 'Kick', soundId: 'kick-1' },
      { id: 'snare', name: 'Snare', soundId: 'snare-1' },
      { id: 'hat-closed', name: 'Closed hat', soundId: 'hat-1' },
      { id: 'hat-open', name: 'Open hat', soundId: 'hat-3' },
      { id: 'tom-mid', name: 'Tom', soundId: 'tom-2' },
      { id: 'crash', name: 'Cymbal', soundId: 'cymbal-2' },
      { id: 'clap', name: 'Clap', soundId: 'clap-1' },
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
    lanes: [
      { id: 'kick', name: 'Kick', soundId: 'kick-6' },
      { id: 'snare', name: 'Snare', soundId: 'snare-4' },
      { id: 'hat-closed', name: 'Closed hat', soundId: 'hat-2' },
      { id: 'hat-open', name: 'Open hat', soundId: 'hat-3' },
      { id: 'tom-mid', name: 'Tom', soundId: 'tom-1' },
      { id: 'clap', name: 'Clap', soundId: 'clap-2' },
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
    lanes: [
      { id: 'hand-percussion', name: 'Hand percussion', soundId: 'perc-4' },
      { id: 'shaker', name: 'Shaker', soundId: 'perc-8' },
      { id: 'cowbell', name: 'Cowbell', soundId: 'perc-2' },
    ],
  },
  {
    id: 'acoustic-kit',
    name: 'Acoustic Kit',
    group: 'Acoustic',
    channels: [
      { role: 'kick', name: 'Kick', soundId: 'acoustic-kick' },
      { role: 'snare', name: 'Snare', soundId: 'acoustic-snare' },
      { role: 'hat', name: 'Hi-Hat', soundId: 'acoustic-hat-closed' },
      { role: 'tom', name: 'Tom', soundId: 'acoustic-tom-mid' },
      { role: 'cymbal', name: 'Crash', soundId: 'acoustic-crash' },
    ],
    lanes: [
      { id: 'kick', name: 'Kick', soundId: 'acoustic-kick' },
      { id: 'snare', name: 'Snare', soundId: 'acoustic-snare' },
      { id: 'sidestick', name: 'Side stick', soundId: 'acoustic-sidestick' },
      { id: 'hat-closed', name: 'Closed hat', soundId: 'acoustic-hat-closed' },
      { id: 'hat-pedal', name: 'Pedal hat', soundId: 'acoustic-hat-pedal' },
      { id: 'hat-open', name: 'Open hat', soundId: 'acoustic-hat-open' },
      { id: 'tom-high', name: 'Tom high', soundId: 'acoustic-tom-high' },
      { id: 'tom-mid', name: 'Tom mid', soundId: 'acoustic-tom-mid' },
      { id: 'tom-low', name: 'Tom low', soundId: 'acoustic-tom-low' },
      { id: 'crash', name: 'Crash', soundId: 'acoustic-crash' },
      { id: 'ride', name: 'Ride', soundId: 'acoustic-ride' },
    ],
  },
];

export type DrumKitApplication =
  | { status: 'applied'; project: Project }
  | { status: 'confirmation-required'; project: Project }
  | { status: 'capacity-exceeded'; project: Project };

function roleFromSoundId(soundId: string): DrumRole | undefined {
  const acoustic = /^acoustic-(.+)$/.exec(soundId)?.[1];
  if (acoustic) {
    if (acoustic === 'kick') return 'kick';
    if (acoustic === 'snare' || acoustic === 'sidestick') return 'snare';
    if (acoustic.startsWith('hat-')) return 'hat';
    if (acoustic.startsWith('tom-')) return 'tom';
    if (acoustic === 'crash' || acoustic.startsWith('ride')) return 'cymbal';
  }
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

/** Lanes shown before "All lanes" is opened: the core of a kit plus any lane with hits. */
export const CORE_LANES = ['kick', 'snare', 'hat-closed', 'hand-percussion', 'shaker'];

/** Add one channel holding the whole kit as lanes. */
export function addKitChannel(project: Project, kit: DrumKit): Project {
  if (project.channels.length >= MAX_CHANNELS || !kit.lanes.length) return project;
  const next = addChannel(project, kit.name, kit.lanes[0].soundId);
  const channel = next.channels.at(-1);
  if (next === project || !channel) return project;
  const length = totalSteps(next);
  const lanes: KitLane[] = kit.lanes.map((lane) => ({ ...lane, steps: new Array(length).fill(false) }));
  return updateChannel(next, channel.id, { kitId: kit.id, lanes });
}

/**
 * Switch a kit channel to another kit: lanes with the same role take the new kit's sound (their steps stay);
 * lanes the new kit lacks keep their sound; the new kit's other lanes are added empty.
 */
export function setKitChannelKit(project: Project, channelId: string, kit: DrumKit): Project {
  const channel = project.channels.find((item) => item.id === channelId);
  if (!channel?.lanes) return project;
  const length = channel.steps.length;
  const byId = new Map(kit.lanes.map((lane) => [lane.id, lane]));
  const lanes: KitLane[] = channel.lanes.map((lane) => {
    const match = byId.get(lane.id);
    return match ? { ...lane, name: match.name, soundId: match.soundId } : lane;
  });
  for (const lane of kit.lanes) {
    if (!lanes.some((existing) => existing.id === lane.id)) lanes.push({ ...lane, steps: new Array(length).fill(false) });
  }
  // Keep the kit's own order, then any lanes it does not have.
  const order = (id: string) => { const index = kit.lanes.findIndex((lane) => lane.id === id); return index < 0 ? kit.lanes.length : index; };
  lanes.sort((a, b) => order(a.id) - order(b.id));
  return updateChannel(project, channelId, {
    kitId: kit.id, lanes, soundId: lanes[0]?.soundId ?? channel.soundId, name: channel.name === findDrumKit(channel.kitId ?? '')?.name ? kit.name : channel.name,
  });
}

/** Kits for dropdowns: recorded kits first, kits made of synthesised sounds last. */
export const DRUM_KITS_RECORDED_FIRST: DrumKit[] = [
  ...DRUM_KITS.filter((kit) => kit.lanes.every((lane) => lane.soundId.startsWith('acoustic-'))),
  ...DRUM_KITS.filter((kit) => !kit.lanes.every((lane) => lane.soundId.startsWith('acoustic-'))),
];
