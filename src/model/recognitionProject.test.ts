import { describe, expect, it } from 'vitest';
import { createProject } from './project';
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
      soundId: 'keys-1',
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
    const take = createRecognitionTake('sample-a', result, {
      enabled: true, strength: 1, subdivision: 'sixteenth',
    }, 120, 16, 'take-beat');
    const applied = applyRecognitionTake(project, take)!;
    const channel = applied.channels.find((item) => item.name === 'Recognized Kick')!;
    expect(channel).toMatchObject({
      name: 'Recognized Kick',
      soundId: 'kick-1',
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
      soundId: 'snare-1',
      stepEventMetadata: { 2: { confidence: 0.8, sourceTakeId: 'take-beat' } },
    });
    expect(updated.recognitionTakes[0].quantisedEvents[0]).toMatchObject({
      type: 'snare', startSeconds: event.startSeconds, velocity: event.velocity,
    });
  });

  it('does not partially add a recognition track when the channel limit would be exceeded', () => {
    const project = createProject();
    project.channels = Array.from({ length: 8 }, (_, index) => ({
      ...project.channels[0], id: `channel-${index}`,
    }));
    const take = createRecognitionTake('sample-a', melodyResult, {
      enabled: true, strength: 1, subdivision: 'sixteenth',
    }, 120, 16, 'take-full');
    expect(applyRecognitionTake(project, take)).toBeUndefined();
    expect(project.channels).toHaveLength(8);
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
