import { describe, expect, it } from 'vitest';
import { createChannel } from './project';
import { createPattern, duplicatePattern } from './pattern';

describe('pattern model', () => {
  it('copies channels and step data when creating a pattern', () => {
    const channel = createChannel('ch1', 'Kick', 'kick-1');
    channel.steps[0] = true;
    const pattern = createPattern('pattern-1', 'Verse', [channel]);

    expect(pattern).toMatchObject({ id: 'pattern-1', name: 'Verse' });
    expect(pattern.channels[0]).not.toBe(channel);
    expect(pattern.channels[0].steps).not.toBe(channel.steps);
    pattern.channels[0].steps[0] = false;
    expect(channel.steps[0]).toBe(true);
  });

  it('duplicates a pattern without sharing mutable channel state', () => {
    const original = createPattern('pattern-1', 'Verse', [createChannel('ch1', 'Kick', 'kick-1')]);
    const duplicate = duplicatePattern(original, 'pattern-2', 'Chorus');

    expect(duplicate).toMatchObject({ id: 'pattern-2', name: 'Chorus' });
    expect(duplicate.channels[0]).not.toBe(original.channels[0]);
    expect(duplicate.channels[0].steps).not.toBe(original.channels[0].steps);
  });
});
