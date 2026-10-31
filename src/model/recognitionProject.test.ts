import { hearTakeAs } from './hearAs';
import { describe, expect, it } from 'vitest';
import { createProject, MAX_CHANNELS } from './project';
import { applyRecognitionTake, createRecognitionTake, rebaseRecognitionTakeForTempo } from './recognitionProject';
import type { RecognitionResult } from './recognition';

const melodyResult: RecognitionResult = {
  mode: 'melody',
  modelId: 'local-yin-pitch-tracker',
  modelVersion: '1',
  events: [{
    id: 'note-a',
    pitch: 69,
    startSeconds: 0.13,
    durationSeconds: 0.5,
    velocity: 0.8,
    confidence: 0.6,
  }],
  tempoAlternatives: [],
};

describe('recognition project integration', () => {
  it('creates an editable note track with source confidence and take provenance', () => {
    const project = createProject();
    const take = createRecognitionTake('sample-a', melodyResult, {
      enabled: true, strength: 1, subdivision: 'sixteenth',
    }, 120, 16, 'take-a');
    const updated = applyRecognitionTake(project, take);

    expect(updated?.recognitionTakes[0].channelIds).toHaveLength(1);
    expect(updated?.channels.find((channel) => channel.id !== 'ch1')).toMatchObject({
      name: 'Recognized Melody',
      soundId: 'grand-piano',
      notes: [{
        id: 'note-a', step: 1, pitch: 69, confidence: 0.6, sourceTakeId: 'take-a',
      }],
    });
    // The recording is attached to the track (play-what-I-sang toggle) instead of a separate muted channel.
    expect(updated?.recognitionTakes[0].originalChannelId).toBeUndefined();
    const track = updated?.channels.find((channel) => channel.id === updated.recognitionTakes[0].channelIds[0]);
    expect(track).toMatchObject({ original: { soundId: 'recognition-original-take-a', offsetSec: 0 }, playOriginal: false });
    expect(updated?.channels).toHaveLength(2);
    expect(updated?.customSounds.at(-1)).toMatchObject({
      sampleId: 'sample-a', sampleVersion: 'original',
    });
  });

  it('maps beat events to playable grid steps and preserves event timing when reclassified', () => {
    const project = createProject();
    const result: RecognitionResult = {
      mode: 'beat',
      modelId: 'local-onset-classifier',
      modelVersion: '1',
      events: [{
        id: 'hit-a', type: 'kick', startSeconds: 0.26, velocity: 0.7, confidence: 0.8,
      }],
      tempoAlternatives: [],
    };
    const take = { ...createRecognitionTake('sample-a', result, {
      enabled: true, strength: 1, subdivision: 'sixteenth',
    }, 120, 16, 'take-beat'), kitLanes: undefined }; // older per-drum tracks
    const applied = applyRecognitionTake(project, take)!;
    const channel = applied.channels.find((item) => item.name === 'Recognized Kick')!;
    expect(channel).toMatchObject({
      name: 'Recognized Kick',
      soundId: 'acoustic-kick',
      stepEventMetadata: { 2: { confidence: 0.8, sourceTakeId: 'take-beat' } },
    });
    expect(channel.steps.slice(0, 4)).toEqual([false, false, true, false]);

    const event = take.quantisedEvents[0];
    if (!('type' in event)) throw new Error('Expected a percussion event.');
    const reclassified = {
      ...take,
      quantisedEvents: [{ ...event, type: 'snare' as const }],
    };
    const updated = applyRecognitionTake(applied, reclassified)!;
    expect(updated.channels.find((item) => item.name === 'Recognized Snare')).toMatchObject({
      name: 'Recognized Snare',
      soundId: 'acoustic-snare',
      stepEventMetadata: { 2: { confidence: 0.8, sourceTakeId: 'take-beat' } },
    });
    expect(updated.recognitionTakes[0].quantisedEvents[0]).toMatchObject({
      type: 'snare', startSeconds: event.startSeconds, velocity: event.velocity,
    });
  });

  it('does not partially add a recognition track when the channel limit would be exceeded', () => {
    const project = createProject();
    project.channels = Array.from({ length: MAX_CHANNELS }, (_, index) => ({
      ...project.channels[0], id: `channel-${index}`,
    }));
    const take = createRecognitionTake('sample-a', melodyResult, {
      enabled: true, strength: 1, subdivision: 'sixteenth',
    }, 120, 16, 'take-full');
    expect(applyRecognitionTake(project, take)).toBeUndefined();
    expect(project.channels).toHaveLength(MAX_CHANNELS);
  });

  it('re-quantises source timing at a new tempo without losing pitch edits', () => {
    const event = {
      id: 'note-a', pitch: 69, rawPitch: 69.2, startSeconds: 0.07, durationSeconds: 0.4,
      velocity: 0.8, confidence: 0.9,
    };
    const take = createRecognitionTake('sample-a', { ...melodyResult, events: [event] }, {
      enabled: true, strength: 1, subdivision: 'sixteenth',
    }, 120, 16, 'tempo-take');
    take.quantisedEvents = [{ ...take.quantisedEvents[0], pitch: 72 }];
    const rebased = rebaseRecognitionTakeForTempo(take, 100, 16);
    expect(rebased.quantisedEvents[0]).toMatchObject({ pitch: 72, startSeconds: 0 });
    expect(take.originalEvents[0]).toMatchObject({ pitch: 69, startSeconds: 0.07 });
  });
});

