import {
  addChannel, LOOP_BARS, MAX_CHANNELS, removeChannel, setLoopBars, totalSteps, updateChannel,
  type NoteEvent, type Project, type SoundDef,
} from './project';
import type {
  AppliedSnapshot, PercussionClass, PercussionEvent, RecognitionEvent, RecognitionResult, RecognitionTake,
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

export interface ApplyRecognitionOptions {
  /** Throw away grid edits on this take's tracks and write the recognition result fresh. */
  discardEdits?: boolean;
}

const noteKey = (note: { step: number; pitch: number; durationSteps: number }) => `${note.step}:${note.pitch}:${note.durationSteps}`;

/** The project's loop only grows to fit a take; it never shrinks (shrinking deletes content). */
function growLoopFor(project: Project, take: RecognitionTake, bpm: number): Project {
  let neededSteps = 0;
  for (const event of take.quantisedEvents) {
    if ('pitch' in event) {
      const { step, durationSteps } = noteEventToSteps(
        event, bpm, project.noteLength, take.quantisation.enabled ? take.quantisation.strength : 0, take.quantisation.subdivision,
      );
      neededSteps = Math.max(neededSteps, step + Math.min(durationSteps, 1));
    } else {
      neededSteps = Math.max(neededSteps, percussionEventToStep(
        event, bpm, project.noteLength, take.quantisation.strength, take.quantisation.subdivision,
      ) + 1);
    }
  }
  const neededBars = Math.ceil(neededSteps / project.noteLength);
  const target = LOOP_BARS.find((bars) => bars >= neededBars) ?? LOOP_BARS[LOOP_BARS.length - 1];
  return target > project.loopBars ? setLoopBars(project, target) : project;
}

function generatedNotes(take: RecognitionTake, bpm: number, noteLength: number): NoteEvent[] {
  return take.quantisedEvents.flatMap((event) => {
    if (!('pitch' in event)) return [];
    const { step, durationSteps } = noteEventToSteps(
      event, bpm, noteLength, take.quantisation.enabled ? take.quantisation.strength : 0, take.quantisation.subdivision,
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
}

/**
 * Write a recognition take into the project. On re-apply (new correction, tempo or event edit) the take's
 * tracks are updated in place: anything the user changed on the grid (moved, added or deleted notes and
 * steps) is kept, and the tracks' sound, volume, pan and mute are untouched.
 */
export function applyRecognitionTake(
  project: Project, take: RecognitionTake, bpm = take.tempoBpm, options: ApplyRecognitionOptions = {},
): Project | undefined {
  const previous = project.recognitionTakes.find((candidate) => candidate.id === take.id);
  let next = growLoopFor(project, take, bpm);
  const isPercussion = take.mode === 'beat';
  const exists = (id: string | undefined) => Boolean(id && next.channels.some((channel) => channel.id === id));
  const applied: AppliedSnapshot = {};
  const createdChannelIds: string[] = [];

  if (isPercussion) {
    const len = totalSteps(next);
    const groups = eventsByClass(take.quantisedEvents);
    // Map each event group to its channel. Older takes have no snapshot: their channels were created in group order.
    type GroupSnapshot = NonNullable<AppliedSnapshot['groups']>[string];
    const previousGroups: Record<string, GroupSnapshot> = { ...(previous?.applied?.groups ?? {}) };
    if (previous && !previous.applied?.groups) {
      [...eventsByClass(previous.quantisedEvents).keys()].forEach((key, index) => {
        const channelId = previous.channelIds[index];
        const channel = next.channels.find((candidate) => candidate.id === channelId);
        if (channel) previousGroups[key] = { channelId, steps: [...channel.steps] };
      });
    }
    const keys = [...new Set([...Object.keys(previousGroups), ...groups.keys()])];
    const newChannels = keys.filter((key) => groups.has(key) && !previousGroups[key]).length;
    const needsOriginal = take.sourceSampleId && !exists(previous?.originalChannelId) ? 1 : 0;
    if (next.channels.length + newChannels + needsOriginal > MAX_CHANNELS) return undefined;
    applied.groups = {};
    // Events keep their identity across corrections and reclassification: a hit the user deleted stays deleted.
    const deletedEvents = new Set<string>();
    for (const group of Object.values(previousGroups)) {
      const channel = next.channels.find((candidate) => candidate.id === group.channelId);
      for (const [id, step] of Object.entries(group.events ?? {})) {
        if (step < 0 || (!options.discardEdits && channel && !channel.steps[step])) deletedEvents.add(id);
      }
    }
    for (const key of keys) {
      const group = groups.get(key);
      const known = previousGroups[key];
      if (known && !exists(known.channelId)) {
        applied.groups[key] = known; // the user deleted this track: keep it deleted
        continue;
      }
      const writes: { id: string; step: number; confidence?: number }[] = [];
      const events: Record<string, number> = {};
      for (const event of group?.events ?? []) {
        if (deletedEvents.has(event.id)) { events[event.id] = -1; continue; }
        const step = percussionEventToStep(event, bpm, next.noteLength, take.quantisation.strength, take.quantisation.subdivision) % len;
        writes.push({ id: event.id, step, confidence: event.confidence });
        events[event.id] = step;
      }
      const generated = new Array(len).fill(false);
      const metadata: Record<number, { confidence?: number; sourceTakeId: string }> = {};
      for (const write of writes) {
        generated[write.step] = true;
        metadata[write.step] = { confidence: write.confidence, sourceTakeId: take.id };
      }
      if (!known) {
        if (!group) continue;
        next = addChannel(next, NAME_FOR_CLASS[group.type], group.events[0]?.assignedSoundId ?? SOUND_FOR_CLASS[group.type]);
        const channel = next.channels.at(-1)!;
        next = updateChannel(next, channel.id, { steps: generated, stepEventMetadata: metadata });
        applied.groups[key] = { channelId: channel.id, steps: generated, events };
        createdChannelIds.push(channel.id);
        continue;
      }
      const channel = next.channels.find((candidate) => candidate.id === known.channelId)!;
      const user = Array.from({ length: len }, (_, i) => channel.steps[i] ?? false);
      const last = options.discardEdits ? user : Array.from({ length: len }, (_, i) => known.steps[i] ?? false);
      // Keep steps the user added; clear steps recognition wrote last time (still on); then write this pass.
      const userAdded = user.map((on, i) => on && !last[i]);
      const steps = userAdded.map((added, i) => added || generated[i]);
      const untouched = user.every((on, i) => on === last[i]);
      if (!steps.some(Boolean) && untouched && !group) {
        next = removeChannel(next, channel.id);
        continue;
      }
      const stepEventMetadata = { ...(channel.stepEventMetadata ?? {}) };
      for (let i = 0; i < len; i++) {
        if (stepEventMetadata[i]?.sourceTakeId === take.id && !generated[i]) delete stepEventMetadata[i];
        if (metadata[i]) stepEventMetadata[i] = metadata[i];
      }
      next = updateChannel(next, channel.id, { steps, stepEventMetadata });
      applied.groups[key] = { channelId: channel.id, steps: generated, events };
      createdChannelIds.push(channel.id);
    }
  } else {
    const generated = generatedNotes(take, bpm, next.noteLength);
    const channelId = previous?.channelIds.find((id) => exists(id));
    const needsChannel = !channelId && generated.length && !(previous && previous.channelIds.length) ? 1 : 0;
    const needsOriginal = take.sourceSampleId && !exists(previous?.originalChannelId) ? 1 : 0;
    if (next.channels.length + needsChannel + needsOriginal > MAX_CHANNELS) return undefined;
    if (channelId) {
      const channel = next.channels.find((candidate) => candidate.id === channelId)!;
      const ownNotes = channel.notes.filter((note) => note.sourceTakeId === take.id);
      // Older takes have no snapshot: treat the current grid as what recognition wrote.
      const last: Record<string, string> = options.discardEdits || !previous?.applied?.notes
        ? Object.fromEntries(ownNotes.map((note) => [note.id, noteKey(note)]))
        : { ...previous.applied.notes };
      const byId = new Map(generated.map((note) => [note.id, note]));
      const snapshot: Record<string, string> = { ...last };
      const notes: NoteEvent[] = [];
      const present = new Set<string>();
      for (const note of channel.notes) {
        if (note.sourceTakeId !== take.id) { notes.push(note); continue; } // added by the user
        present.add(note.id);
        const untouched = last[note.id] !== undefined && last[note.id] === noteKey(note);
        if (!untouched) { notes.push(note); continue; } // edited on the grid
        const fresh = byId.get(note.id);
        if (fresh) { notes.push(fresh); snapshot[note.id] = noteKey(fresh); }
        else delete snapshot[note.id];
      }
      for (const note of generated) {
        if (present.has(note.id)) continue;
        if (last[note.id] !== undefined) continue; // the user deleted it
        notes.push(note);
        snapshot[note.id] = noteKey(note);
      }
      next = updateChannel(next, channelId, { notes });
      applied.notes = snapshot;
      createdChannelIds.push(channelId);
    } else if (generated.length && !(previous && previous.channelIds.length)) {
      next = addChannel(next, take.mode === 'bass' ? 'Recognized Bass' : 'Recognized Melody', take.mode === 'bass' ? 'bass-6' : 'keys-1');
      const channel = next.channels.at(-1)!;
      next = updateChannel(next, channel.id, { notes: generated });
      applied.notes = Object.fromEntries(generated.map((note) => [note.id, noteKey(note)]));
      createdChannelIds.push(channel.id);
    } else {
      applied.notes = previous?.applied?.notes; // the user deleted the track: keep it deleted
      if (previous) createdChannelIds.push(...previous.channelIds);
    }
  }

  let originalChannelId = exists(previous?.originalChannelId) ? previous!.originalChannelId : undefined;
  if (take.sourceSampleId && !originalChannelId && !(previous?.originalChannelId)) {
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
  } else if (previous?.originalChannelId && !originalChannelId) {
    originalChannelId = previous.originalChannelId; // the user deleted the original track: keep it deleted
  }

  const savedTake: RecognitionTake = {
    ...take, channelIds: createdChannelIds, ...(originalChannelId ? { originalChannelId } : {}), applied,
  };
  if (!originalChannelId) delete savedTake.originalChannelId;
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
