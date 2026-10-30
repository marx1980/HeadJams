import { addKitChannel, findDrumKit } from './drumKits';
import { harmonyFor, HARMONY_PRESETS } from './phrases';
import { detectKey, suggestProgressions } from './progressions';
import { addGeneratedArrangementChannel, addGeneratedBassChannel, generateBassFromChords, generateBassFromMelody } from '../model/arrangement';
import { channelRole, mutedForDensity } from '../model/songBuilder';
import { addPattern, MAX_CHANNELS, setBpm, totalSteps, updateChannel, type Channel, type NoteEvent, type Project } from '../model/project';

/**
 * Commands (plan.md milestone D): a small fixed set of requests in plain words, English or Croatian, each
 * mapped to the app's own engines. No model: a request is matched against keywords, checked against the
 * project, and answered with alternatives to hear and keep (or a short reason it cannot be done).
 */

export type CommandId = 'simpler' | 'harmony' | 'bass' | 'drums' | 'softer' | 'louder' | 'bigger-chorus' | 'ending' | 'faster' | 'slower';

export interface Command {
  id: CommandId;
  /** Bar (0-based) the request names, e.g. "bar 2". */
  bar?: number;
  /** Which tracks a volume request is about. */
  target?: Target;
}

export type Target = 'guitar' | 'piano' | 'drums' | 'bass' | 'strings' | 'melody' | 'chords' | 'all';

/** Quick buttons, in the order shown. */
export const COMMAND_CHIPS: ReadonlyArray<{ text: string; label: string }> = [
  { text: 'make it simpler', label: 'Simpler' },
  { text: 'three harmonies', label: 'Harmony' },
  { text: 'add a bass', label: 'Bass' },
  { text: 'add drums', label: 'Drums' },
  { text: 'softer guitar', label: 'Softer guitar' },
  { text: 'bigger chorus', label: 'Bigger chorus' },
  { text: 'make an ending', label: 'Ending' },
];

const RULES: ReadonlyArray<{ id: CommandId; words: RegExp }> = [
  { id: 'simpler', words: /\b(simpl\w*|easier|fewer notes|jednostavn\w*|lakš\w*)/ },
  { id: 'harmony', words: /\b(harmon\w*|second voice|drugi glas|harmonij\w*)/ },
  { id: 'bass', words: /\b(bass\w*|bas|basa|basom)\b/ },
  { id: 'drums', words: /\b(drum\w*|beat|groove|bubnj\w*|ritam)\b/ },
  { id: 'softer', words: /\b(softer|quieter|lower the|tiš\w*|mekš\w*)/ },
  { id: 'louder', words: /\b(louder|turn up|glasnij\w*|jač\w*)/ },
  { id: 'bigger-chorus', words: /\b(bigger|fuller|već\w*|puni\w*)\b.*\b(chorus|refren\w*)|\b(chorus|refren\w*)\b.*\b(bigger|fuller|već\w*|puni\w*)/ },
  { id: 'ending', words: /\b(ending|end it|finish|outro|završet\w*|kraj\w*)/ },
  { id: 'faster', words: /\b(faster|speed up|brž\w*)/ },
  { id: 'slower', words: /\b(slower|slow down|sporij\w*)/ },
];

const TARGETS: ReadonlyArray<{ id: Target; words: RegExp }> = [
  { id: 'guitar', words: /\b(guitar\w*|gitar\w*)/ },
  { id: 'piano', words: /\b(piano|keys|klavir\w*)/ },
  { id: 'drums', words: /\b(drum\w*|beat|bubnj\w*)/ },
  { id: 'bass', words: /\b(bass|bas|basa)\b/ },
  { id: 'strings', words: /\b(strings|gudač\w*)/ },
  { id: 'chords', words: /\b(chords?|akord\w*)/ },
  { id: 'melody', words: /\b(melod\w*|tune|voice|glas)\b/ },
];

/**
 * Read a request. "Keep my melody" is always true here (no command changes the melody's pitches or
 * rhythm except Simpler, which only removes notes), so it is accepted and needs no action.
 */
export type VoiceAction = 'play' | 'stop' | 'undo' | 'record';
const ACTIONS: ReadonlyArray<{ id: VoiceAction; words: RegExp }> = [
  { id: 'stop', words: /^(stop|stani|zaustavi|dosta)\b/ },
  { id: 'play', words: /^(play|start|sviraj|pusti|kreni)\b/ },
  { id: 'undo', words: /^(undo|poništi|vrati)\b/ },
  { id: 'record', words: /^(record|capture|snimi|snimaj)\b/ },
];

