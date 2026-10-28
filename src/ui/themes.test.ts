import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, isThemeId, loadTheme, saveTheme, THEMES, THEME_STORAGE_KEY } from './themes';

describe('appearance themes', () => {
  it('uses Midnight Studio when no theme has been saved', () => {
    expect(loadTheme({ getItem: () => null })).toBe(DEFAULT_THEME);
  });

  it('loads a saved theme and falls back for unknown values', () => {
    expect(loadTheme({ getItem: () => 'ocean-light' })).toBe('ocean-light');
    expect(loadTheme({ getItem: () => 'unknown-skin' })).toBe(DEFAULT_THEME);
  });

  it('recognizes exactly the supported theme IDs', () => {
    expect(THEMES).toHaveLength(8);
    expect(isThemeId('paper-and-ink')).toBe(true);
    expect(isThemeId('unknown-skin')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it('stores the preference independently under its own key', () => {
    const entries = new Map<string, string>();
    saveTheme('vintage-amber', { setItem: (key, value) => entries.set(key, value) });
    expect(entries.get(THEME_STORAGE_KEY)).toBe('vintage-amber');
  });

  it('falls back safely when browser storage is unavailable', () => {
    expect(loadTheme({ getItem: () => { throw new Error('unavailable'); } })).toBe(DEFAULT_THEME);
    expect(() => saveTheme('midnight-studio', { setItem: () => { throw new Error('unavailable'); } })).not.toThrow();
  });
});
