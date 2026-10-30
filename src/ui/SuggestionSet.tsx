import { useEffect, useState } from 'react';
import type { Project } from '../model/project';
import { Icon } from './Icon';

/** One alternative: a name, an optional short value (chords, notes), how to hear it and how to keep it. */
export interface Suggestion {
  id: string;
  label: string;
  detail?: string;
  /** The project to audition (nothing saved). */
  preview: () => Project | undefined;
  keep: () => void;
  disabled?: boolean;
}

/**
 * The shared A/B/C row (plan.md C3): every assistant offers alternatives the same way — hear each one
 * with the music, then keep one. Only one plays at a time; keeping stops the audition.
 */
export function SuggestionSet({ label, items, playing, onAudition, keepLabel = 'Use' }: {
  label: string;
  items: Suggestion[];
  playing: boolean;
  onAudition: (preview?: Project) => void;
  keepLabel?: string;
}) {
  const [auditionId, setAuditionId] = useState('');
  useEffect(() => { if (!playing) setAuditionId(''); }, [playing]);
  return (
    <ul className="progression-list suggestion-set" aria-label={label}>
      {items.map((item) => {
        const on = auditionId === item.id && playing;
        return (
          <li key={item.id} className="progression-item">
            <div className="progression-text">
              <span className="progression-name">{item.label}</span>
              {item.detail && <span className="progression-chords">{item.detail}</span>}
            </div>
            <button className="secondary" aria-label={`${on ? 'Stop' : 'Play'} ${item.label}`} disabled={item.disabled}
              onClick={() => {
                if (on) { onAudition(undefined); setAuditionId(''); return; }
                const preview = item.preview();
                if (!preview) return;
                setAuditionId(item.id);
                onAudition(preview);
              }}><Icon name={on ? 'stop' : 'play'} className="inline-icon" /></button>
            <button aria-label={`${keepLabel} ${item.label}`} disabled={item.disabled}
              onClick={() => { if (auditionId) { onAudition(undefined); setAuditionId(''); } item.keep(); }}>{keepLabel}</button>
          </li>
        );
      })}
    </ul>
  );
}
