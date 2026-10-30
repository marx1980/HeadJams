import type { Channel, Project } from './project';
import { songBars } from './tempo';

/**
 * Song › Automation: a track's volume or pan changes over the song. Points sit at the start of a bar
 * (or the end of the song) and the value moves in a straight line between them; before the first
 * point and after the last the value holds. Volume is a share of the track's own volume (0–1);
 * pan replaces the track's pan (−1 left … 1 right). Applied when each sound starts.
 */
export type AutomationParam = 'volume' | 'pan';

export interface AutomationPoint {
  /** Bar on the song timeline (0-based); the song's bar count means the end of the song. */
  bar: number;
  value: number;
}

export interface AutomationLane {
  channelId: string;
  param: AutomationParam;
  points: AutomationPoint[];
}

export const AUTOMATION_PARAMS: { id: AutomationParam; label: string }[] = [
  { id: 'volume', label: 'Volume' },
  { id: 'pan', label: 'Pan' },
];

const clampValue = (param: AutomationParam, value: number) =>
  param === 'volume' ? Math.min(1, Math.max(0, value)) : Math.min(1, Math.max(-1, value));

export function automationLane(p: Pick<Project, 'automation'>, channelId: string, param: AutomationParam): AutomationLane | undefined {
  const lane = p.automation?.find((item) => item.channelId === channelId && item.param === param);
  return lane?.points.length ? lane : undefined;
}

/** The lane's value at song step `step` (fractional bars between points move in a line). */
export function laneValue(lane: AutomationLane, step: number, stepsPerBar: number): number {
  const points = [...lane.points].sort((a, b) => a.bar - b.bar);
  const at = step / stepsPerBar;
  if (at <= points[0].bar) return points[0].value;
  for (let index = 1; index < points.length; index++) {
    const next = points[index];
    if (at <= next.bar) {
      const previous = points[index - 1];
      const span = next.bar - previous.bar;
      return span > 0 ? previous.value + (next.value - previous.value) * ((at - previous.bar) / span) : next.value;
    }
  }
  return points[points.length - 1].value;
}

/** A track's volume and pan at song step `step`, with its automation applied. */
export function automatedMix(
  p: Pick<Project, 'automation' | 'noteLength'>, channel: Pick<Channel, 'id' | 'volume' | 'pan'>, step: number,
): { volume: number; pan: number } {
  if (!p.automation?.length) return { volume: channel.volume, pan: channel.pan };
  const volume = automationLane(p, channel.id, 'volume');
  const pan = automationLane(p, channel.id, 'pan');
  return {
    volume: volume ? channel.volume * laneValue(volume, step, p.noteLength) : channel.volume,
    pan: pan ? laneValue(pan, step, p.noteLength) : channel.pan,
  };
}

function withLane(p: Project, channelId: string, param: AutomationParam, points: AutomationPoint[]): Project {
  const others = (p.automation ?? []).filter((lane) => lane.channelId !== channelId || lane.param !== param);
  const lanes = points.length ? [...others, { channelId, param, points: [...points].sort((a, b) => a.bar - b.bar) }] : others;
  const { automation: _old, ...rest } = p;
  return lanes.length ? { ...rest, automation: lanes } : rest;
}

/** Set the value at `bar` (0 … the song's bar count, which is the end). */
export function setAutomationPoint(p: Project, channelId: string, param: AutomationParam, bar: number, value: number): Project {
  if (!p.channels.some((channel) => channel.id === channelId)) return p;
  if (!Number.isInteger(bar) || bar < 0 || bar > songBars(p) || !Number.isFinite(value)) return p;
  const points = (automationLane(p, channelId, param)?.points ?? []).filter((point) => point.bar !== bar);
  return withLane(p, channelId, param, [...points, { bar, value: clampValue(param, value) }]);
}

export function moveAutomationPoint(p: Project, channelId: string, param: AutomationParam, from: number, to: number): Project {
  const point = automationLane(p, channelId, param)?.points.find((item) => item.bar === from);
  if (!point || from === to) return p;
  return setAutomationPoint(removeAutomationPoint(p, channelId, param, from), channelId, param, to, point.value);
}

export function removeAutomationPoint(p: Project, channelId: string, param: AutomationParam, bar: number): Project {
  const lane = automationLane(p, channelId, param);
  if (!lane) return p;
  return withLane(p, channelId, param, lane.points.filter((point) => point.bar !== bar));
}

export function clearAutomation(p: Project, channelId: string, param: AutomationParam): Project {
  return automationLane(p, channelId, param) ? withLane(p, channelId, param, []) : p;
}

/** A first point for a new lane: the track's current level (full) or its own pan, at bar 1. */
export function startingValue(channel: Pick<Channel, 'pan'>, param: AutomationParam): number {
  return param === 'volume' ? 1 : channel.pan;
}

/** A free bar for Add: after the last point, else the first free one. */
export function nextFreeAutomationBar(p: Project, channelId: string, param: AutomationParam): number | undefined {
  const used = new Set((automationLane(p, channelId, param)?.points ?? []).map((point) => point.bar));
  const end = songBars(p);
  const last = used.size ? Math.max(...used) : -1;
  for (let bar = last + 1; bar <= end; bar++) if (!used.has(bar)) return bar;
  for (let bar = 0; bar <= end; bar++) if (!used.has(bar)) return bar;
  return undefined;
}

export function normalizeAutomation(value: unknown): AutomationLane[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const lanes = value.flatMap((item): AutomationLane[] => {
    if (!item || typeof item !== 'object') return [];
    const { channelId, param, points } = item as Partial<AutomationLane>;
    if (typeof channelId !== 'string' || (param !== 'volume' && param !== 'pan') || !Array.isArray(points)) return [];
    const clean = new Map<number, AutomationPoint>();
    for (const point of points) {
      if (point && Number.isInteger(point.bar) && point.bar >= 0 && Number.isFinite(point.value)) {
        clean.set(point.bar, { bar: point.bar, value: clampValue(param, point.value) });
      }
    }
    return clean.size ? [{ channelId, param, points: [...clean.values()].sort((a, b) => a.bar - b.bar) }] : [];
  });
  return lanes.length ? lanes : undefined;
}
