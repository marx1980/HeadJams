export interface Preferences { reduceMotion: boolean; largeIcons: boolean; hints: boolean }

export const PREFERENCES_KEY = 'musicmaker.preferences';
export const MIDI_INPUT_KEY = 'musicmaker.midiInput';

export function defaultPreferences(): Preferences {
  return { reduceMotion: false, largeIcons: false, hints: true };
}

export function loadPreferences(storage: Pick<Storage, 'getItem'> = globalThis.localStorage): Preferences {
  const base = defaultPreferences();
  try {
    const raw = JSON.parse(storage.getItem(PREFERENCES_KEY) ?? 'null') as Partial<Preferences> | null;
    if (!raw || typeof raw !== 'object') return base;
    return {
      reduceMotion: raw.reduceMotion === true,
      largeIcons: raw.largeIcons === true,
      hints: raw.hints !== false,
    };
  } catch {
    return base;
  }
}

export function savePreferences(value: Preferences, storage: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  try { storage.setItem(PREFERENCES_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** Removes every `musicmaker.*` localStorage entry (projects, skin, tutorial progress, preferences). */
export function clearAppData(storage: Storage = globalThis.localStorage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith('musicmaker.')) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}
