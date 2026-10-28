import { describe, expect, it } from 'vitest';
import { placePopover } from './Popover';

const anchor = { left: 640, right: 684, top: 10, bottom: 54 };

describe('placePopover', () => {
  it('clamps horizontally inside the viewport', () => {
    const p = placePopover(anchor, { width: 260, height: 200 }, { width: 700, height: 800 });
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + 260).toBeLessThanOrEqual(692);
    expect(p.top).toBe(62);
  });
  it('limits height and scrolls instead of overflowing', () => {
    const p = placePopover(anchor, { width: 260, height: 900 }, { width: 800, height: 600 });
    expect(p.maxHeight).toBeLessThanOrEqual(600 - 54);
  });
  it('becomes a bottom sheet on narrow screens', () => {
    const p = placePopover(anchor, { width: 260, height: 200 }, { width: 400, height: 800 });
    expect(p).toMatchObject({ left: 8, width: 384, bottom: 8 });
  });
});
