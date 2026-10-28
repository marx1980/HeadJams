import type { ReactNode } from 'react';

export type IconName =
  | 'beat' | 'sound' | 'library' | 'song'
  | 'drums' | 'percussion' | 'keys' | 'strings' | 'guitar' | 'bass'
  | 'file' | 'share' | 'view' | 'settings' | 'help'
  | 'brass' | 'synth' | 'fx' | 'sample' | 'custom' | 'favorite' | 'recent';

const paths: Record<IconName, ReactNode> = {
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6m-6 4h6" /></>,
  share: <><path d="M12 15V3m0 0L8 7m4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></>,
  view: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3m0 13v3M2.5 12h3m13 0h3M5.3 5.3l2.1 2.1m9.2 9.2 2.1 2.1m0-13.4-2.1 2.1M7.4 16.6l-2.1 2.1" /><circle cx="12" cy="12" r="6.5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01" /></>,
  beat: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v11c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 11c0 1.7 3.6 3 8 3s8-1.3 8-3" /><path d="m8 4 2-2m6 2-2-2" /></>,
  sound: <><path d="M5 4v16M12 4v16M19 4v16" /><path d="M3 9h4m3 7h4m3-8h4" /></>,
  library: <><path d="M4 5h4v15H4zM10 4h4v16h-4zM16 6h4v14h-4z" /><path d="M5.5 8h1m5-1h1m5 2h1" /></>,
  song: <><path d="M4 18V8l16-4v10" /><path d="M4 8l16-4M4 18c0 1.1 1.3 2 3 2s3-.9 3-2-1.3-2-3-2-3 .9-3 2Zm10-4c0 1.1 1.3 2 3 2s3-.9 3-2-1.3-2-3-2-3 .9-3 2Z" /></>,
  drums: <><path d="M3 17.5 5 8m16 9.5L19 8M3 17.5h18M4 8l2-2h12l2 2" /><ellipse cx="12" cy="15" rx="5.2" ry="4" /><ellipse cx="12" cy="15" rx="3.3" ry="2.4" /><path d="M5.5 8c0-1.1 2.4-2 5.3-2s5.3.9 5.3 2-2.4 2-5.3 2" /><path d="M16.5 8 18 5m-6 0v1m-4.5-2 1 2" /><circle cx="18" cy="4" r="2" /><path d="M5 18v2m14-2v2" /></>,
  percussion: <><g transform="rotate(-28 8 12)"><path d="M8 3.5c2.4 0 4 2 4 4.5s-1.6 4.5-4 4.5-4-2-4-4.5 1.6-4.5 4-4.5Z" /><path d="m6.3 11.6-2 8.7m2.8-8.3 2 8.5" /><circle cx="6.8" cy="6.5" r=".45" /><circle cx="9.2" cy="7.5" r=".45" /><circle cx="7.7" cy="9.4" r=".45" /></g><g transform="rotate(28 16 12)"><path d="M16 3.5c2.4 0 4 2 4 4.5s-1.6 4.5-4 4.5-4-2-4-4.5 1.6-4.5 4-4.5Z" /><path d="m13.7 11.6-2 8.7m2.8-8.3 2 8.5" /><circle cx="14.8" cy="6.5" r=".45" /><circle cx="17.2" cy="7.5" r=".45" /><circle cx="15.7" cy="9.4" r=".45" /></g></>,
  keys: <><path d="M2.5 6h19v13h-19z" /><path d="M5.2 6v13m2.7-13v13m2.7-13v13m2.7-13v13m2.7-13v13m2.7-13v13" /><path d="M4 6v5h2.4V6m2.9 0v5h2.4V6m2.9 0v5H17V6m2.9 0v5h-2.4" /></>,
  strings: <><g transform="translate(-2.5 0) rotate(-25 12 12)"><path d="M12 7.5c2.2 0 3.3 1.2 3.3 2.8 0 1.2-.9 1.6-.9 2.4s1.2 1.3 1.2 3.1c0 2.3-1.8 3.7-3.6 3.7s-3.6-1.4-3.6-3.7c0-1.8 1.2-2.3 1.2-3.1s-.9-1.2-.9-2.4c0-1.6 1.1-2.8 3.3-2.8Z" /><path d="M12 7.5V3" /><circle cx="12" cy="2.3" r="1.2" /><path d="M10.2 12.2c-.3 1-.3 2 0 3m3.6-3c.3 1 .3 2 0 3M10.8 17.2h2.4M12 17.8v2.4" /></g><path d="M16.5 21.5 21 3.5M16 20.4l1.9.5" /></>,
  guitar: <><g transform="rotate(38 12 12)"><path d="M12 9c2 0 3.2 1 3.2 2.6 0 1.4-1 1.9-1 2.9 0 .9 1.8 1.5 1.8 3.7 0 2-2.2 3.3-4 3.3s-4-1.3-4-3.3c0-2.2 1.8-2.8 1.8-3.7 0-1-1-1.5-1-2.9C8.8 10 10 9 12 9Z" /><circle cx="12" cy="15.6" r="1.7" /><path d="M10 19.6h4M11 9V4m2 5V4M11 6h2M11 8h2" /><rect x="10.4" y="0.8" width="3.2" height="3.2" rx=".7" /></g></>,
  bass: <><g transform="rotate(-40 12 12)"><path d="M8.2 14.6c.2-1.6 1.2-2.4 2.6-2.6h2.4c1.4.2 2.4 1 2.6 2.6.1 1-.6 1.5-.6 2.4 0 .9 1.2 1.6 1.2 2.9 0 1.6-2 2.6-4.4 2.6S7.6 21.5 7.6 19.9c0-1.3 1.2-2 1.2-2.9 0-.9-.7-1.4-.6-2.4Z" /><path d="M9.8 16.2h4.4m-4.4 2.3h4.4M10.6 21h2.8" /><path d="M11.4 12V4.5m1.2 7.5V4.5M11.4 7h1.2m-1.2 2.5h1.2" /><path d="M10.4 1h3.2v3.5h-3.2zM9 2h1.4M9 3.5h1.4M13.6 2H15M13.6 3.5H15" /></g></>,
  brass: <><path d="M3 8h3l2 2h7a4 4 0 0 1 0 8H8l-2 2H3z" /><path d="M18 8v12m0-12 3-2v16l-3-2M9 10V7m4 3V6m-4 1h2m2-2h2" /><path d="M9 18v2m4-2v2m-5-4h6" /></>,
  synth: <><rect x="2.5" y="4" width="19" height="16" rx="2" /><path d="M5 7h6v4H5z" /><circle cx="15" cy="8" r="1.2" /><circle cx="19" cy="8" r="1.2" /><path d="M14 11h2m2 0h2M4.5 14h15M5 14v4m2.8-4v4m2.8-4v4m2.8-4v4m2.8-4v4m2.8-4v4" /><path d="M7 14v2h1.6v-2m4.2 0v2h1.6v-2m4.2 0v2h1.6v-2" /></>,
  fx: <><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><circle cx="7.5" cy="7" r="1.2" /><circle cx="12" cy="7" r="1.2" /><circle cx="16.5" cy="7" r="1.2" /><path d="M6 12h2l1.5-2 2 5 1.5-3h5" /><circle cx="12" cy="18" r="1.4" /><path d="M3 17H1m22 0h-2" /></>,
  sample: <><rect x="8" y="2.5" width="8" height="13" rx="4" /><path d="M10 6v5m2-6v7m2-6v5M5 10.5a7 7 0 0 0 14 0m-7 7v3m-4 0h8" /><path d="M4 19h4m8 0h4" /></>,
  custom: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M6 7h12M6 12h12M6 17h12" /><circle cx="10" cy="7" r="1.7" /><circle cx="15" cy="12" r="1.7" /><circle cx="8" cy="17" r="1.7" /><path d="M10 5.3v3.4m5-5v3.4M8 15.3v3.4" /></>,
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
