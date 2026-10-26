import type { Channel } from './project';

export interface Pattern {
  id: string;
  name: string;
  channels: Channel[];
}

export function createPattern(id: string, name: string, channels: Channel[]): Pattern {
  return { id, name, channels: channels.map((channel) => ({ ...channel, steps: [...channel.steps] })) };
}

export function duplicatePattern(pattern: Pattern, id: string, name: string): Pattern {
  return createPattern(id, name, pattern.channels);
}
