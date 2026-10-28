export const THEMES = [
  { id: 'midnight-studio', label: 'Midnight Studio', background: '#0f1420', surface: '#151c2c', accent: '#2ee6a6', text: '#e8ecf4' },
  { id: 'paper-and-ink', label: 'Paper & Ink', background: '#f6f1e7', surface: '#fffaf0', accent: '#5b5bd6', text: '#2a2438' },
  { id: 'neon-pulse', label: 'Neon Pulse', background: '#07060d', surface: '#120f22', accent: '#39f5d0', text: '#f4f0ff' },
  { id: 'forest-studio', label: 'Forest Studio', background: '#101a16', surface: '#1b2921', accent: '#8bd49c', text: '#edf5ee' },
  { id: 'ocean-light', label: 'Ocean Light', background: '#eaf5f8', surface: '#f8fdff', accent: '#087e9b', text: '#12313b' },
  { id: 'high-contrast', label: 'High Contrast', background: '#000000', surface: '#111111', accent: '#ffe600', text: '#ffffff' },
  { id: 'candy-pop', label: 'Candy Pop', background: '#fff0f5', surface: '#fffaff', accent: '#d52f83', text: '#35172b' },
  { id: 'vintage-amber', label: 'Vintage Amber', background: '#1d1710', surface: '#2a2117', accent: '#f0b44d', text: '#f5ead7' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'midnight-studio';
export const THEME_STORAGE_KEY = 'musicmaker.theme';

export function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function loadTheme(storage?: Pick<Storage, 'getItem'>): ThemeId {
  try {
    const saved = (storage ?? globalThis.localStorage).getItem(THEME_STORAGE_KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: ThemeId, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? globalThis.localStorage).setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Appearance remains usable for this session when storage is unavailable.
  }
}
