import { useEffect, useMemo, useRef, useState } from 'react';
import type { SoundDef } from '../model/project';
import { soundLibraryGroup } from '../library/instrumentRegistry';
import { Icon, type IconName } from './Icon';

const FAVORITES_KEY = 'musicmaker.favoriteSounds';
const RECENT_KEY = 'musicmaker.recentSounds';
const LISTS_CHANGE_EVENT = 'musicmaker:sound-lists-change';
const FAMILIES: Record<string, { icon: IconName; className: string }> = {
  Drums: { icon: 'drums', className: 'drums' },
  Percussion: { icon: 'percussion', className: 'percussion' },
  Keys: { icon: 'keys', className: 'keys' },
  Strings: { icon: 'strings', className: 'strings' },
  Guitars: { icon: 'guitar', className: 'guitars' },
  Bass: { icon: 'bass', className: 'bass' },
  'Brass & Winds': { icon: 'brass', className: 'brass' },
  Synths: { icon: 'synth', className: 'synths' },
  'FX & Other': { icon: 'fx', className: 'fx' },
  Samples: { icon: 'sample', className: 'samples' },
  Mine: { icon: 'custom', className: 'custom' },
};

function familyInfo(name: string) {
  return FAMILIES[name] ?? { icon: 'sound', className: 'other' };
}

function readIds(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : [];
  } catch {
    return [];
  }
}

