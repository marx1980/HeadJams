// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppearanceSettings } from './AppearanceSettings';
import type { ThemeId } from './themes';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AppearanceSettings', () => {
  let root: Root | undefined;
  const container = document.createElement('div');

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    container.replaceChildren();
    vi.restoreAllMocks();
  });

  it('lists all skins, previews the current selection, and reports changes', () => {
    const onThemeChange = vi.fn<(theme: ThemeId) => void>();
    document.body.append(container);
    act(() => {
      root = createRoot(container);
      root.render(createElement(AppearanceSettings, {
        theme: 'midnight-studio', onThemeChange, onClose: () => undefined,
      }));
    });

    const selector = container.querySelector<HTMLSelectElement>('#theme-select');
    expect(selector?.options).toHaveLength(8);
    expect(container.querySelector('.theme-preview')?.textContent).toContain('Midnight Studio');
    if (!selector) throw new Error('Skin selector is missing');
    act(() => {
      selector.value = 'ocean-light';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onThemeChange).toHaveBeenCalledWith('ocean-light');
  });
});
