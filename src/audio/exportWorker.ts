import { renderProject } from './render';
import { encodeWav } from './wav';
import type { Project } from '../model/project';
import type { InstrumentManifest } from './sampler/manifest';

interface ExportRequest {
  project: Project;
  samples: { id: string; samples: Float32Array; sampleRate: number }[];
  sampleRate: number;
  bitDepth: 16 | 24;
  normalize: boolean;
  instruments?: { manifests: InstrumentManifest[]; regions: { key: string; sampleRate: number; data: Float32Array }[] };
}

self.onmessage = (event: MessageEvent<ExportRequest>) => {
  const { project, samples, sampleRate, bitDepth, normalize, instruments } = event.data;
  const { left, right } = renderProject(project, sampleRate, new Map(samples.map((sample) => [sample.id, sample])), instruments && {
    manifests: new Map(instruments.manifests.map((manifest) => [manifest.id, manifest])),
    regions: new Map(instruments.regions.map((region) => [region.key, region])),
  });
  const wav = encodeWav(left, right, sampleRate, { bitDepth, normalize });
  self.postMessage(wav, { transfer: [wav] });
};
