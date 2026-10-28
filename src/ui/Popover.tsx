import { useEffect, useRef, type ReactNode } from 'react';

const MARGIN = 8;
const MOBILE_MAX = 640;

export interface PopoverPlacement {
  left: number;
  top?: number;
  bottom?: number;
  width?: number;
  maxHeight: number;
}

/** Keeps a popover fully inside the viewport: flips above the anchor if needed, clamps horizontally, scrolls when tall, and becomes a bottom sheet on narrow screens. */
export function placePopover(
  anchor: { left: number; right: number; top: number; bottom: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): PopoverPlacement {
  if (viewport.width <= MOBILE_MAX) {
    return { left: MARGIN, width: viewport.width - MARGIN * 2, bottom: MARGIN, maxHeight: Math.round(viewport.height * 0.7) };
  }
  const width = Math.min(size.width, viewport.width - MARGIN * 2);
  const left = Math.max(MARGIN, Math.min(anchor.right - width, viewport.width - width - MARGIN));
  const below = viewport.height - anchor.bottom - MARGIN * 2;
  const above = anchor.top - MARGIN * 2;
  if (size.height <= below || below >= above) {
    return { left, top: anchor.bottom + MARGIN, maxHeight: Math.max(120, below) };
  }
  return { left, bottom: viewport.height - anchor.top + MARGIN, maxHeight: Math.max(120, above) };
}

/** Header tile: opens in the same place and style as Help; toggled by its header button, closed by Esc or an outside click. */
export function HeaderTile({ onClose, className = '', children, label }: {
  onClose: () => void;
  className?: string;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: Event) => {
      const t = e.target as Element | null;
      // Header buttons toggle their own tile, so presses there are not "outside".
      if (t && !ref.current?.contains(t) && !t.closest?.('.bar, [role="dialog"]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="group" aria-label={label} className={`panel header-tile ${className}`}>
      <div className="tutorial-heading"><h2>{label}</h2></div>
      {children}
    </div>
  );
}
