import { fitTrackGrid, totalSteps, updateChannel, type Channel, type ChordEvent, type NoteEvent, type NoteLength, type Project } from './project';

/**
 * Per-track grid tools (Beat › track): Length (a short pattern that repeats), Steps (a coarser view),
 * and copying a track's pattern to another track or through the clipboard.
 */

export type TrackLength = 'half' | 'bar' | 'two' | 'loop';
export const TRACK_LENGTHS: ReadonlyArray<{ id: TrackLength; label: string; bars: number }> = [
  { id: 'half', label: '½ bar', bars: 0.5 },
  { id: 'bar', label: '1 bar', bars: 1 },
  { id: 'two', label: '2 bars', bars: 2 },
  { id: 'loop', label: 'Loop', bars: 0 },
];

/** Steps a track's grid plays before repeating. */
export const trackLength = (p: Pick<Project, 'noteLength' | 'loopBars'>, c: Channel) => c.lengthSteps ?? totalSteps(p);

export function trackLengthId(p: Pick<Project, 'noteLength' | 'loopBars'>, c: Channel): TrackLength {
  if (!c.lengthSteps) return 'loop';
  return TRACK_LENGTHS.find((item) => item.bars && item.bars * p.noteLength === c.lengthSteps)?.id ?? 'loop';
}

/** Lengths that are shorter than the loop (and so make sense for this project). */
export const lengthOptions = (p: Pick<Project, 'noteLength' | 'loopBars'>) =>
  TRACK_LENGTHS.filter((item) => item.id === 'loop' || (item.bars < p.loopBars && Number.isInteger(item.bars * p.noteLength)));

/** Grid tracks only (steps or kit lanes): note and chord tracks keep the whole loop. */
export const canSetLength = (c: Channel) => !(c.notes?.length) && !(c.chordEvents?.length);

export function setTrackLength(p: Project, channelId: string, id: TrackLength): Project {
  const channel = p.channels.find((item) => item.id === channelId);
  const option = TRACK_LENGTHS.find((item) => item.id === id);
  if (!channel || !option || !canSetLength(channel)) return p;
  const total = totalSteps(p);
  const { lengthSteps: _old, ...rest } = channel;
  const next = fitTrackGrid({ ...rest, ...(option.bars ? { lengthSteps: option.bars * p.noteLength } : {}) }, p.noteLength, total);
  return updateChannel(p, channelId, { ...next, lengthSteps: next.lengthSteps });
}

/** Steps per bar a track can show: the project grid or coarser. */
export const viewOptions = (p: Pick<Project, 'noteLength'>): NoteLength[] => ([4, 8, 16] as NoteLength[]).filter((n) => n <= p.noteLength && p.noteLength % n === 0);
export const trackView = (p: Pick<Project, 'noteLength'>, c: Channel): NoteLength => c.viewSteps && c.viewSteps < p.noteLength ? c.viewSteps : p.noteLength;

export function setTrackView(p: Project, channelId: string, view: NoteLength): Project {
  return updateChannel(p, channelId, { viewSteps: view < p.noteLength ? view : undefined });
}

/** The cells a grid shows: every `noteLength / view`-th step of the track's length; hidden hits mark the cell before them. */
export function gridCells(steps: readonly boolean[], length: number, noteLength: number, view: number): { step: number; on: boolean; hidden: boolean }[] {
  const every = Math.max(1, noteLength / view);
  const cells: { step: number; on: boolean; hidden: boolean }[] = [];
  for (let step = 0; step < length; step += every) {
    let hidden = false;
    for (let inner = 1; inner < every; inner++) if (steps[step + inner]) hidden = true;
    cells.push({ step, on: Boolean(steps[step]), hidden });
  }
  return cells;
}

/** A track's pattern on the clipboard, at its own grid resolution. */
export interface TrackClip {
  kind: 'hits' | 'kit' | 'notes';
  noteLength: number;
  length: number;
  steps?: boolean[];
  lanes?: { id: string; steps: boolean[] }[];
  notes?: NoteEvent[];
  chordEvents?: ChordEvent[];
}

export const trackKind = (c: Channel): TrackClip['kind'] => c.lanes ? 'kit' : (c.notes?.length || c.chordEvents?.some((event) => !event.id.startsWith('row-'))) ? 'notes' : 'hits';

