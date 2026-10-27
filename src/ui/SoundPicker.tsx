import { useEffect, useMemo, useState } from 'react';
import type { InstrumentDefinition } from '../library/instrumentRegistry';
import { readSoundPreferences, recordRecent, toggleFavorite, writeSoundPreferences } from '../library/soundPreferences';

const GROUPS_FIRST = ['Keys', 'Guitars', 'Strings', 'Brass & Winds', 'Synths', 'Bass', 'Drums', 'Percussion', 'FX & Other', 'Samples'];

export function SoundPicker({
  sounds, selectedSoundId, onPreview, onSelect, onClose,
}: {
  sounds: InstrumentDefinition[];
  selectedSoundId: string;
  onPreview: (sound: InstrumentDefinition) => void;
  onSelect: (sound: InstrumentDefinition) => void;
  onClose: () => void;
}) {
  const [preferences, setPreferences] = useState(readSoundPreferences);
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const availableSounds = useMemo(() => sounds.filter((sound) => sound.available), [sounds]);
  const knownIds = useMemo(() => new Set(availableSounds.map((sound) => sound.id)), [availableSounds]);
  const soundGroups = useMemo(() => {
    const present = new Set(availableSounds.map((sound) => sound.group));
    return GROUPS_FIRST.filter((name) => present.has(name as InstrumentDefinition['group']));
  }, [availableSounds]);
  const matchingSounds = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = availableSounds.filter((sound) => {
      const text = `${sound.name} ${sound.group} ${sound.subgroup} ${sound.category} ${(sound.tags ?? []).join(' ')}`.toLowerCase();
      return !normalizedQuery || text.includes(normalizedQuery);
    });
    if (normalizedQuery) return filtered;
    if (group === 'Favourites') return filtered.filter((sound) => preferences.favorites.includes(sound.id));
    if (group === 'Recent') return preferences.recent.flatMap((id) => filtered.filter((sound) => sound.id === id));
    return group ? filtered.filter((sound) => sound.group === group) : [];
  }, [availableSounds, group, preferences.favorites, preferences.recent, query]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const changePreferences = (next: ReturnType<typeof toggleFavorite>) => {
    setPreferences(next);
    writeSoundPreferences(next);
  };

  return (
    <div className="sound-picker-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="sound-picker" role="dialog" aria-modal="true" aria-labelledby="sound-picker-title">
        <header className="sound-picker-header">
          <div className="sound-picker-heading">
            {group && <button className="secondary" onClick={() => { setGroup(''); setQuery(''); }}>← Back</button>}
            <h2 id="sound-picker-title">Choose a sound</h2>
          </div>
          <button className="secondary" aria-label="Close sound picker" onClick={onClose}>Close</button>
        </header>
        {!knownIds.has(selectedSoundId) && (
          <p className="sound-picker-warning" role="status">The current sound is unavailable. Choose a replacement to continue.</p>
        )}
        <label className="sound-picker-search">Search sounds
          <input type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, category, or tag" />
        </label>
        {!group && !query.trim() ? (
          <div className="sound-picker-groups">
            {preferences.favorites.some((id) => knownIds.has(id)) && <button onClick={() => setGroup('Favourites')}>★ Favourites</button>}
            {preferences.recent.some((id) => knownIds.has(id)) && <button onClick={() => setGroup('Recent')}>◷ Recent</button>}
            {soundGroups.map((name) => <button key={name} onClick={() => setGroup(name)}>{name}</button>)}
          </div>
        ) : (
          <div className="sound-picker-results">
            {matchingSounds.map((sound) => {
              const isFavorite = preferences.favorites.includes(sound.id);
              return (
                <article className={`sound-picker-item${selectedSoundId === sound.id ? ' selected' : ''}`} key={sound.id}>
                  <div className="sound-picker-copy">
                    <strong>{sound.name}</strong>
                    <span>{sound.group} · {sound.subgroup}{sound.tags?.length ? ` · ${sound.tags.join(', ')}` : ''}</span>
                    {selectedSoundId === sound.id && <span className="sound-picker-current">Current sound</span>}
                  </div>
                  <div className="sound-picker-actions">
                    <button className="secondary" aria-label={`Preview ${sound.name}`} onClick={() => onPreview(sound)}>▶</button>
                    <button className="secondary" aria-label={`${isFavorite ? 'Remove from' : 'Add to'} favourites: ${sound.name}`}
                      aria-pressed={isFavorite} onClick={() => changePreferences(toggleFavorite(preferences, sound.id))}>★</button>
                    <button disabled={selectedSoundId === sound.id} onClick={() => {
                      changePreferences(recordRecent(preferences, sound.id));
                      onSelect(sound);
                    }}>{selectedSoundId === sound.id ? 'Selected' : 'Select'}</button>
                  </div>
                </article>
              );
            })}
            {!matchingSounds.length && <p className="hint">No available sounds match this view.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
