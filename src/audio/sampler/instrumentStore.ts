import type { Channel, Project } from '../../model/project';
import { voiceChordSequence } from '../../library/guitar/performer';
import { findSound } from '../../library/sounds';
import { validateManifest, type InstrumentManifest, type SampleRegion } from './manifest';
import { playableMidi } from './selectRegion';
import type { DecodedRegion } from './sampledVoice';

const MB = 2 ** 20;

/** Memory and download budgets (expansion.md E1). Tune on real devices in E8. */
export const BUDGETS = {
  instrumentDecodedBytes: 40 * MB,
  totalDecodedBytes: 150 * MB,
  instrumentDownloadBytes: 8 * MB,
  totalDownloadBytes: 150 * MB,
};
export type Budgets = typeof BUDGETS;

export interface StoreDeps {
  fetchJson: (url: string) => Promise<unknown>;
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
  decode: (bytes: ArrayBuffer) => Promise<DecodedRegion>;
  /** App base URL ending in a slash, e.g. "/MusicMaker/". */
  baseUrl: string;
}

export type InstrumentState = 'loading' | 'ready' | 'error';
export interface InstrumentStatus {
  state: InstrumentState;
  message?: string;
}

/** MIDI notes each sampled instrument needs for a project (all patterns included). */
export function instrumentNeeds(project: Project): Map<string, Set<number>> {
  const needs = new Map<string, Set<number>>();
  const channels: Channel[] = [...project.channels, ...project.patterns.flatMap((pattern) => pattern.channels)];
  for (const channel of channels) {
    for (const lane of channel.lanes ?? []) {
      const laneSound = findSound(project, lane.soundId);
      if (!laneSound?.instrumentId || !lane.steps.some(Boolean)) continue;
      const notes = needs.get(laneSound.instrumentId) ?? new Set<number>();
      needs.set(laneSound.instrumentId, notes);
      notes.add(laneSound.instrumentNote ?? 60);
    }
    const sound = findSound(project, channel.soundId);
    if (!sound?.instrumentId) continue;
    const notes = needs.get(sound.instrumentId) ?? new Set<number>();
    needs.set(sound.instrumentId, notes);
    if (channel.steps.some(Boolean)) notes.add(sound.instrumentNote ?? 60);
    for (const note of channel.notes ?? []) notes.add(Math.round(note.pitch));
    if (sound.playbackMode === 'chord') {
      for (const voicing of voiceChordSequence(channel.chordEvents ?? []).values()) {
        for (const note of voicing.notes) notes.add(note.midi);
      }
    }
  }
  return needs;
}

/** Regions that could be chosen for any of the notes (all velocities, articulations and round robins). */
export function regionsForNotes(manifest: InstrumentManifest, notes: ReadonlySet<number>): SampleRegion[] {
  const playable = [...notes].flatMap((note) => {
    const midi = playableMidi(manifest, note);
    return midi === undefined ? [] : [midi];
  });
  return manifest.regions.filter((region) => playable.some((midi) =>
    (region.lowMidi <= midi && midi <= region.highMidi)
    || Math.abs(region.rootMidi - midi) <= manifest.pitchShiftLimitSemitones));
}

interface CachedRegion {
  audio: DecodedRegion;
  bytes: number;
  instrumentId: string;
  lastUsed: number;
}

/** Loads instrument manifests and region audio on demand, with an LRU decoded-audio cache. */
export class InstrumentStore {
  private manifestRequests = new Map<string, Promise<InstrumentManifest>>();
  private manifests = new Map<string, InstrumentManifest>();
  private regions = new Map<string, CachedRegion>();
  private pendingRegions = new Map<string, Promise<DecodedRegion | undefined>>();
  private statuses = new Map<string, InstrumentStatus>();
  private listeners = new Set<() => void>();
  private pinned = new Set<string>();
  private clock = 0;

  constructor(private readonly deps: StoreDeps, private readonly budgets: Budgets = BUDGETS) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status(id: string): InstrumentStatus | undefined {
    return this.statuses.get(id);
  }

  manifest(id: string): InstrumentManifest | undefined {
    return this.manifests.get(id);
  }

  get decodedBytes(): number {
    let total = 0;
    for (const entry of this.regions.values()) total += entry.bytes;
    return total;
  }

  regionKey(manifest: InstrumentManifest, region: SampleRegion): string {
    return `${manifest.id}@${manifest.version}/${region.file}`;
  }

  /** Decoded audio for a loaded region (marks it as recently used). */
  audio(manifest: InstrumentManifest, region: SampleRegion): DecodedRegion | undefined {
    const entry = this.regions.get(this.regionKey(manifest, region));
    if (!entry) return undefined;
    entry.lastUsed = ++this.clock;
    return entry.audio;
  }

  /** Load what a project needs; regions the project needs stay pinned against eviction. */
  async prepare(needs: ReadonlyMap<string, ReadonlySet<number>>): Promise<void> {
    await Promise.all([...needs].map(([id, notes]) => this.ensure(id, notes)));
    const keep = new Set<string>();
    for (const [id, notes] of needs) {
      const manifest = this.manifests.get(id);
      if (!manifest) continue;
      const regions = manifest.preloadStrategy === 'all' ? manifest.regions : regionsForNotes(manifest, notes);
      for (const region of regions) keep.add(this.regionKey(manifest, region));
    }
    this.pinned = keep;
    this.evict();
  }

