import { describe, expect, it } from 'vitest';
import { parseMidiNoteMessage, quantizeMidiNote } from './midi';

describe('parseMidiNoteMessage', () => {
  it('parses note on and note off messages with MIDI channels and velocity', () => {
    expect(parseMidiNoteMessage([0x92, 60, 64])).toEqual({
      type: 'note-on', channel: 2, pitch: 60, velocity: 64 / 127,
    });
    expect(parseMidiNoteMessage([0x82, 60, 32])).toEqual({
      type: 'note-off', channel: 2, pitch: 60, velocity: 32 / 127,
    });
  });

  it('treats zero-velocity note-on as note off and ignores other messages', () => {
    expect(parseMidiNoteMessage([0x90, 60, 0])).toEqual({
      type: 'note-off', channel: 0, pitch: 60, velocity: 0,
    });
    expect(parseMidiNoteMessage([0xb0, 60, 127])).toBeUndefined();
    expect(parseMidiNoteMessage([0x90, 128, 10])).toBeUndefined();
  });
});

describe('quantizeMidiNote', () => {
  it('maps note time and duration onto the project grid', () => {
    expect(quantizeMidiNote(0.31, 0.62, 120, 8, 16)).toEqual({ step: 1, durationSteps: 2 });
  });

  it('wraps start position and bounds note duration to the loop', () => {
    expect(quantizeMidiNote(9, 20, 120, 4, 8)).toEqual({ step: 2, durationSteps: 8 });
  });

  it('rejects invalid timing or project values', () => {
    expect(quantizeMidiNote(-1, 0.2, 120, 4, 16)).toBeUndefined();
    expect(quantizeMidiNote(0, 0.2, 0, 4, 16)).toBeUndefined();
  });
});