export function SoundPicker({
  sounds, soundId, unavailableSoundIds = new Set(), loadingSoundIds = new Set(), onPreview, onSelect,
}: {
  sounds: SoundDef[];
  soundId: string;
  unavailableSoundIds?: ReadonlySet<string>;
  loadingSoundIds?: ReadonlySet<string>;
  onPreview: (sound: SoundDef) => void;
  onSelect: (sound: SoundDef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState('');
  const [subgroup, setSubgroup] = useState('');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(readIds(FAVORITES_KEY));
  const [recent, setRecent] = useState<string[]>(readIds(RECENT_KEY).slice(0, 10));
  const closeButton = useRef<HTMLButtonElement>(null);
  const selected = sounds.find((sound) => sound.id === soundId);
  const groups = useMemo(() => [...new Set(sounds.map(soundLibraryGroup))].sort(), [sounds]);
  const subgroups = useMemo(() => [...new Set(sounds
    .filter((sound) => soundLibraryGroup(sound) === group)
    .map((sound) => sound.subcategory)
    .filter((value): value is string => Boolean(value)))].sort(), [sounds, group]);
  const matchingSounds = useMemo(() => {
    const matches = sounds.filter((sound) => {
      const matchesGroup = group === 'Favorites'
        ? favorites.includes(sound.id)
        : group === 'Recent'
          ? recent.includes(sound.id)
          : group
            ? soundLibraryGroup(sound) === group
            : true;
      const matchesSubgroup = !subgroup || sound.subcategory === subgroup;
      const text = `${sound.name} ${sound.category} ${sound.subcategory ?? ''} ${(sound.tags ?? []).join(' ')}`.toLowerCase();
      return matchesGroup && matchesSubgroup && text.includes(query.trim().toLowerCase());
    });
    return group === 'Recent'
      ? matches.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id))
      : matches;
  }, [sounds, group, subgroup, favorites, recent, query]);
  const selectedUnavailable = !selected || unavailableSoundIds.has(soundId);

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

  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key === FAVORITES_KEY) setFavorites(readIds(FAVORITES_KEY));
      if (event.key === RECENT_KEY) setRecent(readIds(RECENT_KEY).slice(0, 10));
    };
    window.addEventListener('storage', syncStorage);
    return () => window.removeEventListener('storage', syncStorage);
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

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const dialog = event.currentTarget;
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !(event.target instanceof HTMLButtonElement)) return;
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
      .filter((button) => button.getClientRects().length > 0);
    const index = buttons.indexOf(event.target);
    if (index < 0 || !buttons.length) return;
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[next].focus();
  };

  const title = selected?.name ?? `Missing sound (${soundId})`;
  const selectedFamily = selected ? familyInfo(soundLibraryGroup(selected)) : undefined;

  return (
    <>
      <button className={`sound-picker-trigger${selectedUnavailable ? ' missing' : ''}`} aria-haspopup="dialog"
        aria-expanded={open} aria-invalid={selectedUnavailable}
        aria-label={selectedUnavailable ? `${title} is unavailable. Choose a replacement sound.` : `Choose sound, current sound ${title}`}
        onClick={() => { setGroup(''); setSubgroup(''); setQuery(''); setOpen(true); }}>
        {selectedUnavailable ? <Icon name="warning" className="inline-icon" /> : selectedFamily ? <Icon name={selectedFamily.icon} className={`family-icon family-${selectedFamily.className}`} /> : null}
        {selectedUnavailable ? `${title} · Replace` : <>{title} <Icon name="chevron" className="inline-icon" /></>}
      </button>
      {open && (
        <div className="sound-picker-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="sound-picker panel" role="dialog" aria-modal="true" aria-label="Choose a sound" onKeyDown={onDialogKeyDown}>
            <div className="sound-picker-heading">
              <h2>{[group, subgroup].filter(Boolean).join(' · ') || 'Sound Library'}</h2>
              <button ref={closeButton} className="secondary" aria-label="Close sound picker" onClick={() => setOpen(false)}><Icon name="close" className="inline-icon" /></button>
            </div>
            {loadingSoundIds.size > 0 && (
              <p className="picker-status" role="status">Loading sample audio… Sounds will be available as soon as they finish loading.</p>
            )}
            {selectedUnavailable && (
              <p className="error" role="status">
                {selected ? `${title} is unavailable because its sample is missing.` : `${title} is no longer in the library.`}
                {' Choose another sound to replace it.'}
              </p>
            )}
            {group && <button className="secondary sound-picker-back" onClick={() => {
              if (subgroup) setSubgroup('');
              else setGroup('');
              setQuery('');
            }}><Icon name="back" className="inline-icon" /> {subgroup ? group : 'Groups'}</button>}
            <label>Search sounds
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, category, or tag" />
            </label>
            {!group && !query.trim() ? (
              <div className="sound-picker-groups">
                {['Favorites', 'Recent'].map((name) => (
                  <button key={name} onClick={() => { setGroup(name); setSubgroup(''); }}>
                    <Icon name={name === 'Favorites' ? 'favorite' : 'recent'} className="family-icon" />{name}
                  </button>
                ))}
                {groups.map((name) => (
                  <button key={name} className={`family-${familyInfo(name).className}`}
                    onClick={() => { setGroup(name); setSubgroup(''); }}>
                    <Icon name={familyInfo(name).icon} className={`family-icon family-${familyInfo(name).className}`} />{name}
                  </button>
                ))}
              </div>
            ) : group && !subgroup && subgroups.length > 0 && !query.trim() ? (
              <div className="sound-picker-groups">
                {subgroups.map((name) => (
                  <button key={name} onClick={() => setSubgroup(name)}>{name}</button>
                ))}
              </div>
            ) : (
              <div className="sound-picker-list">
                {matchingSounds.map((sound) => (
                  <div className={`sound-picker-item family-${familyInfo(soundLibraryGroup(sound)).className}${sound.id === soundId ? ' current' : ''}${unavailableSoundIds.has(sound.id) ? ' missing' : ''}${loadingSoundIds.has(sound.id) ? ' loading' : ''}`} key={sound.id}>
                    <span>
                      <strong><Icon name={familyInfo(soundLibraryGroup(sound)).icon} className={`family-icon family-${familyInfo(soundLibraryGroup(sound)).className}`} /> {sound.name}</strong>
                      <small>
                        {loadingSoundIds.has(sound.id) ? 'Loading sample… · ' : unavailableSoundIds.has(sound.id) ? 'Sample unavailable · ' : ''}
                        {[soundLibraryGroup(sound), sound.subcategory, ...(sound.tags ?? [])].filter(Boolean).join(' · ')}
                        {sound.assetAttribution ? ` · ${sound.assetAttribution}` : ''}
                      </small>
                    </span>
                    <div className="sound-picker-actions">
                      <button className="secondary" aria-label={`${favorites.includes(sound.id) ? 'Remove' : 'Add'} ${sound.name} ${favorites.includes(sound.id) ? 'from' : 'to'} favorites`}
                        aria-pressed={favorites.includes(sound.id)} onClick={() => toggleFavorite(sound.id)}>
                        <Icon name="favorite" className={`inline-icon${favorites.includes(sound.id) ? ' is-favorite' : ''}`} />
                      </button>
                      <button className="secondary" disabled={unavailableSoundIds.has(sound.id) || loadingSoundIds.has(sound.id)} onClick={() => onPreview(sound)}><Icon name="play" className="inline-icon" /> Preview</button>
                      <button disabled={unavailableSoundIds.has(sound.id) || loadingSoundIds.has(sound.id)} onClick={() => chooseSound(sound)}>{sound.id === soundId ? 'Selected' : 'Select'}</button>
                    </div>
                  </div>
                ))}
                {!matchingSounds.length && (
                  <p className="picker-empty" role="status">
                    {group === 'Favorites' && !query.trim() ? <><Icon name="favorite" className="inline-icon" /> No favorites yet. Add sounds with the favorite button.</> :
                      group === 'Recent' && !query.trim() ? <><Icon name="clock" className="inline-icon" /> No recent sounds yet. Selected sounds will appear here.</> :
                        <><Icon name="search" className="inline-icon" /> No sounds match this search. Try another name, category, or tag.</>}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
