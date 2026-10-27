import { describe, expect, it } from 'vitest';
import { FEATURES, GROUPS, TUTORIALS, WORKFLOWS, findTutorial, isTutorialAvailable, type TutorialCapability, type TutorialState } from './tutorials';
import { DONE_KEY, loadDone, saveDone, workflowProgress } from './progress';
import { createProject, toggleStep } from '../model/project';

describe('tutorial catalogue', () => {
  it('has unique ids and every tutorial belongs to a known group', () => {
    expect(new Set(TUTORIALS.map((t) => t.id)).size).toBe(TUTORIALS.length);
    for (const t of TUTORIALS) {
      expect(GROUPS[t.tab], t.id).toContain(t.group);
      expect(t.steps.length, t.id).toBeGreaterThan(0);
      expect(t.doneMessage, t.id).toBeTruthy();
    }
  });
  it('keeps the original tutorial ids', () => {
    ['first-beat', 'note-length', 'loop', 'add-channel', 'save-export', 'record-sample', 'composition'].forEach((id) => expect(findTutorial(id)).toBeDefined());
  });
  it('covers every feature', () => {
    for (const f of FEATURES) expect(TUTORIALS.some((t) => t.features.includes(f.id)), f.id).toBe(true);
  });
  it('resolves workflow tutorial ids', () => {
    for (const w of WORKFLOWS) for (const id of w.tutorialIds) expect(findTutorial(id), `${w.id}:${id}`).toBeDefined();
  });
  it('detects the first-beat step', () => {
    const base = createProject();
    const ch = base.channels[0];
    const state: TutorialState = { base, project: ch ? toggleStep(base, ch.id, 0) : base, events: new Set() };
    expect(TUTORIALS[0].steps[0].done(state)).toBe(Boolean(ch));
  });
  it('gates microphone tutorials on browser capabilities', () => {
    const record = findTutorial('record-sample');
    const importAudio = findTutorial('import-audio');
    expect(record && isTutorialAvailable(record, new Set<TutorialCapability>())).toBe(false);
    expect(importAudio && isTutorialAvailable(importAudio, new Set<TutorialCapability>())).toBe(true);
    expect(record && isTutorialAvailable(record, new Set<TutorialCapability>(['microphone']))).toBe(true);
  });
  it('uses completion events for editing and keyboard tutorials', () => {
    const base = createProject();
    const state = (events: string[]): TutorialState => ({ base, project: base, events: new Set(events) });
    expect(findTutorial('sample-editor')?.steps[1].done(state(['sample-edited']))).toBe(true);
    expect(findTutorial('sample-editor')?.steps[2].done(state(['sample-updated']))).toBe(true);
    expect(findTutorial('recognition-edit')?.steps[0].done(state(['recognition-edited']))).toBe(true);
    expect(findTutorial('keyboard-navigation')?.steps[0].done(state(['keyboard-nav']))).toBe(true);
    expect(findTutorial('keyboard-navigation')?.steps[1].done(state(['piano-keyboard-nav']))).toBe(true);
  });
});

describe('tutorial progress', () => {
  it('round-trips and tolerates bad data', () => {
    const store = new Map<string, string>();
    const api = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveDone(new Set(['loop']), api);
    expect([...loadDone(api)]).toEqual(['loop']);
    store.set(DONE_KEY, '{bad');
    expect(loadDone(api).size).toBe(0);
  });
  it('reports workflow progress', () => {
    const w = WORKFLOWS[0];
    const p = workflowProgress(w, new Set([w.tutorialIds[0]]));
    expect(p.completed).toBe(1);
    expect(p.nextId).toBe(w.tutorialIds[1]);
  });
});
