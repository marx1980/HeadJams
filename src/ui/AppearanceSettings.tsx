import { useEffect, useRef } from 'react';
import { THEMES, type ThemeId } from './themes';

export function AppearanceSettings({
  theme,
  onThemeChange,
  onClose,
}: {
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  onClose: () => void;
}) {
  const selected = THEMES.find((item) => item.id === theme) ?? THEMES[0];
  const selectorRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    selectorRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  return (
    <div className="settings-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="panel settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled])')];
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}>
        <div className="settings-heading">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Personalize how MusicMaker looks on this device.</p>
          </div>
          <button className="secondary" aria-label="Close settings" onClick={onClose}>✕</button>
        </div>
        <h3>Appearance</h3>
        <label htmlFor="theme-select">Visual skin
          <select id="theme-select" ref={selectorRef} value={theme} onChange={(event) => onThemeChange(event.target.value as ThemeId)}>
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
        <p className="hint">Your choice is saved on this device and does not change your projects.</p>
        <button className="settings-done" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}
