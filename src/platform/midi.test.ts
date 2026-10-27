import { describe, expect, it } from 'vitest';
import { parseMidiMessage, recordedMidiEvent } from './midi';

describe('MIDI input', () => {
  it('parses note on, note off and channel all-notes-off messages', () => {
    expect(parseMidiMessage([0x92, 60, 127])).toEqual({ type: 'note-on', channel: 2, pitch: 60, velocity: 1 });
    expect(parseMidiMessage([0x82, 60, 64])).toEqual({ type: 'note-off', channel: 2, pitch: 60 });
    expect(parseMidiMessage([0x92, 60, 0])).toEqual({ type: 'note-off', channel: 2, pitch: 60 });
    expect(parseMidiMessage([0xb2, 123, 0])).toEqual({ type: 'all-notes-off', channel: 2 });
    expect(parseMidiMessage([0xe0, 0, 64])).toBeUndefined();
    expect(parseMidiMessage([0x90, 128, 80])).toBeUndefined();
  });

  it('quantizes recorded notes to the current grid and keeps velocity', () => {
    expect(recordedMidiEvent(
      { pitch: 64, velocity: 0.75, startedAt: 1000 }, 1300, 1000, 120, 8, 8,
    )).toEqual({ step: 0, pitch: 64, durationSteps: 1, velocity: 0.75 });
    expect(recordedMidiEvent(
      { pitch: 72, velocity: 1, startedAt: 1250 }, 1750, 1000, 120, 16, 16,
    )).toEqual({ step: 2, pitch: 72, durationSteps: 4, velocity: 1 });
  });

  it('wraps a start position into the loop and bounds note length to the bar', () => {
    expect(recordedMidiEvent(
      { pitch: 128, velocity: 2, startedAt: 5000 }, 6000, 1000, 120, 16, 16,
    )).toEqual({ step: 0, pitch: 127, durationSteps: 8, velocity: 1 });
    expect(recordedMidiEvent(
      { pitch: 60, velocity: 1, startedAt: 0 }, 100, 0, 0, 16, 16,
    )).toBeUndefined();
  });
});
