import { useMemo, useState } from 'react';
import type { SoundDef } from '../model/project';

type Props = {
  sounds: SoundDef[];
  onPreview: (sound: SoundDef) => void;
  onAdd: (sound: SoundDef) => void;
};

export function SoundLibrary({ sounds, onPreview, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('All');
  const [view, setView] = useState<'library' | 'pads'>('library');
  const tags = useMemo(() => [...new Set(sounds.flatMap((sound) => sound.tags ?? [sound.category.toLowerCase()]))].sort(), [sounds]);
  const filtered = sounds.filter((sound) => {
    const terms = [sound.name, sound.category, ...(sound.tags ?? [])].join(' ').toLowerCase();
    return terms.includes(query.trim().toLowerCase()) && (tag === 'All' || (sound.tags ?? [sound.category.toLowerCase()]).includes(tag));
  });

  return (
    <section className="panel sound-library" aria-label="Sound library">
      <div className="library-heading">
        <h2>Sound library</h2>
        <div className="row">
          <button aria-pressed={view === 'library'} onClick={() => setView('library')}>Browse</button>
          <button aria-pressed={view === 'pads'} onClick={() => setView('pads')}>Pad view</button>
        </div>
      </div>
      {view === 'library' && (
        <div className="row">
          <label>Search sounds
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, category, or tag" />
          </label>
          <label>Tag
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option>All</option>
              {tags.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      )}
      <div className={view === 'pads' ? 'pad-grid' : 'library-list'}>
        {filtered.map((sound) => (
          <div className={view === 'pads' ? 'pad' : 'library-item'} key={sound.id}>
            <button className={view === 'pads' ? 'pad-trigger' : 'secondary'} onClick={() => onPreview(sound)}>
              {sound.name}
            </button>
            {view === 'library' && <span>{sound.category} · {(sound.tags ?? []).join(', ')}</span>}
            {view === 'library' && <button onClick={() => onAdd(sound)}>＋ Add channel</button>}
          </div>
        ))}
        {filtered.length === 0 && <p className="hint">No sounds match those filters.</p>}
      </div>
    </section>
  );
}
