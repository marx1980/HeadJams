import { useState } from 'react';
import type { SynthParams, Wave } from '../model/project';
import { Icon } from './Icon';

const PRESETS: Record<string, SynthParams> = {
  Kick: { wave: 'sine', freq: 150, freqEnd: 45, decay: 0.35, cutoff: 8000 },
  Snare: { wave: 'noise', freq: 200, freqEnd: 200, decay: 0.18, cutoff: 9000 },
  Hat: { wave: 'noise', freq: 200, freqEnd: 200, decay: 0.05, cutoff: 20000 },
  Bass: { wave: 'saw', freq: 55, freqEnd: 55, decay: 0.4, cutoff: 1200 },
  Lead: { wave: 'square', freq: 440, freqEnd: 440, decay: 0.35, cutoff: 5000 },
};

export function SoundDesigner({ onPreview, onSave }: {
  onPreview: (name: string, p: SynthParams) => void;
  onSave: (name: string, p: SynthParams) => void;
}) {
  const [name, setName] = useState('My sound');
  const [p, setP] = useState<SynthParams>(PRESETS.Kick);
  const set = <K extends keyof SynthParams>(k: K, v: SynthParams[K]) => setP({ ...p, [k]: v });
  const slider = (label: string, k: 'freq' | 'freqEnd' | 'decay' | 'cutoff', min: number, max: number, step: number) => (
    <label>{label}: {p[k]}
      <input type="range" min={min} max={max} step={step} value={p[k]} onChange={(e) => set(k, Number(e.target.value))} />
    </label>
  );
  return (
    <div className="panel designer">
      <h2>Make a sound</h2>
      <div className="row">
        {Object.entries(PRESETS).map(([n, preset]) => (
          <button key={n} className="secondary" onClick={() => { setP(preset); setName(`My ${n.toLowerCase()}`); }}>{n}</button>
        ))}
      </div>
      <label>Name <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label>
      <label>Wave
        <select value={p.wave} onChange={(e) => set('wave', e.target.value as Wave)}>
          {['sine', 'square', 'saw', 'triangle', 'noise'].map((w) => <option key={w}>{w}</option>)}
        </select>
      </label>
      {slider('Pitch start (Hz)', 'freq', 30, 2000, 1)}
      {slider('Pitch end (Hz)', 'freqEnd', 30, 2000, 1)}
      {slider('Length (s)', 'decay', 0.03, 1, 0.01)}
      {slider('Brightness (Hz)', 'cutoff', 200, 20000, 100)}
      <div className="row">
        <button onClick={() => onPreview(name, p)}><Icon name="audio" className="inline-icon" /> Preview</button>
        <button onClick={() => onSave(name, p)}>Save to my library</button>
      </div>
    </div>
  );
}
