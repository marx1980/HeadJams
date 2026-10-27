import { useEffect, useMemo, useRef, useState } from 'react';
import type { SoundDef } from '../model/project';
import { soundLibraryGroup } from '../library/instrumentRegistry';

const FAVORITES_KEY = 'musicmaker.favoriteSounds';
const RECENT_KEY = 'musicmaker.recentSounds';
const LISTS_CHANGE_EVENT = 'musicmaker:sound-lists-change';

function readIds(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function SoundPicker({
  sounds, soundId, onPreview, onSelect,
}: {
  sounds: SoundDef[];
  soundId: string;
  onPreview: (sound: SoundDef) => void;
  onSelect: (sound: SoundDef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(readIds(FAVORITES_KEY));
  const [recent, setRecent] = useState<string[]>(readIds(RECENT_KEY));
  const closeButton = useRef<HTMLButtonElement>(null);
  const selected = sounds.find((sound) => sound.id === soundId);
  const groups = useMemo(() => [...new Set(sounds.map(soundLibraryGroup))].sort(), [sounds]);
  const matchingSounds = useMemo(() => {
    const matches = sounds.filter((sound) => {
      const matchesGroup = group === 'Favorites'
        ? favorites.includes(sound.id)
        : group === 'Recent'
          ? recent.includes(sound.id)
          : group
            ? soundLibraryGroup(sound) === group
            : true;
      const text = `${sound.name} ${sound.category} ${(sound.tags ?? []).join(' ')}`.toLowerCase();
      return matchesGroup && text.includes(query.trim().toLowerCase());
    });
    return group === 'Recent'
      ? matches.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id))
      : matches;
  }, [sounds, group, favorites, recent, query]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    const syncLists = (event: Event) => {
      const detail = (event as CustomEvent<{ favorites: string[]; recent: string[] }>).detail;
      if (!detail) return;
      setFavorites(detail.favorites);
      setRecent(detail.recent);
    };
    window.addEventListener(LISTS_CHANGE_EVENT, syncLists);
    return () => window.removeEventListener(LISTS_CHANGE_EVENT, syncLists);
  }, []);

  const notifyListsChanged = (nextFavorites: string[], nextRecent: string[]) => {
    window.dispatchEvent(new CustomEvent(LISTS_CHANGE_EVENT, {
      detail: { favorites: nextFavorites, recent: nextRecent },
    }));
  };

  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
    setFavorites(next);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    notifyListsChanged(next, recent);
  };

  const chooseSound = (sound: SoundDef) => {
    const next = [sound.id, ...recent.filter((id) => id !== sound.id)].slice(0, 10);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    notifyListsChanged(favorites, next);
    onSelect(sound);
    setOpen(false);
  };

  const title = selected?.name ?? `Missing sound (${soundId})`;

  return (
    <>
      <button className={`sound-picker-trigger${selected ? '' : ' missing'}`} aria-haspopup="dialog"
        aria-expanded={open} onClick={() => { setGroup(''); setQuery(''); setOpen(true); }}>
        {title} ▾
      </button>
      {open && (
        <div className="sound-picker-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="sound-picker panel" role="dialog" aria-modal="true" aria-label="Choose a sound">
            <div className="sound-picker-heading">
              <h2>{group || 'Sound Library'}</h2>
              <button ref={closeButton} className="secondary" aria-label="Close sound picker" onClick={() => setOpen(false)}>✕</button>
            </div>
            {group && <button className="secondary sound-picker-back" onClick={() => { setGroup(''); setQuery(''); }}>← Groups</button>}
            <label>Search sounds
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, category, or tag" />
            </label>
            {!group && !query.trim() ? (
              <div className="sound-picker-groups">
                {['Favorites', 'Recent'].map((name) => (
                  <button key={name} onClick={() => setGroup(name)}>{name}</button>
                ))}
                {groups.map((name) => (
                  <button key={name} onClick={() => setGroup(name)}>{name}</button>
                ))}
              </div>
            ) : (
              <div className="sound-picker-list">
                {matchingSounds.map((sound) => (
                  <div className={`sound-picker-item${sound.id === soundId ? ' current' : ''}`} key={sound.id}>
                    <span>
                      <strong>{sound.name}</strong>
                      <small>{soundLibraryGroup(sound)}{sound.tags?.length ? ` · ${sound.tags.join(', ')}` : ''}</small>
                    </span>
                    <div className="sound-picker-actions">
                      <button className="secondary" aria-label={`${favorites.includes(sound.id) ? 'Remove' : 'Add'} ${sound.name} ${favorites.includes(sound.id) ? 'from' : 'to'} favorites`}
                        aria-pressed={favorites.includes(sound.id)} onClick={() => toggleFavorite(sound.id)}>
                        {favorites.includes(sound.id) ? '★' : '☆'}
                      </button>
                      <button className="secondary" onClick={() => onPreview(sound)}>▶ Preview</button>
                      <button onClick={() => chooseSound(sound)}>{sound.id === soundId ? 'Selected' : 'Select'}</button>
                    </div>
                  </div>
                ))}
                {!matchingSounds.length && <p className="hint">No sounds match this group and search.</p>}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
