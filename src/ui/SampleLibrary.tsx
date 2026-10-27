import { useEffect, useMemo, useState } from 'react';
import type { Channel, SoundDef } from '../model/project';
import type { SampleData } from '../library/sampleStorage';
import { SampleEditor } from './SampleEditor';
import { RecognitionPanel } from './RecognitionPanel';
import type { Project } from '../model/project';
import type { RecognitionTake } from '../model/recognition';

export function SampleLibrary({
  sounds, channels, sampleData, bpm, project, onPreview, onPreviewSample, onUse, onSaveSample, onUpdateSample,
  onRecordStart, onRecordStop, onRecognize, onRecognitionBpmChange,
}: {
  sounds: SoundDef[];
  channels: Channel[];
  sampleData: ReadonlyMap<string, SampleData>;
  bpm: number;
  project: Project;
  onPreview: (sound: SoundDef) => void;
  onPreviewSample: (sample: SampleData) => void;
  onUse: (soundId: string, channelId: string) => void;
  onSaveSample: (name: string, tags: string[], sample: SampleData) => Promise<void>;
  onUpdateSample: (sample: SampleData) => Promise<void>;
  onRecordStart: (durationMs: number, bars: number) => Promise<void> | void;
  onRecordStop: () => void;
  onRecognize: (take: RecognitionTake) => boolean;
  onRecognitionBpmChange: (bpm: number, take?: RecognitionTake) => void;
}) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [padView, setPadView] = useState(false);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');

  const availableTags = useMemo(() => [...new Set(sounds.flatMap((sound) => sound.tags ?? []))].sort(), [sounds]);
  const visibleSounds = useMemo(() => sounds.filter((sound) => {
    const text = `${sound.name} ${sound.category} ${(sound.tags ?? []).join(' ')}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (!tag || sound.tags?.includes(tag));
  }), [sounds, query, tag]);

  useEffect(() => {
    if (!channels.some((channel) => channel.id === channelId)) setChannelId(channels[0]?.id ?? '');
  }, [channels, channelId]);

  return (
    <section className="panel sample-library" aria-label="Sound library">
      <div className="library-heading">
        <h2>Sound library</h2>
        <button className="secondary" aria-pressed={padView} onClick={() => setPadView(!padView)}>{padView ? 'Library view' : 'Pad view'}</button>
      </div>
      <div className="library-filters">
        <label>Search sounds
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, category, or tag" />
        </label>
        <label>Tag
          <select value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="">All tags</option>
            {availableTags.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>Use on channel
          <select value={channelId} onChange={(event) => setChannelId(event.target.value)} disabled={!channels.length}>
            {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
          </select>
        </label>
      </div>
      <div className={padView ? 'sound-list pads' : 'sound-list'}>
        {visibleSounds.map((sound) => (
          <div className="sound-card" key={sound.id}>
            <span className="sound-title">{sound.name}</span>
            {!padView && <span className="sound-meta">{sound.category}{sound.tags?.length ? ` · ${sound.tags.join(', ')}` : ''}</span>}
            <div className="sound-actions">
              <button aria-label={`Preview ${sound.name}`} onClick={() => onPreview(sound)}>▶</button>
              <button disabled={!channelId} onClick={() => onUse(sound.id, channelId)}>Use</button>
            </div>
          </div>
        ))}
        {!visibleSounds.length && <p className="hint">No sounds match your search.</p>}
      </div>
      <SampleEditor
        sounds={sounds}
        samples={sampleData}
        bpm={bpm}
        loopBars={project.loopBars}
        onSaveSample={onSaveSample}
        onUpdateSample={onUpdateSample}
        onPreviewSample={onPreviewSample}
        onRecordStart={onRecordStart}
        onRecordStop={onRecordStop}
      />
      <RecognitionPanel
        project={project}
        samples={sampleData}
        sounds={sounds}
        onApply={onRecognize}
        onBpmChange={onRecognitionBpmChange}
        onPreviewSample={onPreviewSample}
      />
    </section>
  );
}