export function parseCommand(text: string): { commands: Command[]; keepMelody: boolean; action?: VoiceAction } {
  const lower = text.toLowerCase();
  const barMatch = /\b(?:bar|takt|taktu)\s*(\d+)/.exec(lower);
  const bar = barMatch ? Math.max(0, Number(barMatch[1]) - 1) : undefined;
  const target = TARGETS.find((item) => item.words.test(lower))?.id;
  const ids = RULES.filter((rule) => rule.words.test(lower)).map((rule) => rule.id);
  // "Bigger chorus" is one request, not "bigger" plus nothing; volume words only count with a target.
  const commands = ids.filter((id) => !(id === 'drums' && (ids.includes('softer') || ids.includes('louder'))))
    .filter((id) => !(id === 'bass' && (ids.includes('softer') || ids.includes('louder'))))
    .map((id): Command => ({ id, ...(bar !== undefined ? { bar } : {}), ...((id === 'softer' || id === 'louder') ? { target: target ?? 'all' } : {}) }));
  // Transport words ("play", "stop", "undo", "record") count only when they start a request without a command.
  const action = commands.length ? undefined : ACTIONS.find((item) => item.words.test(lower.trim()))?.id;
  return { commands, keepMelody: /\b(keep|leave|zadrž\w*|ostavi)\b.*\b(melod\w*|tune)/.test(lower), ...(action ? { action } : {}) };
}

export interface CommandOption { id: string; label: string; detail?: string; project: Project }
export type CommandResult = { label: string; options: CommandOption[] } | { label: string; message: string };

/** The track the user sang or wrote: the first plain note track that is not bass. */
export function melodyChannel(p: Project): Channel | undefined {
  const lines = p.channels.filter((channel) => !channel.lanes && !channel.generatedMetadata && (channel.notes?.length ?? 0) > 0);
  return lines.find((channel) => channelRole(p, channel) === 'melody') ?? lines[0];
}

function keyOf(p: Project, notes: readonly NoteEvent[]) {
  const detected = detectKey(notes, p.noteLength);
  return detected && detected.confidence >= 0.5 ? { root: detected.root, scaleId: detected.scaleId }
    : { root: p.scaleRoot, scaleId: (p.scaleId.startsWith('minor') ? 'minor' : 'major') as 'major' | 'minor' };
}

/** Keep the longest note starting in each window (a beat or half a bar), held until the next kept note. */
export function simplifyNotes(notes: readonly NoteEvent[], window: number, from = 0, to = Number.POSITIVE_INFINITY): NoteEvent[] {
  const inside = notes.filter((note) => note.step >= from && note.step < to);
  const outside = notes.filter((note) => note.step < from || note.step >= to);
  const kept = new Map<number, NoteEvent>();
  for (const note of inside) {
    const slot = Math.floor(note.step / window);
    const best = kept.get(slot);
    if (!best || note.durationSteps > best.durationSteps || (note.durationSteps === best.durationSteps && note.step < best.step)) kept.set(slot, note);
  }
  const ordered = [...kept.values()].sort((a, b) => a.step - b.step);
  const end = Math.min(to, Math.max(...inside.map((note) => note.step + note.durationSteps), 0));
  const held = ordered.map((note, index) => ({
    ...note,
    durationSteps: Math.max(note.durationSteps, (ordered[index + 1]?.step ?? end) - note.step),
  }));
  return [...outside, ...held].sort((a, b) => a.step - b.step);
}

const matchesTarget = (p: Project, channel: Channel, target: Target) => {
  if (target === 'all') return true;
  const role = channelRole(p, channel);
  const sound = `${channel.soundId} ${channel.name}`.toLowerCase();
  switch (target) {
    case 'guitar': return /guitar|nylon|clean/.test(sound);
    case 'piano': return /piano/.test(sound);
    case 'strings': return /string/.test(sound);
    case 'drums': return role === 'drums';
    case 'bass': return role === 'bass';
    case 'chords': return role === 'chords';
    case 'melody': return role === 'melody';
  }
};

