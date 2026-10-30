import { layoutChordRow } from '../library/guitar/patterns';
import { setChordRow } from './chordRow';
import { nextPhrase, type PhraseVariation } from '../library/phrases';
import { detectKey } from '../library/progressions';
import { LOOP_BARS, setLoopBars, type Channel, type LoopBars, type NoteEvent, type Project, type StepEventMetadata } from './project';

/**
 * Bars (plan.md milestone A): a bar layer over the loop. A bar is a slice of the current pattern
 * (`noteLength` steps); bar edits rearrange every channel's steps, lane steps, notes and chord events together.
 */

export const MAX_BARS = Math.max(...LOOP_BARS);

const barsKey = (p: Project) => p.currentPatternId ?? 'loop';

/** Bar names for the current loop or pattern (empty strings when unnamed). */
export function barNames(p: Project): string[] {
  const saved = p.barNames?.[barsKey(p)] ?? [];
  return Array.from({ length: p.loopBars }, (_, bar) => saved[bar] ?? '');
}

export function setBarName(p: Project, bar: number, name: string): Project {
  if (bar < 0 || bar >= p.loopBars) return p;
  const names = barNames(p);
  names[bar] = name.slice(0, 24);
  return { ...p, barNames: { ...(p.barNames ?? {}), [barsKey(p)]: names } };
}

const sliceSteps = (steps: readonly boolean[], order: readonly (number | null)[], per: number) =>
  order.flatMap((source) => Array.from({ length: per }, (_, offset) => source === null ? false : Boolean(steps[source * per + offset])));

function sliceMetadata(metadata: Record<number, StepEventMetadata> | undefined, order: readonly (number | null)[], per: number) {
  if (!metadata) return undefined;
  const out: Record<number, StepEventMetadata> = {};
  order.forEach((source, bar) => {
    if (source === null) return;
    for (let offset = 0; offset < per; offset++) {
      const value = metadata[source * per + offset];
      if (value) out[bar * per + offset] = { ...value };
    }
  });
  return out;
}

/** Events that start in each source bar move with it; the first copy keeps its id (recognition tracks edits by id). */
function sliceEvents<T extends { id: string; step: number; durationSteps: number }>(
  events: readonly T[], order: readonly (number | null)[], per: number, length: number,
): T[] {
  const used = new Set<number>();
  return order.flatMap((source, bar) => {
    if (source === null) return [];
    const first = !used.has(source);
    used.add(source);
    return events.filter((event) => Math.floor(event.step / per) === source).map((event) => {
      const step = bar * per + (event.step - source * per);
      return {
        ...event,
        id: first ? event.id : `${event.id}~b${bar}`,
        step,
        durationSteps: Math.max(1, Math.min(event.durationSteps, length - step)),
      };
    });
  });
}

/** Chord-row symbols per bar ("Am", "Am G"), for rebuilding a guitar's chord row in the new bar order. */
function rowBars(text: string, per: number, bars: number): string[] {
  const { chords } = layoutChordRow(text, per, bars);
  return Array.from({ length: bars }, (_, bar) => chords.filter((chord) => Math.floor(chord.step / per) === bar)
    .map((chord) => chord.symbol).join(' '));
}

/**
 * Rebuild the loop from bars of the current loop: `order[i]` is the old bar that becomes bar i (null = empty bar).
 * The loop becomes `order.length` bars, which must be 1, 2 or 4.
 */
