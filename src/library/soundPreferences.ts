const STORAGE_KEY = 'musicmaker.soundPreferences.v1';
const MAX_RECENT = 20;

export interface SoundPreferences {
  favorites: string[];
  recent: string[];
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function storageOrUndefined(): PreferenceStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readSoundPreferences(storage = storageOrUndefined()): SoundPreferences {
  if (!storage) return { favorites: [], recent: [] };
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}') as Partial<SoundPreferences>;
    return {
      favorites: Array.isArray(value.favorites) ? [...new Set(value.favorites.filter((id) => typeof id === 'string'))] : [],
      recent: Array.isArray(value.recent) ? [...new Set(value.recent.filter((id) => typeof id === 'string'))].slice(0, MAX_RECENT) : [],
    };
  } catch {
    return { favorites: [], recent: [] };
  }
}

export function writeSoundPreferences(preferences: SoundPreferences, storage = storageOrUndefined()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({
      favorites: [...new Set(preferences.favorites)],
      recent: [...new Set(preferences.recent)].slice(0, MAX_RECENT),
    }));
  } catch {
    // Preferences are optional when browser storage is unavailable.
  }
}

export function toggleFavorite(preferences: SoundPreferences, soundId: string): SoundPreferences {
  return {
    ...preferences,
    favorites: preferences.favorites.includes(soundId)
      ? preferences.favorites.filter((id) => id !== soundId)
      : [...preferences.favorites, soundId],
  };
}

export function recordRecent(preferences: SoundPreferences, soundId: string): SoundPreferences {
  return { ...preferences, recent: [soundId, ...preferences.recent.filter((id) => id !== soundId)].slice(0, MAX_RECENT) };
}