  /** Load an instrument's manifest and the regions for `notes` (or all regions). Resolves true when ready. */
  async ensure(id: string, notes?: ReadonlySet<number>): Promise<boolean> {
    let manifest: InstrumentManifest;
    try {
      manifest = await this.loadManifest(id);
    } catch (error) {
      this.setStatus(id, { state: 'error', message: error instanceof Error ? error.message : 'Instrument unavailable' });
      return false;
    }
    const wanted = manifest.preloadStrategy === 'all' || !notes ? manifest.regions : regionsForNotes(manifest, notes);
    const missing = wanted.filter((region) => !this.regions.has(this.regionKey(manifest, region)));
    for (const region of wanted) this.pinned.add(this.regionKey(manifest, region));
    if (!missing.length) {
      if (this.statuses.get(id)?.state !== 'error') this.setStatus(id, { state: 'ready' });
      return this.statuses.get(id)?.state === 'ready';
    }
    this.setStatus(id, { state: 'loading' });
    let failure: string | undefined;
    const queue = [...missing];
    const worker = async () => {
      for (let region = queue.shift(); region; region = queue.shift()) {
        const result = await this.loadRegion(manifest, region).catch(() => undefined);
        if (!result) failure ??= `Missing sample ${region.file}`;
        else if (this.instrumentBytes(id) > this.budgets.instrumentDecodedBytes) {
          this.regions.delete(this.regionKey(manifest, region));
          failure ??= 'Instrument exceeds its memory budget';
          queue.length = 0;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, missing.length) }, worker));
    this.evict();
    this.setStatus(id, failure ? { state: 'error', message: failure } : { state: 'ready' });
    return !failure;
  }

  /** Manifests and decoded audio for WAV export (copies, safe to transfer to a worker). */
  exportAudio(ids: Iterable<string>): { manifests: InstrumentManifest[]; regions: { key: string; sampleRate: number; data: Float32Array }[] } {
    const manifests: InstrumentManifest[] = [];
    const regions: { key: string; sampleRate: number; data: Float32Array }[] = [];
    for (const id of new Set(ids)) {
      const manifest = this.manifests.get(id);
      if (!manifest) continue;
      manifests.push(manifest);
      for (const region of manifest.regions) {
        const key = this.regionKey(manifest, region);
        const entry = this.regions.get(key);
        if (entry) regions.push({ key, sampleRate: entry.audio.sampleRate, data: entry.audio.data.slice() });
      }
    }
    return { manifests, regions };
  }

  private instrumentBytes(id: string): number {
    let total = 0;
    for (const entry of this.regions.values()) if (entry.instrumentId === id) total += entry.bytes;
    return total;
  }

  private evict(): void {
    let total = this.decodedBytes;
    if (total <= this.budgets.totalDecodedBytes) return;
    const candidates = [...this.regions].filter(([key]) => !this.pinned.has(key)).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, entry] of candidates) {
      if (total <= this.budgets.totalDecodedBytes) break;
      this.regions.delete(key);
      total -= entry.bytes;
    }
  }

  private loadManifest(id: string): Promise<InstrumentManifest> {
    let request = this.manifestRequests.get(id);
    if (!request) {
      request = (async () => {
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('Invalid instrument id');
        const manifest = await this.deps.fetchJson(`${this.deps.baseUrl}instruments/${id}/manifest.json`);
        const report = validateManifest(manifest);
        if (report.errors.length) throw new Error(`Invalid instrument: ${report.errors[0]}`);
        const valid = manifest as InstrumentManifest;
        if (valid.id !== id) throw new Error('Instrument id does not match its folder');
        this.manifests.set(id, valid);
        return valid;
      })();
      request.catch(() => this.manifestRequests.delete(id));
      this.manifestRequests.set(id, request);
    }
    return request;
  }

  private loadRegion(manifest: InstrumentManifest, region: SampleRegion): Promise<DecodedRegion | undefined> {
    const key = this.regionKey(manifest, region);
    let pending = this.pendingRegions.get(key);
    if (!pending) {
      pending = (async () => {
        const url = `${this.deps.baseUrl}instruments/${manifest.id}/${encodeURIComponent(region.file)}?v=${manifest.version}`;
        const audio = await this.deps.decode(await this.deps.fetchBytes(url));
        this.regions.set(key, { audio, bytes: audio.data.byteLength, instrumentId: manifest.id, lastUsed: ++this.clock });
        return audio;
      })().finally(() => this.pendingRegions.delete(key));
      this.pendingRegions.set(key, pending);
    }
    return pending;
  }

  private setStatus(id: string, status: InstrumentStatus): void {
    const previous = this.statuses.get(id);
    if (previous?.state === status.state && previous.message === status.message) return;
    this.statuses.set(id, status);
    for (const listener of this.listeners) listener();
  }
}
