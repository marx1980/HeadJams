import { useEffect, useMemo, useState } from 'react';
import type { Project, SoundDef } from '../model/project';
import { DESCRIPTORS, looksLikeBass, rankSounds, SOUND_DESCRIPTORS, type Descriptor } from '../library/soundDescriptors';
import { Icon } from './Icon';

/** Find the sound (hum.md H8): pick words for the sound in your head, then hear your own phrase on the best matches. */
export function FindSound({ project, sounds, playing, onAudition, onUse }: {
  project: Project;
  sounds: SoundDef[];
  playing: boolean;
  onAudition: (preview?: Project) => void;
  onUse: (channelId: string, soundId: string) => void;
}) {
  const tracks = project.channels.filter((channel) => !channel.lanes && channel.notes.length > 0);
  const [trackId, setTrackId] = useState('');
  const [chosen, setChosen] = useState<Descriptor[]>([]);
  const [auditionId, setAuditionId] = useState('');
  useEffect(() => { if (!playing) setAuditionId(''); }, [playing]);
  const track = tracks.find((channel) => channel.id === trackId) ?? tracks[0];
  const ranked = useMemo(() => track ? rankSounds(sounds, chosen, { bass: looksLikeBass(track.notes) }) : [],
    [sounds, chosen, track]);
  const label = (id: Descriptor) => DESCRIPTORS.find((item) => item.id === id)!.label;

  if (!tracks.length) return null;
  return (
    <div className="find-sound">
      <label>Track
        <select id="find-track" value={track?.id ?? ''} onChange={(event) => setTrackId(event.target.value)}>
          {tracks.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
        </select>
      </label>
      <div className="find-words" role="group" aria-label="Describe the sound">
        {DESCRIPTORS.map((word) => {
          const on = chosen.includes(word.id);
          return (
            <button key={word.id} className={on ? 'on' : 'secondary'} aria-pressed={on}
              onClick={() => setChosen(on ? chosen.filter((item) => item !== word.id) : [...chosen, word.id])}>{word.label}</button>
          );
        })}
      </div>
      <ul className="find-results" aria-label="Matching sounds">
        {ranked.map(({ sound, matches }) => {
          const current = track?.soundId === sound.id;
          const auditioning = auditionId === sound.id && playing;
          return (
            <li key={sound.id} className="find-result">
              <div className="find-result-text">
                <span className="find-result-name">{sound.name}</span>
                <span className="find-result-words">{(matches.length ? matches : SOUND_DESCRIPTORS[sound.id] ?? []).map(label).join(' · ')}</span>
              </div>
              <button className="secondary" aria-label={`${auditioning ? 'Stop' : 'Play'} ${track?.name} on ${sound.name}`}
                onClick={() => {
                  if (!track) return;
                  if (auditioning) { onAudition(undefined); setAuditionId(''); return; }
                  setAuditionId(sound.id);
                  onAudition({ ...project, arrangement: [], channels: [{ ...track, soundId: sound.id, mute: false, solo: false }] });
                }}><Icon name={auditioning ? 'stop' : 'play'} className="inline-icon" /></button>
              <button className={current ? 'on' : ''} aria-pressed={current} aria-label={`Use ${sound.name} for ${track?.name}`}
                onClick={() => { if (auditionId) onAudition(undefined); if (track) onUse(track.id, sound.id); }}>
                {current ? <Icon name="check" className="inline-icon" /> : 'Use'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
