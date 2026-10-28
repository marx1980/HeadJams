import { THEMES, type ThemeId } from './themes';

export function AppearanceSettings({ theme, onThemeChange }: {
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
}) {
  const selected = THEMES.find((item) => item.id === theme) ?? THEMES[0];
  return (
    <>
      <h3>Skins</h3>
      <label htmlFor="theme-select">Visual skin
        <select id="theme-select" value={theme} onChange={(event) => onThemeChange(event.target.value as ThemeId)}>
          {THEMES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <div className="theme-preview" aria-live="polite" aria-label={`${selected.label} color preview`}>
        <span style={{ background: selected.background }} />
        <span style={{ background: selected.surface }} />
        <span style={{ background: selected.accent }} />
        <span style={{ background: selected.text }} />
        <p>{selected.label}</p>
      </div>
      <p className="hint">Saved on this device; does not change your projects.</p>
    </>
  );
}
