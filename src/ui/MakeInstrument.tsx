import { useState } from 'react';
import type { SoundDef } from '../model/project';
import type { SampleData } from '../library/sampleStorage';
import { recognizePitch } from '../library/pitchRecognition';
import { rootFromNotes, type PersonalSample, type RecordedChord } from '../model/personalInstrument';
import { parseChordSymbol } from '../model/music';
import { Icon } from './Icon';

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

/** Make an instrument from saved samples (expansion.md E6): pick samples, check their notes, name it. */
export function MakeInstrument({ sounds, samples, onMake, onMakeChords }: {
  sounds: SoundDef[];
  samples: ReadonlyMap<string, SampleData>;
  onMake: (name: string, picked: PersonalSample[]) => void;
  /** Recorded chords (expansion.md E7): whole-chord samples, with a factory guitar for the rest. */
  onMakeChords: (name: string, chords: RecordedChord[], fallback: string) => void;
}) {
  const saved = sounds.filter((sound) => sound.sampleId && samples.has(sound.sampleId));
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'notes' | 'chords'>('notes');
  const [chordText, setChordText] = useState<Record<string, { symbol: string; direction: 'down' | 'up' }>>({});
  const [fallback, setFallback] = useState('nylon-guitar');
  if (!saved.length) return null;

  const toggleChord = (sampleId: string, sound: SoundDef) => {
    if (sampleId in chordText) {
      const { [sampleId]: _removed, ...rest } = chordText;
      setChordText(rest);
      return;
    }
    // Start from the sample's name when it reads as a chord ("Am down", "G").
    const [first, second] = sound.name.trim().split(/\s+/);
    setChordText({ ...chordText, [sampleId]: { symbol: parseChordSymbol(first ?? '') ? first : '', direction: /up/i.test(second ?? '') ? 'up' : 'down' } });
  };
  const chords: RecordedChord[] = Object.entries(chordText).flatMap(([sampleId, entry]) => {
    const parsed = parseChordSymbol(entry.symbol);
    return parsed ? [{ sampleId, root: parsed.root % 12, quality: parsed.quality, direction: entry.direction }] : [];
  });
  const toggle = (sampleId: string) => {
    if (sampleId in picked) {
      const { [sampleId]: _removed, ...rest } = picked;
      setPicked(rest);
      return;
    }
    const sample = samples.get(sampleId)!;
    const detected = sample.detectedPitch !== undefined && Number.isFinite(sample.detectedPitch)
      ? Math.round(sample.detectedPitch)
      : rootFromNotes(recognizePitch(sample.originalSamples ?? sample.samples, sample.sampleRate, 'melody'))
        ?? rootFromNotes(recognizePitch(sample.originalSamples ?? sample.samples, sample.sampleRate, 'bass'))
        ?? 60;
    setPicked({ ...picked, [sampleId]: Math.max(24, Math.min(96, detected)) });
  };

  return (
    <div className="make-instrument" aria-label="Make an instrument">
      <strong>Make an instrument</strong>
      <div className="make-instrument-kind" role="group" aria-label="Kind">
        <button className={kind === 'notes' ? 'on' : 'secondary'} aria-pressed={kind === 'notes'} onClick={() => setKind('notes')}>Notes</button>
        <button className={kind === 'chords' ? 'on' : 'secondary'} aria-pressed={kind === 'chords'} onClick={() => setKind('chords')}>Chords</button>
      </div>
      {kind === 'chords' ? (
        <ul className="make-instrument-samples chords">
          {saved.map((sound) => {
            const id = sound.sampleId!;
            const entry = chordText[id];
            return (
              <li key={sound.id}>
                <label className="check-label"><input type="checkbox" checked={Boolean(entry)} onChange={() => toggleChord(id, sound)} /> {sound.name}</label>
                {entry && (
                  <>
                    <input aria-label={`Chord of ${sound.name}`} value={entry.symbol} placeholder="Am" spellCheck={false}
                      className={entry.symbol && !parseChordSymbol(entry.symbol) ? 'invalid' : ''}
                      onChange={(event) => setChordText({ ...chordText, [id]: { ...entry, symbol: event.target.value } })} />
                    <select aria-label={`Strum of ${sound.name}`} value={entry.direction}
                      onChange={(event) => setChordText({ ...chordText, [id]: { ...entry, direction: event.target.value as 'down' | 'up' } })}>
                      <option value="down">Down</option>
                      <option value="up">Up</option>
                    </select>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
      <ul className="make-instrument-samples">
        {saved.map((sound) => {
          const id = sound.sampleId!;
          const on = id in picked;
          return (
            <li key={sound.id}>
              <label className="check-label"><input type="checkbox" checked={on} onChange={() => toggle(id)} /> {sound.name}</label>
              {on && (
                <select aria-label={`Note of ${sound.name}`} value={picked[id]} onChange={(event) => setPicked({ ...picked, [id]: Number(event.target.value) })}>
                  {Array.from({ length: 73 }, (_, i) => 24 + i).map((midi) => <option key={midi} value={midi}>{noteName(midi)}</option>)}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      )}
      {kind === 'chords' && (
        <label>Other chords
          <select id="make-chords-fallback" value={fallback} onChange={(event) => setFallback(event.target.value)}>
            <option value="nylon-guitar">Nylon Guitar</option>
            <option value="clean-guitar">Clean Electric Guitar</option>
          </select>
        </label>
      )}
      <label>Name
        <input id="make-instrument-name" value={name} placeholder="My instrument" onChange={(event) => setName(event.target.value)} />
      </label>
      <button id="make-instrument" disabled={kind === 'chords' ? !chords.length : !Object.keys(picked).length}
        onClick={() => {
          if (kind === 'chords') { onMakeChords(name, chords, fallback); setChordText({}); }
          else { onMake(name, Object.entries(picked).map(([sampleId, rootMidi]) => ({ sampleId, rootMidi }))); setPicked({}); }
          setName('');
        }}>
        <Icon name="add" className="inline-icon" /> Make instrument
      </button>
    </div>
  );
}
