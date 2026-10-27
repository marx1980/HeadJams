import {
  addChannel, removeChannel, totalSteps, updateChannel, type Project, type SoundDef,
} from './project';
import type {
  PercussionClass, PercussionEvent, RecognitionEvent, RecognitionResult, RecognitionTake,
} from './recognition';
import { noteEventToSteps, percussionEventToStep, quantiseRecognitionEvents } from '../library/quantisation';
import { SCALES, snapPitchToScale } from './music';

export const SOUND_FOR_CLASS: Record<PercussionClass, string> = {
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

const NAME_FOR_CLASS: Record<PercussionClass, string> = {
  kick: 'Recognized Kick',
  snare: 'Recognized Snare',
  'closed-hat': 'Recognized Closed Hat',
  'open-hat': 'Recognized Open Hat',
  clap: 'Recognized Clap',
  tom: 'Recognized Tom',
  cymbal: 'Recognized Cymbal',
  bass: 'Recognized Bass Percussion',
  unknown: 'Recognized Unknown Percussion',
};

export function createRecognitionTake(
  sampleId: string,
  result: RecognitionResult,
  options: RecognitionTake['quantisation'],
  bpm: number,
  noteLength: number,
  id: string = globalThis.crypto?.randomUUID?.() ?? `take-${Date.now().toString(36)}`,
  pitchCorrection = 0,
  scaleAwarePitch = false,
  scaleRoot = 0,
  scaleId = 'major',
): RecognitionTake {
  const transposeSemitones = 0;
  const correctedEvents = correctRecognitionPitches(result.events, {
    pitchCorrection, scaleAwarePitch, scaleRoot, scaleId, transposeSemitones,
  });
  const quantisedEvents = options.enabled
    ? quantiseRecognitionEvents(correctedEvents, bpm, noteLength, options.subdivision, options.strength)
    : correctedEvents;
  return {
    id,
    sourceSampleId: sampleId,
    mode: result.mode,
    modelId: result.modelId,
    modelVersion: result.modelVersion,
    createdAt: Date.now(),
    tempoBpm: bpm,
    pitchCorrection: Math.max(0, Math.min(1, pitchCorrection)),
    scaleAwarePitch,
    scaleRoot: ((Math.round(scaleRoot) % 12) + 12) % 12,
    scaleId,
    transposeSemitones,
    ...(result.detectedBpm === undefined ? {} : { detectedBpm: result.detectedBpm }),
    tempoAlternatives: [...result.tempoAlternatives],
    quantisation: { ...options },
    originalEvents: result.events.map((event) => ({ ...event })),
    quantisedEvents,
    channelIds: [],
  };
}

export function correctRecognitionPitches(
  events: readonly RecognitionEvent[],
  correction: Pick<RecognitionTake, 'pitchCorrection' | 'scaleAwarePitch' | 'scaleRoot' | 'scaleId' | 'transposeSemitones'>,
): RecognitionEvent[] {
  const strength = Math.max(0, Math.min(1, correction.pitchCorrection));
  const scale = SCALES.find((item) => item.id === correction.scaleId) ?? SCALES[0];
  return events.map((event) => {
    if (!('pitch' in event)) return { ...event };
    const raw = Number.isFinite(event.rawPitch) ? event.rawPitch! : event.pitch;
    const nearest = correction.scaleAwarePitch
      ? snapPitchToScale(Math.round(raw), correction.scaleRoot, scale)
      : Math.round(raw);
    return {
      ...event,
      pitch: Math.max(0, Math.min(127, Math.round(raw + (nearest - raw) * strength + correction.transposeSemitones))),
      ...(event.pitchBend ? { pitchBend: event.pitchBend.map((point) => ({ ...point })) } : {}),
    };
  });
}

export function rebaseRecognitionTakeForTempo(
  take: RecognitionTake,
  tempoBpm: number,
  noteLength: number,
): RecognitionTake {
  const baseline = take.quantisation.enabled
    ? quantiseRecognitionEvents(take.originalEvents, take.tempoBpm, noteLength,
      take.quantisation.subdivision, take.quantisation.strength)
    : take.originalEvents;
  const baselineById = new Map(baseline.map((event) => [event.id, event]));
  const originalById = new Map(take.originalEvents.map((event) => [event.id, event]));
  const rebased = take.quantisedEvents.map((current) => {
    const original = originalById.get(current.id);
    const previous = baselineById.get(current.id);
    if (!original || !previous) return { ...current };
    const startSeconds = Math.max(0, original.startSeconds + current.startSeconds - previous.startSeconds);
    if ('durationSeconds' in current && 'durationSeconds' in original && 'durationSeconds' in previous) {
      return {
        ...original,
        ...current,
        startSeconds,
        durationSeconds: Math.max(0.05, original.durationSeconds + current.durationSeconds - previous.durationSeconds),
      };
    }
    return { ...original, ...current, startSeconds };
  });
  return {
    ...take,
    tempoBpm,
    quantisedEvents: take.quantisation.enabled
      ? quantiseRecognitionEvents(rebased, tempoBpm, noteLength,
        take.quantisation.subdivision, take.quantisation.strength)
      : rebased,
  };
}

function eventsByClass(events: readonly RecognitionEvent[]): Map<string, { type: PercussionClass; events: PercussionEvent[] }> {
  const groups = new Map<string, { type: PercussionClass; events: PercussionEvent[] }>();
  for (const event of events) {
    if (!('type' in event)) continue;
    const soundId = event.assignedSoundId ?? SOUND_FOR_CLASS[event.type];
    const key = `${event.type}:${soundId}`;
    const group = groups.get(key) ?? { type: event.type, events: [] };
    group.events.push(event);
    groups.set(key, group);
  }
  return groups;
}

export function applyRecognitionTake(project: Project, take: RecognitionTake, bpm = take.tempoBpm): Project | undefined {
  let next = project;
  const previous = next.recognitionTakes.find((candidate) => candidate.id === take.id);
  for (const id of previous?.channelIds ?? []) next = removeChannel(next, id);
  if (previous?.originalChannelId) next = removeChannel(next, previous.originalChannelId);

  const isPercussion = take.mode === 'beat';
  const groups = isPercussion ? [...eventsByClass(take.quantisedEvents).entries()] : [];
  const channelCount = isPercussion ? groups.length : take.quantisedEvents.length ? 1 : 0;
  const originalChannelCount = take.sourceSampleId ? 1 : 0;
  if (next.channels.length + channelCount + originalChannelCount > 8) return undefined;
  const createdChannelIds: string[] = [];

  if (isPercussion) {
    for (const [, group] of groups) {
      const { type, events } = group;
      const channelName = NAME_FOR_CLASS[type];
      const soundId = events[0]?.assignedSoundId ?? SOUND_FOR_CLASS[type];
      next = addChannel(next, channelName, soundId);
      const channel = next.channels.at(-1);
      if (!channel) return undefined;
      const steps = new Array(totalSteps(next)).fill(false);
      const stepEventMetadata = { ...(channel.stepEventMetadata ?? {}) };
      for (const event of events) {
        const step = percussionEventToStep(event, bpm, next.noteLength, take.quantisation.strength, take.quantisation.subdivision);
        const loopStep = step % steps.length;
        steps[loopStep] = true;
        stepEventMetadata[loopStep] = { confidence: event.confidence, sourceTakeId: take.id };
      }

      next = updateChannel(next, channel.id, { steps, stepEventMetadata });
      createdChannelIds.push(channel.id);
    }
  } else if (take.quantisedEvents.length) {
    next = addChannel(next, take.mode === 'bass' ? 'Recognized Bass' : 'Recognized Melody', take.mode === 'bass' ? 'bass-6' : 'keys-1');
    const channel = next.channels.at(-1);
    if (!channel) return undefined;
    const notes = take.quantisedEvents.flatMap((event) => {
      if (!('pitch' in event)) return [];
      const { step, durationSteps } = noteEventToSteps(
        event, bpm, next.noteLength, take.quantisation.enabled ? take.quantisation.strength : 0, take.quantisation.subdivision,
      );
      return [{
        id: event.id,
        step,
        pitch: event.pitch,
        durationSteps,
        velocity: event.velocity,
        confidence: event.confidence,
        ...(event.pitchBend ? { pitchBend: event.pitchBend } : {}),
        sourceTakeId: take.id,
      }];
    });
    next = updateChannel(next, channel.id, { notes });
    createdChannelIds.push(channel.id);
  }

  let originalChannelId: string | undefined;
  if (take.sourceSampleId) {
    const soundId = `recognition-original-${take.id}`;
    const sound: SoundDef = {
      id: soundId,
      name: `${take.mode === 'beat' ? 'Percussion' : take.mode === 'bass' ? 'Bass' : 'Melody'} Original`,
      category: 'Samples',
      params: { wave: 'sine', freq: 440, freqEnd: 440, decay: 0.1, cutoff: 12000 },
      sampleId: take.sourceSampleId,
      sampleVersion: 'original',
      assetSource: 'user-sample',
      assetAttribution: 'User-provided audio',
      assetLicense: 'Not verified by MusicMaker',
    };
    if (!next.customSounds.some((candidate) => candidate.id === soundId)) {
      next = { ...next, customSounds: [...next.customSounds, sound] };
    }
    next = addChannel(next, sound.name, soundId);
    const originalChannel = next.channels.at(-1);
    if (originalChannel) {
      originalChannelId = originalChannel.id;
      const steps = new Array(totalSteps(next)).fill(false);
      steps[0] = true;
      next = updateChannel(next, originalChannel.id, { steps, mute: true });
    }
  }

  const savedTake: RecognitionTake = { ...take, channelIds: createdChannelIds, originalChannelId };
  return {
    ...next,
    recognitionTakes: [...next.recognitionTakes.filter((candidate) => candidate.id !== take.id), savedTake],
  };
}

export function removeRecognitionTake(project: Project, takeId: string): Project {
  const take = project.recognitionTakes.find((candidate) => candidate.id === takeId);
  if (!take) return project;
  let next = project;
  for (const id of take.channelIds) next = removeChannel(next, id);
  if (take.originalChannelId) next = removeChannel(next, take.originalChannelId);
  return { ...next, recognitionTakes: next.recognitionTakes.filter((candidate) => candidate.id !== takeId) };
}
