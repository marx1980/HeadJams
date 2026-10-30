/** Instrument manifest format for sampled instruments (expansion.md, E0). */

export type InstrumentFamily =
  | 'guitar' | 'bass' | 'piano' | 'keys' | 'strings' | 'brass' | 'woodwind' | 'drums' | 'percussion' | 'user' | 'other';

export interface Provenance {
  source: string;
  url: string;
  creator: string;
  licence: string;
  /** ISO date the source was downloaded or created. */
  obtained: string;
  redistribution: boolean;
  modification: boolean;
  processing?: string;
}

export interface SampleRegion {
  id: string;
  file: string;
  rootMidi: number;
  lowMidi: number;
  highMidi: number;
  velocityLow: number;
  velocityHigh: number;
  articulation: string;
  roundRobinGroup?: string;
  roundRobinIndex?: number;
  gainDb?: number;
  tuneCents?: number;
  startOffsetMs?: number;
  endOffsetMs?: number;
  loopStartMs?: number;
  loopEndMs?: number;
  releaseFile?: string;
  /** Guitar string (1 = high E … 6 = low E) and fret, when known. */
  string?: number;
  fret?: number;
  chokeGroup?: string;
}

export interface InstrumentManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  family: InstrumentFamily;
  version: number;
  engine: 'sampler' | 'guitar';
  defaultArticulation: string;
  maxPolyphony: number;
  pitchShiftLimitSemitones: number;
  preloadStrategy: 'all' | 'range' | 'on-demand';
  /** Description words for Find the sound (warm, bright, …). */
  tags?: string[];
  /** Level offset that matches the instrument's loudness to Classic sounds. */
  gainDb?: number;
  envelope?: { mode: 'one-shot' | 'sustain'; attackMs: number; releaseMs: number };
  provenance: Provenance;
  regions: SampleRegion[];
}

export interface ManifestReport {
  errors: string[];
  warnings: string[];
  /** MIDI notes inside the instrument's range that the default articulation cannot reach. */
  uncoveredNotes: number[];
}

const FAMILIES: InstrumentFamily[] = [
  'guitar', 'bass', 'piano', 'keys', 'strings', 'brass', 'woodwind', 'drums', 'percussion', 'user', 'other',
];

const isMidi = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 127;
const isVelocity = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 127;
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export interface ValidateOptions {
  /** Files present next to the manifest; when given, every referenced file must exist. */
  files?: ReadonlySet<string>;
  /** Bundled instruments ship in the public repo, so they must be redistributable. */
  bundled?: boolean;
}

