import type { Channel, Pattern } from './project';

export function createPattern(id: string, name: string, channels: Channel[]): Pattern {
  return {
    id,
    name,
    channels: channels.map((channel) => ({
      ...channel,
      steps: [...channel.steps],
      notes: (channel.notes ?? []).map((note) => ({
        ...note,
        ...(note.pitchBend ? { pitchBend: note.pitchBend.map((point) => ({ ...point })) } : {}),
      })),
      ...(channel.stepEventMetadata ? {
        stepEventMetadata: Object.fromEntries(Object.entries(channel.stepEventMetadata).map(([step, metadata]) => [
          step, { ...metadata },
        ])),
      } : {}),
      ...(channel.chordEvents ? { chordEvents: channel.chordEvents.map((event) => ({ ...event })) } : {}),
    })),
    lengthSteps: Math.max(1, ...channels.map((channel) => channel.steps.length)),
  };
}

export function duplicatePattern(pattern: Pattern, id: string, name: string): Pattern {
  return { ...createPattern(id, name, pattern.channels), lengthSteps: pattern.lengthSteps };
}
