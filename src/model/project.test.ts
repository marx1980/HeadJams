import { describe, expect, it } from 'vitest';
import { audibleChannels, createChannel, createProject, setLoopBars, toggleStep } from './project';

describe('project model', () => {
  it('toggles a step', () => {
    const p = toggleStep(createProject(), 'ch1', 3);
    expect(p.channels[0].steps[3]).toBe(true);
  });
  it('resizes steps when loop length changes, keeping content', () => {
    const p = setLoopBars(toggleStep(createProject(), 'ch1', 2), 2);
    expect(p.channels[0].steps).toHaveLength(32);
    expect(p.channels[0].steps[2]).toBe(true);
  });
  it('honours solo and mute', () => {
    const p = createProject();
    p.channels.push({ ...createChannel('ch2', 'Snare', 'snare'), solo: true });
    expect(audibleChannels(p).map((c) => c.id)).toEqual(['ch2']);
  });
});
