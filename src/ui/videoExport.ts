import type { Project } from '../model/project';
import { pickVideoType, VIDEO_SIZES, videoFrame, videoPlan, type VideoShape } from '../library/videoPlan';

export interface VideoInput {
  project: Project;
  shape: VideoShape;
  /** The song as WAV (one pass plus effect tail). */
  songWav: ArrayBuffer;
  /** The hummed original (mono samples), played first. */
  original?: { samples: Float32Array; sampleRate: number };
  onProgress: (seconds: number, total: number) => void;
}

const token = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function videoSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
    && Boolean(pickVideoType((type) => MediaRecorder.isTypeSupported(type)));
}

/**
 * Record the video in real time: canvas frames plus the song's audio (silent on the speakers),
 * through MediaRecorder. Resolves with the file.
 */
export async function recordVideo(input: VideoInput): Promise<{ blob: Blob; extension: string }> {
  const type = pickVideoType((item) => MediaRecorder.isTypeSupported(item));
  if (!type) throw new Error('Video recording not supported');
  const { width, height } = VIDEO_SIZES[input.shape];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  const ctx = new AudioContext();
  const destination = ctx.createMediaStreamDestination();
  const song = await ctx.decodeAudioData(input.songWav.slice(0));
  const original = input.original?.samples.length ? (() => {
    const buffer = ctx.createBuffer(1, input.original.samples.length, input.original.sampleRate);
    buffer.copyToChannel(input.original.samples as Float32Array<ArrayBuffer>, 0);
    return buffer;
  })() : undefined;
  const plan = videoPlan(input.project, original?.duration ?? 0);

  const colors = Array.from({ length: 8 }, (_, index) => token(`--channel-${index + 1}`, '#2ee6a6'));
  const background = token('--app-bg', token('--surface', '#0f1420'));
  const muted = token('--surface-muted', '#222c44');
  const text = token('--text', '#e8ecf4');
  const accent = token('--accent', '#2ee6a6');
  const waveform = original ? peaks(original.getChannelData(0), 400) : [];

  const stream = canvas.captureStream(30);
  for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  const pad = Math.round(width * 0.06);
  const draw = (time: number) => {
    g.fillStyle = background;
    g.fillRect(0, 0, width, height);
    g.fillStyle = text;
    g.textBaseline = 'top';
    g.font = `700 ${Math.round(width * 0.065)}px "Exo 2", system-ui, sans-serif`;
    g.fillText(input.project.name || 'Untitled', pad, pad, width - pad * 2);
    const top = pad * 2 + Math.round(width * 0.08);
    const area = { x: pad, y: top, w: width - pad * 2, h: height - top - pad * 2.2 };
    g.fillStyle = muted;
    g.fillRect(area.x, area.y, area.w, area.h);
    g.font = `600 ${Math.round(width * 0.04)}px "Exo 2", system-ui, sans-serif`;
    if (time < plan.introSeconds) {
      // The hummed idea: its waveform with a playhead.
      g.fillStyle = text;
      g.fillText('Hummed', pad, height - pad * 1.8);
      const mid = area.y + area.h / 2;
      const progress = time / plan.introSeconds;
      waveform.forEach((peak, index) => {
        const x = area.x + (index / waveform.length) * area.w;
        g.fillStyle = index / waveform.length <= progress ? accent : text;
        g.globalAlpha = index / waveform.length <= progress ? 1 : 0.35;
        const h = Math.max(2, peak * area.h * 0.45);
        g.fillRect(x, mid - h, Math.max(1, area.w / waveform.length - 1), h * 2);
      });
      g.globalAlpha = 1;
      return;
    }
    const songTime = time - plan.introSeconds;
    const songStep = Math.min(plan.steps * plan.passes, songTime / plan.stepSeconds) % plan.steps;
    const frame = videoFrame(input.project, songStep);
    g.fillStyle = text;
    g.fillText(frame.section ?? `${input.project.bpm} BPM`, pad, height - pad * 1.8);
    const hitBand = frame.rows ? Math.min(area.h * 0.3, frame.rows * area.h * 0.06) : 0;
    const noteArea = { ...area, h: area.h - hitBand - (hitBand ? pad * 0.4 : 0) };
    const span = Math.max(12, frame.high - frame.low + 1);
    const sx = (step: number) => area.x + (step / frame.windowSteps) * area.w;
    const rowH = noteArea.h / span;
    for (const note of frame.notes) {
      g.fillStyle = colors[Math.max(0, note.channelIndex) % colors.length];
      g.globalAlpha = note.active ? 1 : 0.4;
      const y = noteArea.y + (frame.high - note.pitch) * rowH + (noteArea.h - span * rowH) / 2;
      const grow = note.active ? rowH * 0.25 : 0;
      g.fillRect(sx(note.x), y - grow, Math.max(4, (note.width / frame.windowSteps) * area.w - 3), Math.max(6, rowH * 0.8) + grow * 2);
    }
    const hitRow = hitBand / Math.max(1, frame.rows);
    for (const hit of frame.hits) {
      g.fillStyle = colors[Math.max(0, hit.channelIndex) % colors.length];
      g.globalAlpha = hit.active ? 1 : 0.4;
      const size = hit.active ? 1 : 0.7;
      const w = (area.w / frame.windowSteps) * size;
      g.fillRect(sx(hit.x) + ((area.w / frame.windowSteps) - w) / 2, area.y + area.h - hitBand + hit.row * hitRow + hitRow * (1 - size) / 2,
        Math.max(3, w - 2), Math.max(3, hitRow * size - 2));
    }
    g.globalAlpha = 1;
    g.fillStyle = accent;
    g.fillRect(sx(frame.playhead), area.y, 4, area.h);
  };

  draw(0);
  recorder.start(1000);
  const start = ctx.currentTime + 0.15;
  if (original) {
    const source = ctx.createBufferSource();
    source.buffer = original;
    source.connect(destination);
    source.start(start, 0, plan.introSeconds);
  }
  for (let pass = 0; pass < plan.passes; pass++) {
    const source = ctx.createBufferSource();
    source.buffer = song;
    source.connect(destination);
    source.start(start + plan.introSeconds + pass * plan.passSeconds);
    // The effect tail of the last pass only.
    if (pass < plan.passes - 1) source.stop(start + plan.introSeconds + (pass + 1) * plan.passSeconds + 0.5);
  }
  await new Promise<void>((resolve) => {
    const tick = () => {
      const time = ctx.currentTime - start;
      draw(Math.max(0, time));
      input.onProgress(Math.min(plan.totalSeconds, Math.max(0, time)), plan.totalSeconds);
      if (time >= plan.totalSeconds) resolve();
      else if (document.hidden) setTimeout(tick, 33);
      else requestAnimationFrame(tick);
    };
    tick();
  });
  recorder.stop();
  await stopped;
  await ctx.close();
  return { blob: new Blob(chunks, { type: type.split(';')[0] }), extension: type.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

function peaks(data: Float32Array, count: number): number[] {
  const size = Math.max(1, Math.floor(data.length / count));
  const out: number[] = [];
  let max = 0;
  for (let i = 0; i < count; i++) {
    let peak = 0;
    for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j++) peak = Math.max(peak, Math.abs(data[j]));
    out.push(peak);
    max = Math.max(max, peak);
  }
  return out.map((peak) => (max ? peak / max : 0));
}
