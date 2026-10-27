import { renderProject } from './render';
import { encodeWav } from './wav';
import type { Project } from '../model/project';

interface ExportRequest {
  project: Project;
  samples: { id: string; samples: Float32Array; sampleRate: number }[];
  sampleRate: number;
  bitDepth: 16 | 24;
  normalize: boolean;
}

self.onmessage = (event: MessageEvent<ExportRequest>) => {
  const { project, samples, sampleRate, bitDepth, normalize } = event.data;
  const { left, right } = renderProject(project, sampleRate, new Map(samples.map((sample) => [sample.id, sample])));
  const wav = encodeWav(left, right, sampleRate, { bitDepth, normalize });
  self.postMessage(wav, { transfer: [wav] });
};
