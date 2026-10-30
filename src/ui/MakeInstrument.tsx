import { useState } from 'react';
import type { SoundDef } from '../model/project';
import type { SampleData } from '../library/sampleStorage';
import { recognizePitch } from '../library/pitchRecognition';
import { rootFromNotes, type PersonalSample } from '../model/personalInstrument';
import { Icon } from './Icon';

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

/** Make an instrument from saved samples (expansion.md E6): pick samples, check their notes, name it. */
export function MakeInstrument({ sounds, samples, onMake }: {
  sounds: SoundDef[];
  samples: ReadonlyMap<string, SampleData>;
  onMake: (name: string, picked: PersonalSample[]) => void;
}) {
  const saved = sounds.filter((sound) => sound.sampleId && samples.has(sound.sampleId));
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  if (!saved.length) return null;

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
      <label>Name
        <input id="make-instrument-name" value={name} placeholder="My instrument" onChange={(event) => setName(event.target.value)} />
      </label>
      <button id="make-instrument" disabled={!Object.keys(picked).length}
        onClick={() => { onMake(name, Object.entries(picked).map(([sampleId, rootMidi]) => ({ sampleId, rootMidi }))); setPicked({}); setName(''); }}>
        <Icon name="add" className="inline-icon" /> Make instrument
      </button>
    </div>
  );
}
