import { describe, expect, it } from 'vitest';
import { STARTER_SOUNDS, findSound, renderSound } from '../library/sounds';
import { createProject, toggleStep } from '../model/project';
import { TEMPLATES } from '../model/templates';
import { renderProject } from './render';
import { encodeWav } from './wav';
import { TUTORIALS, countNotes } from '../tutorial/tutorials';

describe('sound library', () => {
  it('has about 30 unique starter sounds that render audibly within range', () => {
    expect(STARTER_SOUNDS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(STARTER_SOUNDS.map((s) => s.id)).size).toBe(STARTER_SOUNDS.length);
    for (const s of STARTER_SOUNDS) {
      if (!s.params) throw new Error(`${s.name} should have synthesis parameters`);
      const d = renderSound(s.params, 8000);
      expect(d.some((x) => Math.abs(x) > 0.01)).toBe(true);
      expect(d.every((x) => Math.abs(x) <= 1)).toBe(true);
    }
  });
  it('templates only use existing sounds', () => {
    for (const t of TEMPLATES) {
      const p = t.make();
      p.channels.forEach((c) => expect(findSound(p, c.soundId)).toBeDefined());
    }
  });
});

describe('render + wav', () => {
  it('silent project renders silence; a note renders sound', () => {
    expect(renderProject(createProject(), 8000).left.every((x) => x === 0)).toBe(true);
    expect(renderProject(toggleStep(createProject(), 'ch1', 0), 8000).left.some((x) => x !== 0)).toBe(true);
  });
  it('renders imported samples in the project mix', () => {
    const project = createProject();
    project.customSounds = [{ id: 'my-sample', sampleId: 'asset-1', name: 'Sample', category: 'Samples' }];
    project.channels[0].soundId = 'my-sample';
    project.channels[0].steps[0] = true;
    const samples = new Map([['asset-1', { sampleRate: 8000, samples: new Float32Array([0.5, -0.5]) }]]);
    expect(renderProject(project, 8000, samples).left[0]).toBeGreaterThan(0);
  });
  it('writes a valid WAV header', () => {
    const buf = encodeWav(new Float32Array(10), new Float32Array(10), 44100);
    const v = new DataView(buf);
    expect(buf.byteLength).toBe(44 + 40);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(44100);
  });
});

describe('tutorials', () => {
  it('has six tutorials whose first step is not already done', () => {
    expect(TUTORIALS).toHaveLength(6);
    const p = createProject();
    for (const t of TUTORIALS) expect(t.steps[0].done({ project: p, base: p, events: new Set() })).toBe(false);
  });
  it('first-beat step 1 completes when a note is placed', () => {
    const p = createProject();
    expect(countNotes(toggleStep(p, 'ch1', 0))).toBe(1);
    expect(TUTORIALS[0].steps[0].done({ project: toggleStep(p, 'ch1', 0), base: p, events: new Set() })).toBe(true);
  });
});
