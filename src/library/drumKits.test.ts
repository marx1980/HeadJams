import { describe, expect, it } from 'vitest';
import { addPattern, createProject, toggleStep } from '../model/project';
import { applyDrumKit, DRUM_KITS } from './drumKits';

describe('drum kits', () => {
  it('applies a kit by role and preserves the active pattern content', () => {
    let project = addPattern(toggleStep(createProject(), 'ch1', 2), 'Verse');
    const result = applyDrumKit(project, DRUM_KITS[0]);

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    project = result.project;
    expect(project.channels).toHaveLength(DRUM_KITS[0].channels.length);
    expect(project.channels[0]).toMatchObject({ soundId: 'kick-1', role: 'kick', kitId: 'studio-kit' });
    expect(project.channels[0].steps[2]).toBe(true);
    expect(project.patterns[0].channels).toEqual(project.channels);

    const switched = applyDrumKit(project, DRUM_KITS[1], true);
    expect(switched.status).toBe('applied');
    if (switched.status === 'applied') {
      expect(switched.project.channels[0]).toMatchObject({ soundId: 'kick-6', role: 'kick', kitId: '808-kit' });
      expect(switched.project.channels[0].steps[2]).toBe(true);
      expect(switched.project.patterns[0].channels).toEqual(switched.project.channels);
    }
  });

  it('requires confirmation before replacing an existing sound assignment', () => {
    const project = createProject();
    const result = applyDrumKit(project, DRUM_KITS[1]);

    expect(result.status).toBe('confirmation-required');
    expect(result.project).toBe(project);
    const confirmed = applyDrumKit(project, DRUM_KITS[1], true);
    expect(confirmed.status).toBe('applied');
  });

  it('leaves the project unchanged when there is not enough channel capacity', () => {
    let project = createProject();
    for (let index = 0; index < 7; index++) {
      project = { ...project, channels: [...project.channels, {
        ...project.channels[0], id: `other-${index}`, soundId: 'bass-1',
      }] };
    }

    const result = applyDrumKit(project, DRUM_KITS[0]);
    expect(result.status).toBe('capacity-exceeded');
    expect(result.project).toBe(project);
  });

  it('can apply a percussion kit using non-drum percussion roles', () => {
    const result = applyDrumKit(createProject(), DRUM_KITS[2]);

    expect(result.status).toBe('applied');
    if (result.status === 'applied') {
      expect(result.project.channels.filter((channel) => channel.role).map((channel) => channel.role)).toEqual([
        'hand-percussion', 'shaker', 'auxiliary',
      ]);
    }
  });
});
