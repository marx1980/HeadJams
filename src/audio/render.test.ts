import { describe, expect, it } from 'vitest';
import { renderProject } from './render';
import { createProject, setEffects } from '../model/project';

describe('offline effects', () => {
  it('applies EQ to the exported audio', () => {
    const project = createProject();
    project.channels[0].steps[0] = true;
    const dry = renderProject(project, 8000);
    const equalized = renderProject(setEffects(project, { eqLow: 12 }), 8000);

    expect(equalized.left).not.toEqual(dry.left);
  });

  it('renders additional tail when time-based effects are enabled', () => {
    const project = createProject();
    project.channels[0].steps[0] = true;
    const dry = renderProject(project, 8000);
    const effected = renderProject(setEffects(project, { delay: 0.5, reverb: 0.5 }), 8000);

    expect(effected.left.length).toBeGreaterThan(dry.left.length);
    expect(effected.right.length).toBe(effected.left.length);
  });
});
