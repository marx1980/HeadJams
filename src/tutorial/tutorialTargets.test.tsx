// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STARTER_SOUNDS } from '../library/sounds';
import { createRecognitionTake } from '../model/recognitionProject';
import { createProject, addNote, type Project, type SoundDef } from '../model/project';
import type { SampleData } from '../library/sampleStorage';
import { DEFAULT_SAMPLE_SETTINGS } from '../library/sampleProcessing';
import { PianoRoll, SongEditor } from '../ui/CompositionEditor';
import { RecognitionPanel } from '../ui/RecognitionPanel';
import { SampleEditor } from '../ui/SampleEditor';
import { SoundDesigner } from '../ui/SoundDesigner';
import { App } from '../ui/App';
import { TUTORIALS } from './tutorials';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sample: SampleData = {
  id: 'tutorial-target-sample',
  samples: new Float32Array(512).fill(0.1),
  originalSamples: new Float32Array(512).fill(0.1),
  sampleRate: 8000,
  processingSettings: { ...DEFAULT_SAMPLE_SETTINGS },
};
const sampleSound: SoundDef = {
  id: 'tutorial-target-sound', name: 'Tutorial sample', category: 'Samples',
  params: { wave: 'sine', freq: 440, freqEnd: 440, decay: 0.2, cutoff: 4000 },
  sampleId: sample.id, assetSource: 'user-sample',
};
const recognitionResult = {
  mode: 'melody' as const,
  modelId: 'tutorial-test',
  modelVersion: '1',
  events: [{ id: 'tutorial-note', pitch: 60, rawPitch: 60, startSeconds: 0, durationSeconds: 0.2,
    velocity: 0.8, confidence: 0.5 }],
  tempoAlternatives: [],
};
const initialProject = (): Project => {
  const project = createProject();
  const channel = project.channels[0];
  if (!channel) return project;
  const guitarProject = {
    ...project,
    channels: [{ ...channel, soundId: 'guitar-chord-acoustic' }],
  };
  const notedProject = addNote(guitarProject, channel.id, {
    id: 'tutorial-low-confidence-note', step: 0, pitch: 60, durationSteps: 1, confidence: 0.5,
    pitchBend: [{ time: 0.1, value: 1 }],
  });
  const take = createRecognitionTake(sample.id, recognitionResult, {
    enabled: true, strength: 0.75, subdivision: 'sixteenth',
  }, notedProject.bpm, notedProject.noteLength, 'tutorial-take');
  return { ...notedProject, recognitionTakes: [take] };
};

function TargetHarness() {
  const project = initialProject();
  const defaultProject = createProject();
  const samples = new Map([[sample.id, sample]]);
  const sounds = [...STARTER_SOUNDS, sampleSound];
  return createElement('div', null,
    createElement(App),
    createElement(SampleEditor, {
      sounds, samples, bpm: project.bpm, loopBars: project.loopBars,
      onSaveSample: async () => undefined, onUpdateSample: async () => undefined,
      onPreviewSample: () => undefined, onRecordStart: () => undefined, onRecordStop: () => undefined,
      onImport: () => undefined, onEdit: () => undefined,
    }),
    createElement(RecognitionPanel, {
      project, samples, sounds, onApply: () => true, onBpmChange: () => undefined,
      onPreviewSample: () => undefined, onEdit: () => undefined,
    }),
    createElement(PianoRoll, { project, channelId: project.channels[0]!.id, onChange: () => undefined }),
    createElement(PianoRoll, {
      project: defaultProject, channelId: defaultProject.channels[0]!.id, onChange: () => undefined,
    }),
    createElement(SongEditor, { project, onChange: () => undefined }),
    createElement(SoundDesigner, { onPreview: () => undefined, onSave: () => undefined }),
  );
}

describe('tutorial target selectors', () => {
  let root: Root | undefined;
  const container = document.createElement('div');

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    container.replaceChildren();
    document.querySelectorAll('.header-tile').forEach((el) => el.remove());
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('matches every target against rendered application controls and feature states', async () => {
    document.body.append(container);
    const midiInput = {
      id: 'test-midi-input',
      name: 'Test MIDI',
      state: 'connected',
      onmidimessage: null,
    };
    const midiAccess = { inputs: new Map([[midiInput.id, midiInput]]), onstatechange: null };
    const requestMidiAccess = vi.fn().mockResolvedValue(midiAccess);
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: requestMidiAccess });

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(TargetHarness));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.sample-edit-list button')?.click();
      container.querySelector<HTMLButtonElement>('.sound-picker-trigger')?.click();
      container.querySelector<HTMLButtonElement>('#make-sound')?.click();
    });
    await act(async () => {
      const arrangementPart = container.querySelector<HTMLSelectElement>('[aria-label="Arrangement part"]');
      if (arrangementPart) {
        arrangementPart.value = 'accompaniment';
        arrangementPart.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const selectors = new Set(TUTORIALS.flatMap((tutorial) =>
      tutorial.steps.flatMap((step) => step.target ? [step.target] : [])));
    const findMissing = async () => {
      const found = new Set<string>();
      for (const label of [undefined, 'File menu', 'Share and export menu']) {
        if (label) await act(async () => { container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click(); });
        for (const selector of selectors) {
          try { if (document.body.querySelector(selector)) found.add(selector); } catch { /* reported below */ }
        }
        if (label) await act(async () => { container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click(); });
      }
      const missing: string[] = [];
      for (const selector of selectors) {
        try { document.body.querySelector(selector); } catch { missing.push(`${selector} (invalid selector)`); continue; }
        if (!found.has(selector)) missing.push(selector);
      }
      return missing;
    };
    expect(container.querySelector<HTMLButtonElement>('#midi-connect')?.disabled).toBe(false);
    expect(await findMissing()).toEqual(['#midi-record']);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#midi-connect')?.click();
      await requestMidiAccess.mock.results[0]?.value;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(requestMidiAccess).toHaveBeenCalled();
    expect(container.querySelector('#midi-record')).toBeTruthy();
    expect(await findMissing()).toEqual(['#midi-connect']);
  });
});
