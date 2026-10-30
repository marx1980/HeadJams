import { updateChannel, type Project } from './project';
import type { PercussionClass, RecognitionMode, RecognitionTake } from './recognition';

/** How a recognised idea is heard (hum.md H2). Melody and bass pick an instrument; beats pick a kit. */
export type HearAsId = 'piano' | 'guitar' | 'bass' | 'strings' | 'synth' | 'acoustic' | 'classic';

export const HEAR_AS_PITCHED: ReadonlyArray<{ id: HearAsId; label: string }> = [
  { id: 'piano', label: 'Piano' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'bass', label: 'Bass' },
  { id: 'strings', label: 'Strings' },
  { id: 'synth', label: 'Synth' },
];
export const HEAR_AS_BEAT: ReadonlyArray<{ id: HearAsId; label: string }> = [
  { id: 'acoustic', label: 'Acoustic kit' },
  { id: 'classic', label: 'Classic kit' },
];

const PITCHED_SOUND: Record<string, string> = {
  piano: 'grand-piano', guitar: 'nylon-guitar', bass: 'electric-bass', strings: 'strings',
};
/** Classic (synth) sounds: what recognised tracks used before H2. */
const SYNTH_SOUND: Record<'melody' | 'bass', string> = { melody: 'keys-1', bass: 'bass-6' };

export const CLASSIC_SOUND_FOR_CLASS: Record<PercussionClass, string> = {
  kick: 'kick-1',
  snare: 'snare-1',
  'closed-hat': 'hat-1',
  'open-hat': 'hat-3',
  clap: 'clap-1',
  tom: 'tom-1',
  cymbal: 'cymbal-1',
  bass: 'perc-4',
  unknown: 'perc-6',
};
const ACOUSTIC_SOUND_FOR_CLASS: Record<PercussionClass, string> = {
  ...CLASSIC_SOUND_FOR_CLASS,
  kick: 'acoustic-kick',
  snare: 'acoustic-snare',
  'closed-hat': 'acoustic-hat-closed',
  'open-hat': 'acoustic-hat-open',
  tom: 'acoustic-tom-mid',
  cymbal: 'acoustic-crash',
};

/** What a new take is heard as. Older takes (no `hearAs`) keep the Classic sounds they were made with. */
export function defaultHearAs(mode: RecognitionMode): HearAsId {
  return mode === 'beat' ? 'acoustic' : mode === 'bass' ? 'bass' : 'piano';
}

export function hearAsOf(take: Pick<RecognitionTake, 'mode' | 'hearAs'>): HearAsId {
  return take.hearAs ?? (take.mode === 'beat' ? 'classic' : 'synth');
}

/** Sound for a melody or bass track heard as `id`. */
export function pitchedSoundFor(mode: RecognitionMode, id: HearAsId): string {
  return PITCHED_SOUND[id] ?? SYNTH_SOUND[mode === 'bass' ? 'bass' : 'melody'];
}

/** Sound for a beatbox class in a take, following its kit. */
export function soundForClass(take: Pick<RecognitionTake, 'mode' | 'hearAs'>, type: PercussionClass): string {
  return (hearAsOf(take) === 'acoustic' ? ACOUSTIC_SOUND_FOR_CLASS : CLASSIC_SOUND_FOR_CLASS)[type];
}

/** The sound a take's new melody/bass track starts with. */
export function trackSoundFor(take: Pick<RecognitionTake, 'mode' | 'hearAs'>): string {
  return pitchedSoundFor(take.mode, hearAsOf(take));
}

/**
 * Switch what a take is heard as without re-analysis: its tracks change sound, nothing else.
 * Beat tracks only change when they still use their class's default sound (a sound picked by hand stays).
 */
export function hearTakeAs(project: Project, takeId: string, id: HearAsId): Project {
  const take = project.recognitionTakes.find((candidate) => candidate.id === takeId);
  if (!take) return project;
  const valid = (take.mode === 'beat' ? HEAR_AS_BEAT : HEAR_AS_PITCHED).some((option) => option.id === id);
  if (!valid) return project;
  let next: Project = {
    ...project,
    recognitionTakes: project.recognitionTakes.map((candidate) => candidate.id === takeId ? { ...candidate, hearAs: id } : candidate),
  };
  const updated = { ...take, hearAs: id };
  const exists = (channelId: string) => next.channels.some((channel) => channel.id === channelId);
  if (take.mode !== 'beat') {
    const soundId = pitchedSoundFor(take.mode, id);
    for (const channelId of take.channelIds) if (exists(channelId)) next = updateChannel(next, channelId, { soundId });
    return next;
  }
  for (const [key, group] of Object.entries(take.applied?.groups ?? {})) {
    const type = key.slice(0, key.indexOf(':')) as PercussionClass;
    const channel = next.channels.find((candidate) => candidate.id === group.channelId);
    if (!channel || !(type in CLASSIC_SOUND_FOR_CLASS)) continue;
    const defaults = [CLASSIC_SOUND_FOR_CLASS[type], ACOUSTIC_SOUND_FOR_CLASS[type]];
    if (defaults.includes(channel.soundId)) next = updateChannel(next, channel.id, { soundId: soundForClass(updated, type) });
  }
  return next;
}