describe('hear as (hum.md H2)', () => {
  const melody = (): RecognitionResult => ({
    mode: 'melody', modelId: 'm', modelVersion: '1', tempoAlternatives: [],
    events: [{ id: 'n1', pitch: 60, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, confidence: 0.9 }],
  });
  const beat = (): RecognitionResult => ({
    mode: 'beat', modelId: 'm', modelVersion: '1', tempoAlternatives: [],
    events: [
      { id: 'k', type: 'kick', startSeconds: 0, velocity: 1 },
      { id: 's', type: 'snare', startSeconds: 0.5, velocity: 1 },
    ],
  });
  const quant = { enabled: true, strength: 1, subdivision: 'sixteenth' as const };

  it('older takes keep their Classic sounds; new takes start on sampled instruments', () => {
    const legacy = { ...createRecognitionTake('a', melody(), quant, 120, 16, 'old'), hearAs: undefined };
    const project = applyRecognitionTake(createProject(), legacy)!;
    expect(project.channels.at(-1)!.soundId).toBe('keys-1');
    const bass = createRecognitionTake('a', { ...melody(), mode: 'bass' }, quant, 120, 16, 'b');
    expect(applyRecognitionTake(createProject(), bass)!.channels.at(-1)!.soundId).toBe('electric-bass');
  });

  it('switches a melody track between instruments without touching its notes', () => {
    const take = createRecognitionTake('a', melody(), quant, 120, 16, 'm');
    const project = applyRecognitionTake(createProject(), take)!;
    const track = project.channels.at(-1)!;
    for (const [id, soundId] of [['strings', 'strings'], ['guitar', 'nylon-guitar'], ['bass', 'electric-bass'], ['synth', 'keys-1'], ['piano', 'grand-piano']] as const) {
      const heard = hearTakeAs(project, 'm', id);
      const channel = heard.channels.find((c) => c.id === track.id)!;
      expect(channel.soundId).toBe(soundId);
      expect(channel.notes).toEqual(track.notes);
      expect(heard.recognitionTakes.find((t) => t.id === 'm')!.hearAs).toBe(id);
    }
    expect(hearTakeAs(project, 'm', 'acoustic')).toBe(project);
  });

  it('switches a beat between kits, keeps hand-picked sounds, and corrections still update the same tracks', () => {
    const take = { ...createRecognitionTake('a', beat(), quant, 120, 16, 'bt'), kitLanes: undefined };
    let project = applyRecognitionTake(createProject(), take)!;
    const kick = project.channels.find((c) => c.name === 'Recognized Kick')!;
    const snare = project.channels.find((c) => c.name === 'Recognized Snare')!;
    project = { ...project, channels: project.channels.map((c) => c.id === snare.id ? { ...c, soundId: 'clap-2' } : c) };
    project = hearTakeAs(project, 'bt', 'classic');
    expect(project.channels.find((c) => c.id === kick.id)!.soundId).toBe('kick-1');
    expect(project.channels.find((c) => c.id === snare.id)!.soundId).toBe('clap-2');
    const count = project.channels.length;
    const stored = project.recognitionTakes.find((t) => t.id === 'bt')!;
    const again = applyRecognitionTake(project, { ...stored, quantisation: { ...stored.quantisation, strength: 0.5 } })!;
    expect(again.channels).toHaveLength(count);
    expect(hearTakeAs(again, 'bt', 'acoustic').channels.find((c) => c.id === kick.id)!.soundId).toBe('acoustic-kick');
  });
  it('puts a new melody track on the instrument the user chose, and a re-apply keeps it', () => {
    const take = createRecognitionTake('sample-a', melodyResult, { enabled: true, strength: 1, subdivision: 'sixteenth' }, 120, 16, 'take-a');
    const chosen = applyRecognitionTake(createProject(), take, undefined, { soundId: 'alto-sax' })!;
    expect(chosen.channels.at(-1)!.soundId).toBe('alto-sax');
    const again = applyRecognitionTake(chosen, chosen.recognitionTakes[0])!;
    expect(again.channels.at(-1)!.soundId).toBe('alto-sax');
    // Without a choice the take's own default still applies (older callers).
    expect(applyRecognitionTake(createProject(), take)!.channels.at(-1)!.soundId).not.toBe('alto-sax');
  });
});
