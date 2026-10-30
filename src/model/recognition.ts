export type RecognitionMode = 'melody' | 'bass' | 'beat';
export type PercussionClass =
  | 'kick'
  | 'snare'
  | 'closed-hat'
  | 'open-hat'
  | 'clap'
  | 'tom'
  | 'cymbal'
  | 'bass'
  | 'unknown';

export interface DetectedPitchBend {
  time: number;
  value: number;
}

export interface DetectedNoteEvent {
  id: string;
  pitch: number;
  rawPitch?: number;
  startSeconds: number;
  durationSeconds: number;
  velocity: number;
  confidence: number;
  pitchBend?: DetectedPitchBend[];
}

export interface PercussionEvent {
  id: string;
  type: PercussionClass;
  startSeconds: number;
  velocity: number;
  confidence?: number;
  assignedSoundId?: string;
}

export type RecognitionEvent = DetectedNoteEvent | PercussionEvent;
export type QuantisationSubdivision = 'quarter' | 'eighth' | 'sixteenth';

export interface RecognitionQuantisation {
  enabled: boolean;
  strength: number;
  subdivision: QuantisationSubdivision;
}

export interface RecognitionTake {
  id: string;
  sourceSampleId: string;
  mode: RecognitionMode;
  modelId: string;
  modelVersion: string;
  createdAt: number;
  tempoBpm: number;
  detectedBpm?: number;
  tempoAlternatives: number[];
  quantisation: RecognitionQuantisation;
  pitchCorrection: number;
  scaleAwarePitch: boolean;
  scaleRoot: number;
  scaleId: string;
  transposeSemitones: number;
  originalEvents: RecognitionEvent[];
  quantisedEvents: RecognitionEvent[];
  channelIds: string[];
  originalChannelId?: string;
  /** Seconds added to recording times to place events in project time (microphone alignment). */
  alignmentSeconds?: number;
  /** What recognition last wrote to the project, so user edits on the grid can be told apart and kept. */
  applied?: AppliedSnapshot;
}

export interface AppliedSnapshot {
  /** Melody/bass: note id -> "step:pitch:durationSteps" as last written. */
  notes?: Record<string, string>;
  /** Beat: event group key -> its channel, the steps last written, and each event's step (-1 = deleted by the user). */
  groups?: Record<string, { channelId: string; steps: boolean[]; events?: Record<string, number> }>;
}

export interface RecognitionResult {
  mode: RecognitionMode;
  modelId: string;
  modelVersion: string;
  events: RecognitionEvent[];
  detectedBpm?: number;
  tempoAlternatives: number[];
}