export function rearrangeBars(p: Project, order: readonly (number | null)[]): Project {
  const bars = order.length as LoopBars;
  if (!LOOP_BARS.includes(bars) || order.some((source) => source !== null && (source < 0 || source >= p.loopBars))) return p;
  const per = p.noteLength;
  const length = bars * per;
  // The recording a track came from still plays where it was sung, so it only stays on when its bars did not move.
  const moved = order.slice(0, p.loopBars).some((source, bar) => source !== bar);
  const channels: Channel[] = p.channels.map((channel) => {
    const metadata = sliceMetadata(channel.stepEventMetadata, order, per);
    return {
      ...channel,
      steps: sliceSteps(channel.steps, order, per),
      notes: sliceEvents<NoteEvent>(channel.notes ?? [], order, per, length),
      ...(metadata ? { stepEventMetadata: metadata } : {}),
      chordEvents: sliceEvents((channel.chordEvents ?? []).filter((event) => !event.id.startsWith('row-')), order, per, length),
      ...(channel.lanes ? {
        lanes: channel.lanes.map((lane) => {
          const laneMetadata = sliceMetadata(lane.stepEventMetadata, order, per);
          return { ...lane, steps: sliceSteps(lane.steps, order, per), ...(laneMetadata ? { stepEventMetadata: laneMetadata } : {}) };
        }),
      } : {}),
      ...(moved && channel.playOriginal ? { playOriginal: false } : {}),
    };
  });
  const names = barNames(p);
  let next = setLoopBars({ ...p, channels }, bars);
  next = {
    ...next,
    barNames: { ...(p.barNames ?? {}), [barsKey(p)]: order.map((source) => source === null ? '' : names[source]) },
  };
  // Guitar chord rows: the symbols follow their bars; an empty bar holds the chord before it.
  for (const channel of p.channels) {
    if (!channel.chordRow) continue;
    const symbols = rowBars(channel.chordRow.chords, per, p.loopBars);
    const fallback = symbols.find(Boolean) ?? '';
    let last = fallback;
    const text = order.map((source) => {
      const value = source === null ? last : symbols[source] || last;
      last = value || last;
      return value;
    }).filter(Boolean).join(' | ');
    next = setChordRow(next, channel.id, { ...channel.chordRow, chords: text || channel.chordRow.chords });
  }
  return next;
}

const identity = (p: Project) => Array.from({ length: p.loopBars }, (_, bar) => bar);

/** Smallest loop length (1, 2 or 4 bars) that holds `count` bars, padded with empty bars. */
function fit(order: (number | null)[]): (number | null)[] | undefined {
  const size = LOOP_BARS.find((bars) => bars >= order.length);
  return size === undefined ? undefined : [...order, ...Array(size - order.length).fill(null)];
}

/** Swap a bar with its neighbour (direction −1 or +1). */
export function moveBar(p: Project, bar: number, direction: -1 | 1): Project {
  const target = bar + direction;
  if (bar < 0 || bar >= p.loopBars || target < 0 || target >= p.loopBars) return p;
  const order = identity(p);
  [order[bar], order[target]] = [order[target], order[bar]];
  return rearrangeBars(p, order);
}

/** Bars in use: the loop without trailing empty bars (chord rows ignored, they fill every bar), but at least `min`. */
function usedBars(p: Project, min: number): number {
  let used = p.loopBars;
  while (used > min && barIsEmpty(p, used - 1, true)) used--;
  return used;
}

/** Insert a copy after the bar; later bars move right and the loop grows (empty bars fill up to 1, 2 or 4). */
export function canDuplicateBar(p: Project, bar: number): boolean {
  return bar >= 0 && bar < p.loopBars && usedBars(p, bar + 1) < MAX_BARS;
}

export function duplicateBar(p: Project, bar: number): Project {
  if (!canDuplicateBar(p, bar)) return p;
  const order: (number | null)[] = Array.from({ length: usedBars(p, bar + 1) }, (_, index) => index);
  order.splice(bar + 1, 0, bar);
  const fitted = fit(order);
  return fitted ? rearrangeBars(p, fitted) : p;
}

/** Copy a bar over another bar. */
export function copyBar(p: Project, from: number, to: number): Project {
  if (from === to || from < 0 || to < 0 || from >= p.loopBars || to >= p.loopBars) return p;
  const order = identity(p);
  order[to] = from;
  return rearrangeBars(p, order);
}

export function clearBar(p: Project, bar: number): Project {
  if (bar < 0 || bar >= p.loopBars) return p;
  const order: (number | null)[] = identity(p);
  order[bar] = null;
  return rearrangeBars(p, order);
}

/** Double the loop by repeating it (1 → 2 or 2 → 4 bars). */
export function doubleLoop(p: Project): Project {
  if (p.loopBars * 2 > MAX_BARS) return p;
  return rearrangeBars(p, [...identity(p), ...identity(p)]);
}

/** The loop reduced to one bar, for looping that bar on its own (nothing saved). */
export function barPreview(p: Project, bar: number): Project {
  const single = rearrangeBars({ ...p, arrangement: [] }, [bar]);
  return { ...single, arrangement: [], channels: single.channels.map((channel) => ({ ...channel, playOriginal: false })) };
}

/**
 * Everything that sounds in one bar, as comparable tokens (step offset, channel, pitch or lane).
 * With `rhythmOnly`, notes and chords count by when they start, not what they play.
 */