export function copyTrack(p: Project, channelId: string): TrackClip | undefined {
  const c = p.channels.find((item) => item.id === channelId);
  if (!c) return undefined;
  const length = trackLength(p, c);
  const kind = trackKind(c);
  return {
    kind, noteLength: p.noteLength, length,
    ...(kind === 'hits' ? { steps: c.steps.slice(0, length) } : {}),
    ...(kind === 'kit' ? { lanes: (c.lanes ?? []).map((lane) => ({ id: lane.id, steps: lane.steps.slice(0, length) })) } : {}),
    ...(kind === 'notes' ? {
      notes: (c.notes ?? []).filter((note) => note.step < length).map((note) => ({ ...note })),
      chordEvents: (c.chordEvents ?? []).filter((event) => !event.id.startsWith('row-') && event.step < length).map((event) => ({ ...event })),
    } : {}),
  };
}

/** Can this clip go onto that track: hits onto any grid track, kit onto kits, notes onto note tracks. */
export function canPaste(clip: TrackClip | undefined, c: Channel): boolean {
  if (!clip) return false;
  if (clip.kind === 'kit') return Boolean(c.lanes);
  if (clip.kind === 'hits') return !c.lanes && trackKind(c) === 'hits';
  return !c.lanes;
}

/** Place a clip on a track, converted to the project grid and repeated across the track's length. */
export function pasteTrack(p: Project, channelId: string, clip: TrackClip): Project {
  const c = p.channels.find((item) => item.id === channelId);
  if (!c || !canPaste(clip, c) || clip.length < 1) return p;
  const scale = p.noteLength / clip.noteLength;
  const sourceLength = Math.max(1, Math.round(clip.length * scale));
  const total = totalSteps(p);
  const length = trackLength(p, c);
  const tile = (steps: readonly boolean[]) => {
    const converted = Array.from({ length: sourceLength }, (_, j) => {
      const position = j / scale;
      return Number.isInteger(position) ? Boolean(steps[position]) : false;
    });
    return Array.from({ length: total }, (_, step) => step < length ? converted[step % sourceLength] : c.steps[step] ?? false);
  };
  if (clip.kind === 'hits') return updateChannel(p, channelId, { steps: tile(clip.steps ?? []), stepEventMetadata: {} });
  if (clip.kind === 'kit') {
    const byId = new Map((clip.lanes ?? []).map((lane) => [lane.id, lane.steps]));
    return updateChannel(p, channelId, { lanes: (c.lanes ?? []).map((lane) => {
      const steps = byId.get(lane.id);
      const tiled = tile(steps ?? []);
      return { ...lane, steps: steps ? tiled : tiled.map(() => false), stepEventMetadata: {} };
    }) });
  }
  const repeats = Math.max(1, Math.floor(total / sourceLength));
  const place = <T extends { id: string; step: number; durationSteps: number }>(events: readonly T[]) => Array.from({ length: repeats }, (_, round) =>
    events.flatMap((event) => {
      const step = event.step * scale + round * sourceLength;
      return Number.isInteger(step) && step < total
        ? [{ ...event, id: `${event.id}~p${round}`, step, durationSteps: Math.max(1, Math.min(Math.round(event.durationSteps * scale), total - step)) }]
        : [];
    })).flat();
  return updateChannel(p, channelId, {
    notes: place(clip.notes ?? []).map(({ sourceTakeId: _take, ...note }) => note),
    chordEvents: [...(c.chordEvents ?? []).filter((event) => event.id.startsWith('row-')), ...place(clip.chordEvents ?? [])],
  });
}

export const copyTrackTo = (p: Project, fromId: string, toId: string) => {
  const clip = copyTrack(p, fromId);
  return clip && fromId !== toId ? pasteTrack(p, toId, clip) : p;
};

const CLIPBOARD_KEY = 'musicmaker.trackClipboard';
export function saveClip(clip: TrackClip): void {
  try { localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clip)); } catch { /* storage unavailable */ }
}
export function loadClip(): TrackClip | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(CLIPBOARD_KEY) ?? 'null') as TrackClip | null;
    return raw && ['hits', 'kit', 'notes'].includes(raw.kind) && Number.isFinite(raw.noteLength) && Number.isFinite(raw.length) ? raw : undefined;
  } catch { return undefined; }
}
