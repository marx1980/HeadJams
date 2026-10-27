export type MidiNoteMessage =
  | { type: 'note-on'; channel: number; pitch: number; velocity: number }
  | { type: 'note-off'; channel: number; pitch: number; velocity: number };

export function parseMidiNoteMessage(data: ArrayLike<number>): MidiNoteMessage | undefined {
  if (data.length < 3) return undefined;
  const status = Number(data[0]);
  const pitch = Number(data[1]);
  const rawVelocity = Number(data[2]);
  if (![status, pitch, rawVelocity].every(Number.isFinite)) return undefined;
  if (pitch < 0 || pitch > 127 || rawVelocity < 0 || rawVelocity > 127) return undefined;

  const command = status & 0xf0;
  if (command !== 0x80 && command !== 0x90) return undefined;
  const velocity = rawVelocity / 127;
  return {
    type: command === 0x80 || velocity === 0 ? 'note-off' : 'note-on',
    channel: status & 0x0f,
    pitch,
    velocity,
  };
}

export function quantizeMidiNote(
  startSeconds: number,
  durationSeconds: number,
  bpm: number,
  stepsPerBar: number,
  loopSteps: number,
): { step: number; durationSteps: number } | undefined {
  if (![startSeconds, durationSeconds, bpm, stepsPerBar, loopSteps].every(Number.isFinite)
    || startSeconds < 0 || durationSeconds < 0 || bpm <= 0 || !Number.isInteger(stepsPerBar)
    || stepsPerBar <= 0 || !Number.isInteger(loopSteps) || loopSteps <= 0) return undefined;
  const stepDuration = 60 * 4 / bpm / stepsPerBar;
  return {
    step: Math.round(startSeconds / stepDuration) % Math.floor(loopSteps),
    durationSteps: Math.min(Math.floor(loopSteps), Math.max(1, Math.round(durationSeconds / stepDuration))),
  };
}