export function barTokens(p: Project, bar: number, rhythmOnly = false): Set<string> {
  const per = p.noteLength;
  const start = bar * per;
  const tokens = new Set<string>();
  for (const channel of p.channels) {
    for (let offset = 0; offset < per; offset++) {
      if (channel.steps[start + offset]) tokens.add(`${channel.id}:s${offset}`);
      for (const lane of channel.lanes ?? []) if (lane.steps[start + offset]) tokens.add(`${channel.id}:${lane.id}${offset}`);
    }
    for (const note of channel.notes ?? []) {
      if (Math.floor(note.step / per) === bar) tokens.add(`${channel.id}:n${note.step - start}${rhythmOnly ? '' : `.${note.pitch}`}`);
    }
    for (const event of channel.chordEvents ?? []) {
      if (Math.floor(event.step / per) === bar) tokens.add(`${channel.id}:c${event.step - start}${rhythmOnly ? '' : `.${event.root}.${event.quality}.${event.articulation}`}`);
    }
  }
  return tokens;
}

export function barIsEmpty(p: Project, bar: number, ignoreChordRows = false): boolean {
  const tokens = barTokens(ignoreChordRows ? { ...p, channels: p.channels.map((channel) => channel.chordRow
    ? { ...channel, chordEvents: (channel.chordEvents ?? []).filter((event) => !event.id.startsWith('row-')) } : channel) } : p, bar);
  return tokens.size === 0;
}

/**
 * Family letters for the bars: identical bars share a letter (A A B A); a bar that shares at least
 * 60% of its rhythm (what starts when, on which track) with an earlier family gets that letter with a
 * prime (A′), so a variation with new notes on the same rhythm joins its family. Empty bars get "–".
 */
export function barFamilies(p: Project): string[] {
  const families: { letter: string; tokens: Set<string>; rhythm: Set<string> }[] = [];
  return Array.from({ length: p.loopBars }, (_, bar) => {
    const tokens = barTokens(p, bar);
    if (!tokens.size) return '–';
    const rhythm = barTokens(p, bar, true);
    const same = families.find((family) => family.tokens.size === tokens.size && [...tokens].every((token) => family.tokens.has(token)));
    if (same) return same.letter;
    const similar = families.find((family) => {
      const shared = [...rhythm].filter((token) => family.rhythm.has(token)).length;
      return shared / new Set([...rhythm, ...family.rhythm]).size >= 0.6;
    });
    if (similar) return `${similar.letter}′`;
    const letter = String.fromCharCode(65 + families.length);
    families.push({ letter, tokens, rhythm });
    return letter;
  });
}

/**
 * Bar families (plan.md C2): insert a variation after a bar. Drums and chords are copied; each melody or bass
 * line in the bar gets Echo, Answer or Twist (src/library/phrases.ts), keeping its rhythm, so the new bar
 * joins the bar's family as A′.
 */
export function canVaryBar(p: Project, bar: number): boolean {
  return canDuplicateBar(p, bar) && p.channels.some((channel) => isLine(channel) && channel.notes.some((note) => Math.floor(note.step / p.noteLength) === bar));
}

const isLine = (channel: Channel) => !channel.lanes && !channel.generatedMetadata && (channel.notes?.length ?? 0) > 0;

export function varyBar(p: Project, bar: number, variation: PhraseVariation): Project {
  if (!canVaryBar(p, bar)) return p;
  const next = duplicateBar(p, bar);
  const per = p.noteLength;
  const target = bar + 1;
  const melody = p.channels.filter(isLine).flatMap((channel) => channel.notes);
  const detected = detectKey(melody, per);
  // A few hummed notes rarely pin the key down, so the project key wins unless the melody is clear.
  const key = detected && detected.confidence >= 0.8 ? { root: detected.root, scaleId: detected.scaleId } : { root: p.scaleRoot, scaleId: p.scaleId };
  const channels = next.channels.map((channel) => {
    if (!isLine(channel)) return channel;
    const inBar = channel.notes.filter((note) => Math.floor(note.step / per) === target);
    if (!inBar.length) return channel;
    const varied = nextPhrase(inBar, key, variation, (p.seed ?? 1) * 31 + bar).map((note, index) => ({
      ...note,
      id: `${inBar[Math.min(index, inBar.length - 1)].id}~${variation[0]}${target}-${index}`,
    }));
    return { ...channel, notes: [...channel.notes.filter((note) => Math.floor(note.step / per) !== target), ...varied] };
  });
  return setLoopBars({ ...next, channels }, next.loopBars);
}
