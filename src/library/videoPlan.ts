import { arrangementLength, channelsForPlaybackStep, totalSteps, type Channel, type Project } from '../model/project';
import { stepDuration } from '../audio/scheduler';
import { hasTempoMap, songSeconds } from '../model/tempo';

/** Social video (adoption.md E3): the hummed idea, then the song, drawn as notes lighting up as they play. */

export type VideoShape = 'vertical' | 'square';
export const VIDEO_SIZES: Record<VideoShape, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

/** At least this long, so a one-bar loop still makes a watchable clip; at most this long for sharing. */
export const MIN_SONG_SECONDS = 8;
export const MAX_VIDEO_SECONDS = 60;

export interface VideoPlan {
  /** Seconds of the original recording shown first (0 when there is none). */
  introSeconds: number;
  /** One pass of the song or loop, without the effect tail. */
  passSeconds: number;
  passes: number;
  /** Steps in one pass. */
  steps: number;
  stepSeconds: number;
  totalSeconds: number;
}

export function videoPlan(p: Project, introSeconds = 0): VideoPlan {
  const steps = arrangementLength(p) || totalSteps(p);
  const stepSeconds = stepDuration(p.bpm, p.noteLength);
  // With tempo changes a pass lasts the sum of its steps (Song › Tempo).
  const passSeconds = hasTempoMap(p) ? songSeconds(p) : steps * stepSeconds;
  const intro = Math.min(Math.max(0, introSeconds), 20);
  const room = MAX_VIDEO_SECONDS - intro;
  const passes = Math.max(1, Math.min(Math.ceil(MIN_SONG_SECONDS / passSeconds), Math.floor(room / passSeconds) || 1));
  const tail = 1;
  return { introSeconds: intro, passSeconds, passes, steps, stepSeconds, totalSeconds: intro + passSeconds * passes + tail };
}

/** First container the recorder supports, preferring MP4 (plays everywhere social apps accept uploads). */
export function pickVideoType(isSupported: (type: string) => boolean): string | undefined {
  return ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find((type) => isSupported(type));
}

export interface VideoFrameNote { channelIndex: number; x: number; width: number; pitch: number; active: boolean }
export interface VideoFrameHit { channelIndex: number; row: number; x: number; active: boolean }
export interface VideoFrame {
  /** Steps shown (the pattern or loop playing at that moment). */
  windowSteps: number;
  playhead: number;
  section?: string;
  notes: VideoFrameNote[];
  hits: VideoFrameHit[];
  rows: number;
  low: number;
  high: number;
}

/** What to draw at song step `step` (fractional): the pattern sounding then, with notes and hits that are playing lit. */
export function videoFrame(p: Project, songStep: number): VideoFrame {
  const step = Math.max(0, Math.floor(songStep));
  const playing = channelsForPlaybackStep(p, step);
  const clip = p.arrangement.find((item) => step >= item.startStep && step < item.startStep + item.lengthSteps);
  const channels: Channel[] = playing[0]?.channels ?? p.channels;
  const local = (playing[0]?.localStep ?? step % totalSteps(p)) + (songStep - step);
  const windowSteps = Math.max(1, clip
    ? (p.patterns.find((pattern) => pattern.id === clip.patternId)?.lengthSteps ?? totalSteps(p))
    : totalSteps(p));
  const notes: VideoFrameNote[] = [];
  const hits: VideoFrameHit[] = [];
  let rows = 0;
  channels.forEach((channel) => {
    const channelIndex = p.channels.findIndex((item) => item.id === channel.id);
    for (const note of channel.notes ?? []) {
      notes.push({ channelIndex, x: note.step, width: note.durationSteps, pitch: note.pitch,
        active: local >= note.step && local < note.step + note.durationSteps });
    }
    const laneSteps = channel.lanes ? channel.lanes.filter((lane) => lane.steps.some(Boolean)).map((lane) => lane.steps) : [channel.steps];
    for (const steps of laneSteps) {
      if (!steps.some(Boolean)) continue;
      const row = rows++;
      steps.forEach((on, index) => {
        if (on) hits.push({ channelIndex, row, x: index, active: local >= index && local < index + 1 });
      });
    }
    for (const event of channel.chordEvents ?? []) {
      notes.push({ channelIndex, x: event.step, width: event.durationSteps, pitch: event.root,
        active: local >= event.step && local < event.step + event.durationSteps });
    }
  });
  const pitches = notes.map((note) => note.pitch);
  return {
    windowSteps,
    playhead: local,
    ...(clip?.section ? { section: clip.section } : {}),
    notes, hits, rows,
    low: pitches.length ? Math.min(...pitches) : 60,
    high: pitches.length ? Math.max(...pitches) : 72,
  };
}
