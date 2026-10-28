import type { ReactNode } from 'react';

export type IconName =
  | 'beat' | 'sound' | 'library' | 'song'
  | 'drums' | 'percussion' | 'keys' | 'strings' | 'guitar' | 'bass'
  | 'file' | 'share' | 'view' | 'settings' | 'help'
  | 'brass' | 'synth' | 'fx' | 'sample' | 'custom' | 'favorite' | 'recent'
  | 'play' | 'stop' | 'audio' | 'piano' | 'grid' | 'duplicate' | 'close' | 'add'
  | 'search' | 'warning' | 'clock' | 'back' | 'record' | 'sparkle' | 'check' | 'step'
  | 'chevron' | 'transpose-up' | 'bend' | 'forward';

const paths: Record<IconName, ReactNode> = {
  chevron: <path d="m6 9 6 6 6-6" />,
  forward: <path d="m10 5 7 7-7 7m7-7H4" />,
  'transpose-up': <><path d="M12 19V5m-6 6 6-6 6 6" /><path d="M4 21h16" /></>,
  bend: <><path d="M4 18h5a3 3 0 0 0 3-3v-3a3 3 0 0 1 3-3h5" /><path d="m16 6 4 3-4 3" /></>,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
  audio: <><path d="M4 10v4h3l5 4V6l-5 4H4Z" /><path d="M16 9a5 5 0 0 1 0 6m2-9a9 9 0 0 1 0 12" /></>,
  piano: <><rect x="2.5" y="5" width="19" height="14" rx="1.2" /><path d="M7 5v9m5-9v9m5-9v9M7 14v5m5-5v5m5-5v5M4.5 5v5H7V5Zm5 0v5H12V5Zm10 0v5H17V5Z" fill="currentColor" /></>,
  grid: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18m6-18v18M3 9h18m-18 6h18" /></>,
  duplicate: <><rect x="8" y="3" width="12" height="14" rx="1.5" /><path d="M16 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  add: <path d="M12 5v14m-7-7h14" />,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
  warning: <><path d="M12 3 22 20H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  back: <path d="m14 5-7 7 7 7m-7-7h13" />,
  record: <><circle cx="12" cy="12" r="8" fill="currentColor" /><circle cx="12" cy="12" r="10" /></>,
  sparkle: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 9" /></>,
  step: <><path d="m5 3 14 9-6 1.5L10.5 20 5 3Z" /><path d="m13 14 4 5" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6m-6 4h6" /></>,
  share: <><path d="M12 15V3m0 0L8 7m4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></>,
  view: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3m0 13v3M2.5 12h3m13 0h3M5.3 5.3l2.1 2.1m9.2 9.2 2.1 2.1m0-13.4-2.1 2.1M7.4 16.6l-2.1 2.1" /><circle cx="12" cy="12" r="6.5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01" /></>,
  beat: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v11c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 11c0 1.7 3.6 3 8 3s8-1.3 8-3" /><path d="m8 4 2-2m6 2-2-2" /></>,
  sound: <><path d="M5 4v16M12 4v16M19 4v16" /><path d="M3 9h4m3 7h4m3-8h4" /></>,
  library: <><path d="M4 5h4v15H4zM10 4h4v16h-4zM16 6h4v14h-4z" /><path d="M5.5 8h1m5-1h1m5 2h1" /></>,
  song: <><path d="M4 18V8l16-4v10" /><path d="M4 8l16-4M4 18c0 1.1 1.3 2 3 2s3-.9 3-2-1.3-2-3-2-3 .9-3 2Zm10-4c0 1.1 1.3 2 3 2s3-.9 3-2-1.3-2-3-2-3 .9-3 2Z" /></>,
  drums: <><ellipse cx="10" cy="15.5" rx="6.5" ry="5.5" /><ellipse cx="10" cy="15.5" rx="4.3" ry="3.6" /><path d="M16.5 15.5v2.2c0 1.8-2.9 3.3-6.5 3.3M5.5 11.1V8.2c0-.9 2-1.7 4.5-1.7s4.5.8 4.5 1.7v3.2m-9 0c0 .9 2 1.7 4.5 1.7 1.2 0 2.3-.2 3.1-.6M5.5 8.2c0 .9 2 1.7 4.5 1.7 1.9 0 3.5-.5 4.2-1.1M7 10v1.1m6-1.1v1.1m-8 7.4-.8 1.3m10.4-1.3.8 1.3M17 6.5l4-1.5-1.5 4-2.5-2.5Zm1.2 2.2-3.1 3.1m-1.1-.8 1.3-1.3m-.5 2.6 1.3-1.3" /></>,
  percussion: <><g transform="rotate(-30 7.5 9)"><ellipse cx="7.5" cy="7.5" rx="3.4" ry="4.5" /><path d="m6 11 4.1 8m-5.2-11 .2.1m2.8-2 .2.1m1.3 3.2.2.1" /></g><g transform="rotate(30 16.5 9)"><ellipse cx="16.5" cy="7.5" rx="3.4" ry="4.5" /><path d="m18 11-4.1 8m2.4-9.9.2.1m1.4-3 .2.1m1.7 3.8.2.1" /></g></>,
  keys: <><rect x="2.5" y="5" width="19" height="14" rx="1.2" /><path d="M6.3 5v9m3.8-9v9m3.8-9v9m3.8-9v9M6.3 14v5m3.8-5v5m3.8-5v5m3.8-5v5" /><path d="M4.4 5v5h2.1V5Zm3.8 0v5h2.1V5Zm7.6 0v5h2.1V5Zm3.8 0v5h2.1V5Z" fill="currentColor" strokeLinejoin="round" /></>,
  strings: <><g transform="translate(-2.5 0) rotate(-25 12 12)"><path d="M12 7.5c2.2 0 3.3 1.2 3.3 2.8 0 1.2-.9 1.6-.9 2.4s1.2 1.3 1.2 3.1c0 2.3-1.8 3.7-3.6 3.7s-3.6-1.4-3.6-3.7c0-1.8 1.2-2.3 1.2-3.1s-.9-1.2-.9-2.4c0-1.6 1.1-2.8 3.3-2.8Z" /><path d="M12 7.5V3" /><circle cx="12" cy="2.3" r="1.2" /><path d="M10.2 12.2c-.3 1-.3 2 0 3m3.6-3c.3 1 .3 2 0 3M10.8 17.2h2.4M12 17.8v2.4" /></g><path d="M16.5 21.5 21 3.5M16 20.4l1.9.5" /></>,
  guitar: <><g transform="rotate(38 12 12)"><path d="M12 9c2 0 3.2 1 3.2 2.6 0 1.4-1 1.9-1 2.9 0 .9 1.8 1.5 1.8 3.7 0 2-2.2 3.3-4 3.3s-4-1.3-4-3.3c0-2.2 1.8-2.8 1.8-3.7 0-1-1-1.5-1-2.9C8.8 10 10 9 12 9Z" /><circle cx="12" cy="15.6" r="1.7" /><path d="M10 19.6h4M11 9V4m2 5V4M11 6h2M11 8h2" /><rect x="10.4" y="0.8" width="3.2" height="3.2" rx=".7" /></g></>,
  bass: <><g transform="rotate(-40 12 12)"><path d="M8.2 14.6c.2-1.6 1.2-2.4 2.6-2.6h2.4c1.4.2 2.4 1 2.6 2.6.1 1-.6 1.5-.6 2.4 0 .9 1.2 1.6 1.2 2.9 0 1.6-2 2.6-4.4 2.6S7.6 21.5 7.6 19.9c0-1.3 1.2-2 1.2-2.9 0-.9-.7-1.4-.6-2.4Z" /><path d="M9.8 16.2h4.4m-4.4 2.3h4.4M10.6 21h2.8" /><path d="M11.4 12V4.5m1.2 7.5V4.5M11.4 7h1.2m-1.2 2.5h1.2" /><path d="M10.4 1h3.2v3.5h-3.2zM9 2h1.4M9 3.5h1.4M13.6 2H15M13.6 3.5H15" /></g></>,
  brass: <><path d="M2.5 10h3l1.5 1h8l4-4v10l-4-4H7l-1.5 1h-3m3-4v4m12-5 3.5-2.5v11L19 15m-9-3v2m3-2v2m-3 0v2m3-2v2M5.5 10v4" /><circle cx="10" cy="9.4" r=".7" /><circle cx="13" cy="9.4" r=".7" /></>,
  synth: <><rect x="2.5" y="4" width="19" height="16" rx="1.5" /><path d="M4.5 13.5h15M6 17v3m3-3v3m3-3v3m3-3v3m3-3v3" /><circle cx="6.5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" /><circle cx="15.5" cy="8" r="1.3" /><path d="M19 6.5v3m-7.5 2V9.5m-4 2V10m8 2V10" /><path d="M5 15.5h.01m3 0h.01m3 0h.01m3 0h.01m3 0h.01" /></>,
  fx: <><path d="m12 2.5 1.6 5.9 5.9 1.6-5.9 1.6-1.6 5.9-1.6-5.9-5.9-1.6 5.9-1.6L12 2.5Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15ZM4 2.5l.6 1.9 1.9.6-1.9.6L4 7.5l-.6-1.9-1.9-.6 1.9-.6L4 2.5ZM19 3v3m-1.5-1.5h3M4 15v4m-2-2h4" /></>,
  sample: <><rect x="8" y="3" width="8" height="13" rx="4" /><path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-4 0h8" /></>,
  custom: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="7" cy="18" r="2" /></>,
  favorite: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  recent: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
