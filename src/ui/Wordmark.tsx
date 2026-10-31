import { WORDMARK } from './wordmarkPaths';

/**
 * The HeadJams wordmark as outlined paths. "Head" takes the header's text colour, so it works on every skin;
 * the vibration mark and "Jams" keep the brand gradient.
 */
export function Wordmark({ className }: { className?: string }) {
  const { viewBox, head, jams, wave, waveWidth, waveX, jamsX, colors } = WORDMARK;
  return (
    <svg className={className} viewBox={viewBox} role="img" aria-label="HeadJams" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wm-wave" gradientUnits="userSpaceOnUse" x1={waveX[0]} y1="0" x2={waveX[1]} y2="0">
          <stop offset="0" stopColor={colors.cyan} />
          <stop offset=".5" stopColor={colors.magenta} />
          <stop offset="1" stopColor={colors.orange} />
        </linearGradient>
        <linearGradient id="wm-jams" gradientUnits="userSpaceOnUse" x1={jamsX[0]} y1="0" x2={jamsX[1]} y2="0">
          <stop offset="0" stopColor={colors.cyan} />
          <stop offset=".55" stopColor={colors.magenta} />
          <stop offset="1" stopColor={colors.orange} />
        </linearGradient>
      </defs>
      <path d={head} fill="currentColor" />
      <path d={wave} fill="none" stroke="url(#wm-wave)" strokeWidth={waveWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d={jams} fill="url(#wm-jams)" />
    </svg>
  );
}
