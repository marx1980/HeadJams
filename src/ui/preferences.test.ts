import { describe, expect, it } from 'vitest';
import { clearAppData, defaultPreferences, loadPreferences, savePreferences } from './preferences';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe('preferences', () => {
  it('falls back to defaults for missing or invalid data', () => {
    expect(loadPreferences(memoryStorage())).toEqual(defaultPreferences());
    expect(loadPreferences(memoryStorage({ 'musicmaker.preferences': '{bad' }))).toEqual(defaultPreferences());
  });
  it('round-trips saved values', () => {
    const s = memoryStorage();
    savePreferences({ reduceMotion: true, largeIcons: true, hints: false, recordingOffsetMs: 35 }, s);
    expect(loadPreferences(s)).toEqual({ reduceMotion: true, largeIcons: true, hints: false, recordingOffsetMs: 35 });
  });
  it('clamps the recording offset', () => {
    const s = memoryStorage({ 'musicmaker.preferences': JSON.stringify({ recordingOffsetMs: 9000 }) });
    expect(loadPreferences(s).recordingOffsetMs).toBe(500);
  });
  it('clears only MusicMaker keys', () => {
    const s = memoryStorage({ 'musicmaker.theme': 'x', other: 'keep' });
    clearAppData(s);
    expect(s.getItem('musicmaker.theme')).toBeNull();
    expect(s.getItem('other')).toBe('keep');
  });
});
