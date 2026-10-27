import { describe, expect, it } from 'vitest';
import { readSoundPreferences, recordRecent, toggleFavorite, writeSoundPreferences } from './soundPreferences';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('sound preferences', () => {
  it('persists favorites and recent sounds, with recent order and de-duplication', () => {
    const storage = createStorage();
    let preferences = toggleFavorite(readSoundPreferences(storage), 'kick-1');
    preferences = recordRecent(preferences, 'kick-1');
    preferences = recordRecent(preferences, 'snare-1');
    preferences = recordRecent(preferences, 'kick-1');
    writeSoundPreferences(preferences, storage);
    expect(readSoundPreferences(storage)).toEqual({ favorites: ['kick-1'], recent: ['kick-1', 'snare-1'] });
  });

  it('recovers from invalid persisted data', () => {
    const storage = createStorage();
    storage.setItem('musicmaker.soundPreferences.v1', '{');
    expect(readSoundPreferences(storage)).toEqual({ favorites: [], recent: [] });
  });
});