const GROOVES: ReadonlyArray<{ id: string; label: string; lanes: Record<string, string> }> = [
  { id: 'rock', label: 'Rock', lanes: { kick: 'x.......x.x.....', snare: '....x.......x...', 'hat-closed': 'x.x.x.x.x.x.x.x.' } },
  { id: 'four', label: 'Four on the floor', lanes: { kick: 'x...x...x...x...', snare: '....x.......x...', 'hat-open': '..x...x...x...x.' } },
  { id: 'hiphop', label: 'Hip-hop', lanes: { kick: 'x.....x...x.....', snare: '....x.......x...', 'hat-closed': 'x.x.x.x.x.x.x.xx' } },
  { id: 'half', label: 'Half time', lanes: { kick: 'x.........x.....', snare: '........x.......', 'hat-closed': 'x.x.x.x.x.x.x.x.' } },
];

function withGroove(p: Project, groove: (typeof GROOVES)[number]): Project {
  const kit = findDrumKit('acoustic-kit');
  if (!kit) return p;
  const added = addKitChannel(p, kit);
  const channel = added.channels.at(-1);
  if (added === p || !channel?.lanes) return p;
  const length = totalSteps(added);
  const per = added.noteLength;
  const lanes = channel.lanes.map((lane) => {
    const bar = groove.lanes[lane.id];
    if (!bar) return lane;
    return { ...lane, steps: Array.from({ length }, (_, step) => {
      const sixteenth = ((step % per) * 16) / per;
      return Number.isInteger(sixteenth) && bar[sixteenth] === 'x';
    }) };
  });
  return updateChannel(added, channel.id, { lanes, name: `${groove.label} drums` });
}

