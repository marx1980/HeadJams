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
  detectedBpm?: number;
  tempoAlternatives: number[];
  quantisation: RecognitionQuantisation;
  originalEvents: RecognitionEvent[];
  quantisedEvents: RecognitionEvent[];
  channelIds: string[];
}

export interface RecognitionResult {
  mode: RecognitionMode;
  modelId: string;
  modelVersion: string;
  events: RecognitionEvent[];
  detectedBpm?: number;
  tempoAlternatives: number[];
}
