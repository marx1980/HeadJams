export type IconName =
  | 'beat' | 'sound' | 'library' | 'song'
  | 'drums' | 'percussion' | 'keys' | 'strings' | 'guitar' | 'bass'
  | 'brass' | 'synth' | 'fx' | 'sample' | 'custom' | 'favorite' | 'recent';

const paths: Record<IconName, React.ReactNode> = {
  beat: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v11c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 11c0 1.7 3.6 3 8 3s8-1.3 8-3" /><path d="m8 4 2-2m6 2-2-2" /></>,
  sound: <><path d="M5 4v16M12 4v16M19 4v16" /><path d="M3 9h4m3 7h4m3-8h4" /></>,
  library: <><path d="M4 5h4v15H4zM10 4h4v16h-4zM16 6h4v14h-4z" /><path d="M5.5 8h1m5-1h1m5 2h1" /></>,
  song: <><path d="M4 18V8l16-4v10" /><path d="M4 8l16-4M4 18c0 1.1 1.3 2 3 2s3-.9 3-2-1.3-2-3-2-3 .9-3 2Zm10-4c0 1.1 1.3 2 3 2s3-.9 3-2-1.3-2-3-2-3 .9-3 2Z" /></>,
  drums: <><ellipse cx="12" cy="7" rx="8" ry="3" /><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  percussion: <><path d="M7 5c0-1.7 10-1.7 10 0v12c0 2.7-10 2.7-10 0V5Z" /><path d="M7 5c0 1.7 10 1.7 10 0M9 10h6m-6 4h6M5 3l2 2m12-2-2 2" /></>,
  keys: <><path d="M3 5h18v14H3z" /><path d="M7 5v8m4-8v8m4-8v8m4-8v8M7 13v6m4-6v6m4-6v6m4-6v6" /><path d="M5.5 5v5m4-5v5m4-5v5m4-5v5" /></>,
  strings: <><path d="M12 3 9 6l2 3-4 5c-1 1.3-.5 3.5 1 4.5s3.7 1 4.8-.4l3.7-5-2-3 2-3-2.5-2.5" /><path d="m9 6 6 5m-8 3 7 4m-5-8 4 3m-6 3 4 3" /></>,
  guitar: <><path d="M14 5 19 2l3 3-3 5-2-1-3 3a5 5 0 1 1-3-3l3-3-1-2Z" /><path d="m9 14 2 2m2-8 4 4m-8-1 2 2" /></>,
  bass: <><path d="M12 3h2v8a5 5 0 1 1-4-1V3h2v8" /><path d="M11 5h5m-5 3h5m-5 3h5m-5 3h5" /><circle cx="12" cy="16" r="1" /></>,
  brass: <><path d="M4 10h9l5-4v12l-5-4H4zM4 10v4m14-5 3-2v10l-3-2" /><path d="M7 10v4m3-4v4" /></>,
  synth: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h2m3 0h2m3 0h2M7 13h2m3 0h2m3 0h2M8 16h8" /></>,
  fx: <><path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 2l.7 2.3L8 5l-2.3.7L5 8l-.7-2.3L2 5l2.3-.7L5 2Z" /></>,
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
