import { useEffect, useMemo, useState } from 'react';
import { totalSteps, type Channel, type ChordEvent, type ChordRow, type Project } from '../model/project';
import { DEFAULT_CHORD_ROW, HUMANISE_LEVELS, layoutChordRow, STRUM_PATTERNS, STRUM_SPEEDS } from '../library/guitar/patterns';
import { voiceChordSequence } from '../library/guitar/performer';
import { clearChordRow, setChordRow } from '../model/chordRow';
import { Icon } from './Icon';

const fretText = (frets: (number | null)[]) => {
  const parts = frets.map((fret) => fret === null ? 'x' : String(fret));
  return parts.some((part) => part.length > 1) ? parts.join('-') : parts.join('');
};

/** Guitar channel chord row (expansion.md E4): chord symbols + pattern → chord events. */
export function ChordRowEditor({ project, channel, onChange }: {
  project: Project;
  channel: Channel;
  onChange: (project: Project) => void;
}) {
  const saved = channel.chordRow;
  const [row, setRow] = useState<ChordRow>(saved ?? DEFAULT_CHORD_ROW);
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => { setRow(channel.chordRow ?? DEFAULT_CHORD_ROW); }, [channel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const bars = Math.max(1, Math.round(totalSteps(project) / project.noteLength));
  const layout = useMemo(() => layoutChordRow(row.chords, project.noteLength, bars), [row.chords, project.noteLength, bars]);
  const shapes = useMemo(() => {
    const seen = new Map<string, string>();
    const events: ChordEvent[] = layout.chords.map((chord, index) => ({
      id: `shape-${index}`, step: chord.step, root: chord.root, quality: chord.quality,
      articulation: chord.power ? 'power' : 'down-strum', durationSteps: chord.durationSteps, capo: row.capo,
    }));
    const voicings = voiceChordSequence(events);
    layout.chords.forEach((chord, index) => {
      if (!seen.has(chord.symbol)) seen.set(chord.symbol, fretText(voicings.get(`shape-${index}`)?.frets ?? []));
    });
    return [...seen];
  }, [layout, row.capo]);

  const apply = (next: ChordRow) => {
    setRow(next);
    onChange(setChordRow(project, channel.id, next));
  };
  const change = (patch: Partial<ChordRow>) => {
    const next = { ...row, ...patch };
    if (saved) apply(next);
    else setRow(next);
  };

  return (
    <div className="chord-row-editor" aria-label="Chord row">
      <strong>Chord row</strong>
      <label className="chord-row-chords">Chords
        <input id="chord-row-chords" value={row.chords} spellCheck={false} autoCapitalize="characters"
          onChange={(event) => setRow({ ...row, chords: event.target.value })}
          onKeyDown={(event) => { if (event.key === 'Enter') apply(row); }} />
      </label>
      <label>Pattern
        <select id="chord-row-pattern" value={row.pattern} onChange={(event) => change({ pattern: event.target.value })}>
          {STRUM_PATTERNS.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}
        </select>
      </label>
      <label>Strum
        <select id="chord-row-strum" value={row.strumMs} onChange={(event) => change({ strumMs: Number(event.target.value) })}>
          {STRUM_SPEEDS.map((speed) => <option key={speed.ms} value={speed.ms}>{speed.label}</option>)}
        </select>
      </label>
      <label>Humanise
        <select id="chord-row-humanise" value={row.humanise} onChange={(event) => change({ humanise: Number(event.target.value) })}>
          {HUMANISE_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
        </select>
      </label>
      {advanced && (
        <label>Capo
          <select id="chord-row-capo" value={row.capo} onChange={(event) => change({ capo: Number(event.target.value) })}>
            {Array.from({ length: 8 }, (_, fret) => <option key={fret} value={fret}>{fret ? `Fret ${fret}` : 'None'}</option>)}
          </select>
        </label>
      )}
      <div className="chord-row-actions">
        <button id="chord-row-apply" disabled={!layout.chords.length} onClick={() => apply(row)}>
          <Icon name="check" className="inline-icon" /> Apply
        </button>
        <button className={advanced ? 'on' : 'secondary'} aria-pressed={advanced} onClick={() => setAdvanced(!advanced)}>Advanced</button>
        {saved && (
          <button className="secondary" aria-label="Remove chord row" onClick={() => onChange(clearChordRow(project, channel.id))}>
            <Icon name="close" className="inline-icon" />
          </button>
        )}
      </div>
      {!!layout.invalid.length && <p className="chord-row-invalid" role="status">Unknown: {layout.invalid.join(' ')}</p>}
      {advanced && !!shapes.length && (
        <ul className="chord-row-shapes" aria-label="Chord shapes">
          {shapes.map(([symbol, frets]) => <li key={symbol}><strong>{symbol}</strong> {frets}</li>)}
        </ul>
      )}
    </div>
  );
}