/** Turn a command into alternatives to hear (or a reason it cannot be done). */
export function runCommand(p: Project, command: Command): CommandResult {
  const melody = melodyChannel(p);
  const notes = melody?.notes ?? [];
  const per = p.noteLength;
  const room = p.channels.length < MAX_CHANNELS;
  const key = keyOf(p, notes);
  switch (command.id) {
    case 'simpler': {
      if (!melody) return { label: 'Simpler', message: 'No melody' };
      const from = command.bar !== undefined ? command.bar * per : 0;
      const to = command.bar !== undefined ? from + per : Number.POSITIVE_INFINITY;
      if (command.bar !== undefined && command.bar >= p.loopBars) return { label: 'Simpler', message: `No bar ${command.bar + 1}` };
      const beat = Math.max(1, per / 4);
      const options = [
        { id: 'simpler', label: 'Simpler', window: beat },
        { id: 'simplest', label: 'Simplest', window: per / 2 },
      ].map((option) => {
        const simplified = simplifyNotes(notes, option.window, from, to);
        return {
          id: option.id, label: option.label, detail: `${notes.length} → ${simplified.length} notes`,
          project: updateChannel(p, melody.id, { notes: simplified }),
        };
      }).filter((option) => option.project.channels.find((channel) => channel.id === melody.id)!.notes.length < notes.length);
      return options.length ? { label: command.bar !== undefined ? `Simpler · Bar ${command.bar + 1}` : 'Simpler', options }
        : { label: 'Simpler', message: 'Already simple' };
    }
    case 'harmony': {
      if (!melody) return { label: 'Harmony', message: 'No melody' };
      if (!room) return { label: 'Harmony', message: 'No room for another track' };
      return {
        label: 'Harmony',
        options: HARMONY_PRESETS.map((preset) => ({
          id: preset.id, label: preset.label,
          project: addGeneratedArrangementChannel(p, melody.id, `${preset.label} harmony · ${melody.name}`, 'strings', 'harmony-generation',
            harmonyFor(notes, key, preset.id, totalSteps(p))),
        })).filter((option) => option.project !== p),
      };
    }
    case 'bass': {
      if (!melody) return { label: 'Bass', message: 'No melody' };
      if (!room) return { label: 'Bass', message: 'No room for another track' };
      const [simple] = suggestProgressions(notes, key, per, p.loopBars, { halfBar: p.loopBars <= 2 });
      const fromChords = simple ? generateBassFromChords(simple.chords.map((chord) => ({ ...chord, confidence: 0.8, alternatives: [] })), per, totalSteps(p)) : [];
      const options = [
        { id: 'roots', label: 'Roots and fifths', notes: fromChords },
        { id: 'follow', label: 'Follow the melody', notes: generateBassFromMelody(notes, totalSteps(p)) },
      ].filter((option) => option.notes.length)
        .map((option) => ({ id: option.id, label: option.label, project: addGeneratedBassChannel(p, melody.id, option.notes) }))
        .filter((option) => option.project !== p);
      return options.length ? { label: 'Bass', options } : { label: 'Bass', message: 'No bass could be made' };
    }
    case 'drums': {
      if (!room) return { label: 'Drums', message: 'No room for another track' };
      return { label: 'Drums', options: GROOVES.map((groove) => ({ id: groove.id, label: groove.label, project: withGroove(p, groove) })) };
    }
    case 'softer':
    case 'louder': {
      const target = command.target ?? 'all';
      const matching = p.channels.filter((channel) => matchesTarget(p, channel, target));
      const label = `${command.id === 'softer' ? 'Softer' : 'Louder'} · ${target === 'all' ? 'all' : target}`;
      if (!matching.length) return { label, message: `No ${target} track` };
      const factors = command.id === 'softer' ? [0.75, 0.5] : [1.25, 1.5];
      return {
        label,
        options: factors.map((factor) => ({
          id: String(factor), label: `${Math.round(factor * 100)}%`,
          project: matching.reduce((next, channel) => updateChannel(next, channel.id, { volume: Math.max(0, Math.min(1, channel.volume * factor)) }), p),
        })),
      };
    }
    case 'bigger-chorus': {
      const choruses = p.arrangement.filter((clip) => /chorus|refren/i.test(clip.section ?? ''));
      if (!choruses.length) return { label: 'Bigger chorus', message: 'No chorus · Song › Song builder' };
      if (choruses.every((clip) => !clip.mutedChannelIds?.length)) return { label: 'Bigger chorus', message: 'Chorus already Big' };
      const big = { ...p, arrangement: p.arrangement.map((clip) => choruses.includes(clip) ? { ...clip, mutedChannelIds: [] } : clip) };
      return { label: 'Bigger chorus', options: [{ id: 'all-in', label: 'Everything in', project: big }] };
    }
    case 'ending': {
      // The song (or the loop) plays out, then a last bar of the first bar's chords and melody rings out.
      let song = p;
      if (!song.currentPatternId) song = addPattern(song, 'A');
      const patternId = song.currentPatternId!;
      const arrangement = song.arrangement.length ? song.arrangement : [{ id: 'clip-main', patternId, startStep: 0, lengthSteps: totalSteps(song) }];
      const end = arrangement.reduce((length, clip) => Math.max(length, clip.startStep + clip.lengthSteps), 0);
      const last = arrangement.reduce((latest, clip) => (clip.startStep >= latest.startStep ? clip : latest), arrangement[0]);
      const pattern = song.patterns.find((item) => item.id === last.patternId);
      const channels = pattern?.channels ?? song.channels;
      const small = mutedForDensity(song, channels, 'sparse');
      const options = [
        { id: 'ring', label: 'Last bar rings out', clips: [{ id: `clip-end-${end}`, patternId: last.patternId, startStep: end, lengthSteps: per, section: 'Ending', mutedChannelIds: small }] },
        { id: 'quiet', label: 'Quiet last round', clips: [{ id: `clip-end-${end}`, patternId: last.patternId, startStep: end, lengthSteps: last.lengthSteps, section: 'Ending', mutedChannelIds: small }] },
      ];
      return {
        label: 'Ending',
        options: options.map((option) => ({
          id: option.id, label: option.label,
          project: { ...song, arrangement: [...arrangement, ...option.clips] },
        })),
      };
    }
    case 'faster':
    case 'slower': {
      const steps = command.id === 'faster' ? [5, 10] : [-5, -10];
      return {
        label: command.id === 'faster' ? 'Faster' : 'Slower',
        options: steps.map((delta) => ({ id: String(delta), label: `${p.bpm + delta} BPM`, project: setBpm(p, Math.max(40, Math.min(200, p.bpm + delta))) })),
      };
    }
  }
}

/** For auditioning: song-level changes and tempo play the whole song; everything else plays the loop. */
export function previewOf(command: Command, project: Project): Project {
  return command.id === 'ending' || command.id === 'bigger-chorus' || command.id === 'faster' || command.id === 'slower'
    ? project : { ...project, arrangement: [] };
}
