import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

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

export function Popover({ onClose, className = '', children, label }: {
  onClose: () => void;
  className?: string;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    const el = ref.current;
    const anchor = el?.parentElement;
    if (!el || !anchor) return;
    const update = () => {
      const viewport = window.visualViewport;
      const p = placePopover(anchor.getBoundingClientRect(), { width: el.offsetWidth, height: el.scrollHeight },
        { width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight });
      setStyle({ left: p.left, top: p.top, bottom: p.bottom, width: p.width, maxHeight: p.maxHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const anchor = ref.current?.parentElement;
    const onDown = (e: Event) => { if (anchor && !anchor.contains(e.target as Node)) onClose(); };
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

  return <div ref={ref} role="group" aria-label={label} className={`panel menu-popup ${className}`} style={style}>{children}</div>;
}
