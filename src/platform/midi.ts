import type { NoteEvent } from '../model/project';
import { Capacitor } from '@capacitor/core';

export type MidiMessage =
  | { type: 'note-on'; channel: number; pitch: number; velocity: number }
  | { type: 'note-off'; channel: number; pitch: number }
  | { type: 'all-notes-off'; channel: number };

export interface RecordedMidiNote {
  pitch: number;
  velocity: number;
  startedAt: number;
}

export function parseMidiMessage(data: ArrayLike<number>): MidiMessage | undefined {
  if (data.length < 2) return undefined;
  const command = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  if (command === 0xb0 && (data[1] === 120 || data[1] === 123)) return { type: 'all-notes-off', channel };
  if (data.length < 3) return undefined;
  const pitch = data[1];
  if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) return undefined;
  if (command === 0x80 || (command === 0x90 && data[2] === 0)) return { type: 'note-off', channel, pitch };
  if (command === 0x90) {
    const rawVelocity = data[2];
    if (!Number.isFinite(rawVelocity) || rawVelocity < 0 || rawVelocity > 127) return undefined;
    return { type: 'note-on', channel, pitch, velocity: rawVelocity / 127 };
  }
  return undefined;
}

export function recordedMidiEvent(
  note: RecordedMidiNote,
  endedAt: number,
  recordingStartedAt: number,
  bpm: number,
  stepsPerBar: number,
  totalSteps: number,
): Omit<NoteEvent, 'id'> | undefined {
  if (![note.pitch, note.velocity, note.startedAt, endedAt, recordingStartedAt, bpm, stepsPerBar, totalSteps]
    .every(Number.isFinite) || bpm <= 0 || stepsPerBar <= 0 || totalSteps <= 0) return undefined;
  const stepMs = 60000 / bpm * 4 / stepsPerBar;
  const start = Math.max(0, Math.round((note.startedAt - recordingStartedAt) / stepMs));
  const finish = Math.max(start + 1, Math.round((endedAt - recordingStartedAt) / stepMs));
  const step = start % totalSteps;
  const durationSteps = Math.max(1, Math.min(totalSteps - step, finish - start));
  return {
    step,
    pitch: Math.max(0, Math.min(127, Math.round(note.pitch))),
    durationSteps,
    velocity: Math.max(0, Math.min(1, note.velocity)),
  };
}

export function supportsMidiInput(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (typeof navigator === 'undefined') return false;
  const midiNavigator = navigator as Navigator & { requestMIDIAccess?: unknown };
  const hostname = typeof location === 'undefined' ? '' : location.hostname;
  const secure = typeof globalThis.isSecureContext === 'undefined' || globalThis.isSecureContext
    || hostname === 'localhost' || hostname === '127.0.0.1';
  return secure && typeof midiNavigator.requestMIDIAccess === 'function';
}