/** Validate a manifest. Errors make it unusable; warnings are coverage or quality hints. */
export function validateManifest(input: unknown, options: ValidateOptions = {}): ManifestReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const m = input as Partial<InstrumentManifest> | null;
  if (!m || typeof m !== 'object') return { errors: ['Manifest is not an object'], warnings, uncoveredNotes: [] };

  if (m.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!isText(m.id) || !/^[a-z0-9][a-z0-9-]*$/.test(m.id)) errors.push('id must be lowercase letters, digits and dashes');
  if (!isText(m.name)) errors.push('name is required');
  if (!FAMILIES.includes(m.family as InstrumentFamily)) errors.push(`family must be one of ${FAMILIES.join(', ')}`);
  if (!Number.isInteger(m.version) || (m.version as number) < 1) errors.push('version must be a positive integer');
  if (m.engine !== 'sampler' && m.engine !== 'guitar') errors.push('engine must be sampler or guitar');
  if (!isText(m.defaultArticulation)) errors.push('defaultArticulation is required');
  if (!Number.isInteger(m.maxPolyphony) || (m.maxPolyphony as number) < 1) errors.push('maxPolyphony must be at least 1');
  if (typeof m.pitchShiftLimitSemitones !== 'number' || m.pitchShiftLimitSemitones < 0 || m.pitchShiftLimitSemitones > 24) {
    errors.push('pitchShiftLimitSemitones must be between 0 and 24');
  }
  if (!['all', 'range', 'on-demand'].includes(m.preloadStrategy as string)) errors.push('preloadStrategy must be all, range or on-demand');
  if (m.tags !== undefined && !(Array.isArray(m.tags) && m.tags.every(isText))) errors.push('tags must be a list of words');

  const prov = m.provenance as Partial<Provenance> | undefined;
  if (!prov) errors.push('provenance is required');
  else {
    for (const key of ['source', 'url', 'creator', 'licence', 'obtained'] as const) {
      if (!isText(prov[key])) errors.push(`provenance.${key} is required`);
    }
    if (typeof prov.redistribution !== 'boolean' || typeof prov.modification !== 'boolean') {
      errors.push('provenance.redistribution and provenance.modification must be true or false');
    }
    if ((options.bundled ?? true) && prov.redistribution !== true) {
      errors.push('Bundled instruments must allow redistribution (the repo is public)');
    }
  }

  const regions = Array.isArray(m.regions) ? m.regions : [];
  if (!regions.length) errors.push('regions must not be empty');
  const ids = new Set<string>();
  const limit = typeof m.pitchShiftLimitSemitones === 'number' ? m.pitchShiftLimitSemitones : 0;
  regions.forEach((region, index) => {
    const label = `region ${isText(region?.id) ? region.id : index}`;
    if (!isText(region?.id)) errors.push(`${label}: id is required`);
    else if (ids.has(region.id)) errors.push(`${label}: duplicate id`);
    else ids.add(region.id);
    if (!isText(region?.file)) errors.push(`${label}: file is required`);
    else if (options.files && !options.files.has(region.file)) errors.push(`${label}: missing file ${region.file}`);
    if (region?.releaseFile && options.files && !options.files.has(region.releaseFile)) {
      errors.push(`${label}: missing release file ${region.releaseFile}`);
    }
    if (!isMidi(region?.rootMidi) || !isMidi(region?.lowMidi) || !isMidi(region?.highMidi)) {
      errors.push(`${label}: rootMidi, lowMidi and highMidi must be 0–127`);
    } else {
      if (region.lowMidi > region.highMidi) errors.push(`${label}: lowMidi is above highMidi`);
      const reach = Math.max(Math.abs(region.rootMidi - region.lowMidi), Math.abs(region.highMidi - region.rootMidi));
      if (reach > limit) warnings.push(`${label}: range reaches ${reach} semitones from its root (limit ${limit})`);
    }
    if (!isVelocity(region?.velocityLow) || !isVelocity(region?.velocityHigh)) {
      errors.push(`${label}: velocityLow and velocityHigh must be 1–127`);
    } else if (region.velocityLow > region.velocityHigh) errors.push(`${label}: velocityLow is above velocityHigh`);
    if (!isText(region?.articulation)) errors.push(`${label}: articulation is required`);
    if ((region?.loopStartMs === undefined) !== (region?.loopEndMs === undefined)) {
      errors.push(`${label}: loopStartMs and loopEndMs go together`);
    } else if (region?.loopStartMs !== undefined && !(Number.isFinite(region.loopStartMs) && Number.isFinite(region.loopEndMs)
      && region.loopStartMs >= 0 && (region.loopEndMs as number) > region.loopStartMs)) {
      errors.push(`${label}: loop must have 0 ≤ loopStartMs < loopEndMs`);
    }
  });

  // Overlapping regions are only allowed as round-robin alternatives.
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i];
      const b = regions[j];
      if (!a || !b || a.articulation !== b.articulation) continue;
      const notes = a.lowMidi <= b.highMidi && b.lowMidi <= a.highMidi;
      const velocities = a.velocityLow <= b.velocityHigh && b.velocityLow <= a.velocityHigh;
      const roundRobin = a.roundRobinGroup !== undefined && a.roundRobinGroup === b.roundRobinGroup
        && a.roundRobinIndex !== b.roundRobinIndex;
      if (notes && velocities && !roundRobin) errors.push(`regions ${a.id} and ${b.id} overlap`);
    }
  }

  const defaults = regions.filter((region) => region?.articulation === m.defaultArticulation);
  if (regions.length && isText(m.defaultArticulation) && !defaults.length) {
    errors.push(`no region uses the default articulation ${m.defaultArticulation}`);
  }
  const uncoveredNotes: number[] = [];
  const valid = defaults.filter((region) => isMidi(region.lowMidi) && isMidi(region.highMidi));
  if (valid.length) {
    const low = Math.min(...valid.map((region) => region.lowMidi));
    const high = Math.max(...valid.map((region) => region.highMidi));
    for (let note = low; note <= high; note++) {
      if (!valid.some((region) => region.lowMidi <= note && note <= region.highMidi)) uncoveredNotes.push(note);
    }
    if (uncoveredNotes.length) warnings.push(`${uncoveredNotes.length} notes in range have no ${m.defaultArticulation} region`);
  }
  return { errors, warnings, uncoveredNotes };
}
