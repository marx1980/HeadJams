import { useEffect, useMemo, useState } from 'react';
import type { Channel, SoundDef } from '../model/project';
import type { SampleData } from '../library/sampleStorage';
import { SampleEditor } from './SampleEditor';
import { RecognitionPanel } from './RecognitionPanel';
import { FindSound } from './FindSound';
import { Icon } from './Icon';
import type { Project } from '../model/project';
import type { RecognitionTake } from '../model/recognition';
import type { ApplyRecognitionOptions } from '../model/recognitionProject';
import { HEAR_AS_BEAT, HEAR_AS_PITCHED, hearAsOf, type HearAsId } from '../model/hearAs';

const SECTION = { name: 'library-section' } as Record<string, string>;

export function SampleLibrary({
  sounds, channels, sampleData, bpm, project, onPreview, onPreviewSample, onUse, onSaveSample, onUpdateSample,
  onRecordStart, onRecordStop, recordingOffset, onRecognize, onRecognitionBpmChange, onImport, onEdit, onRecognitionEdit, onRemoveIdea, onHearAs, onLibraryAction, onAudition, playing, onUseSound,
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
  onRecordStart: (durationMs: number, bars: number, metronome: boolean) => Promise<void> | void;
  onRecordStop: () => void;
  recordingOffset?: (recorderStartMs: number, inputLatencySec: number) => number | undefined;
  onRecognize: (take: RecognitionTake, options?: ApplyRecognitionOptions) => boolean;
  onRecognitionBpmChange: (bpm: number, take?: RecognitionTake) => void;
  onImport: () => void;
  onEdit: () => void;
  onRecognitionEdit: () => void;
  onRemoveIdea: (takeId: string) => void;
  onHearAs: (takeId: string, id: HearAsId) => void;
  onAudition: (preview?: Project) => void;
  playing: boolean;
  onUseSound: (channelId: string, soundId: string) => void;
  onLibraryAction: (event: 'library-search' | 'library-tag') => void;
}) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');

  const availableTags = useMemo(() => [...new Set(sounds.flatMap((sound) => sound.tags ?? []))].sort(), [sounds]);
  const visibleSounds = useMemo(() => sounds.filter((sound) => {
    const text = `${sound.name} ${sound.category} ${(sound.tags ?? []).join(' ')}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (!tag || sound.tags?.includes(tag));
  }), [sounds, query, tag]);

  const filtering = Boolean(query.trim() || tag);
  const [openGroup, setOpenGroup] = useState('');
  const groups = useMemo(() => {
    const byCategory = new Map<string, typeof visibleSounds>();
    for (const sound of visibleSounds) byCategory.set(sound.category, [...(byCategory.get(sound.category) ?? []), sound]);
    return [...byCategory];
  }, [visibleSounds]);

  useEffect(() => {
    setOpenGroup(filtering ? groups[0]?.[0] ?? '' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tag]);

  useEffect(() => {
    if (!channels.some((channel) => channel.id === channelId)) setChannelId(channels[0]?.id ?? '');
  }, [channels, channelId]);

  return (
    <section className="panel sample-library" aria-label="Sound library">
      <div className="library-heading">
        <h2>Sound library</h2>
      </div>
      <details className="library-section" {...SECTION} open>
        <summary>Sounds</summary>
        <div className="library-filters">
          <label className="wide">Search sounds
            <input id="library-search" type="search" value={query} onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim()) onLibraryAction('library-search');
            }} placeholder="Name, category, or tag" />
          </label>
          <label>Tag
            <select id="library-tag" value={tag} disabled={!availableTags.length}
              title={availableTags.length ? undefined : 'No tags yet. Add tags when saving a sample.'} onChange={(event) => {
              setTag(event.target.value);
              if (event.target.value) onLibraryAction('library-tag');
            }}>
              <option value="">{availableTags.length ? 'All tags' : 'No tags yet'}</option>
              {availableTags.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>Use on channel
            <select value={channelId} onChange={(event) => setChannelId(event.target.value)} disabled={!channels.length}>
              {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
            </select>
          </label>
        </div>
        <div className="sound-groups">
          {groups.map(([category, list]) => (
            <details className="sound-group" key={category} open={openGroup === category}>
              <summary onClick={(event) => { event.preventDefault(); setOpenGroup(openGroup === category ? '' : category); }}>{category} <span className="count">{list.length}</span></summary>
              <div className="sound-list">
                {list.map((sound) => (
                  <div className="sound-card" key={sound.id}>
                    <div className="sound-text">
                      <span className="sound-title">{sound.name}</span>
                      {sound.tags?.length ? <span className="sound-meta">{sound.tags.join(', ')}</span> : null}
                    </div>
                    <div className="sound-actions">
                      <button aria-label={`Preview ${sound.name}`} onClick={() => onPreview(sound)}><Icon name="play" className="inline-icon" /></button>
                      <button disabled={!channelId} onClick={() => onUse(sound.id, channelId)}>Use</button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
          {!visibleSounds.length && <p className="hint">No sounds match your search.</p>}
        </div>
      </details>
      <details className="library-section" {...SECTION}>
        <summary>Find the sound</summary>
        <FindSound project={project} sounds={sounds} playing={playing} onAudition={onAudition} onUse={onUseSound} />
      </details>
      <details className="library-section" {...SECTION}>
        <summary>Sample editor</summary>
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
        recordingOffset={recordingOffset}
        onImport={onImport}
        onEdit={onEdit}
      />
      </details>
      <details className="library-section" {...SECTION}>
        <summary>Ideas</summary>
        {project.recognitionTakes.length > 0 && (
          <ul className="idea-list" aria-label="Ideas">
            {[...project.recognitionTakes].reverse().map((take) => {
              const sample = sampleData.get(take.sourceSampleId);
              return (
                <li key={take.id} className="idea-item">
                  <span className="idea-name">{take.label ?? (take.mode === 'beat' ? 'Beat' : take.mode === 'bass' ? 'Bass' : 'Melody')}</span>
                  <select className="idea-hear-as" aria-label={`Hear ${take.label ?? 'idea'} as`} value={hearAsOf(take)}
                    disabled={!take.channelIds.length} onChange={(event) => onHearAs(take.id, event.target.value as HearAsId)}>
                    {(take.mode === 'beat' ? HEAR_AS_BEAT : HEAR_AS_PITCHED).map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                  <button className="secondary" aria-label={`Play ${take.label ?? 'idea'} recording`} disabled={!sample}
                    onClick={() => sample && onPreviewSample({ ...sample, samples: sample.originalSamples ?? sample.samples })}><Icon name="play" className="inline-icon" /></button>
                  <button className="secondary" aria-label={`Delete ${take.label ?? 'idea'}`} onClick={() => onRemoveIdea(take.id)}><Icon name="close" className="inline-icon" /></button>
                </li>
              );
            })}
          </ul>
        )}
      <RecognitionPanel
        project={project}
        samples={sampleData}
        sounds={sounds}
        onApply={onRecognize}
        onBpmChange={onRecognitionBpmChange}
        onPreviewSample={onPreviewSample}
        onEdit={onRecognitionEdit}
      />
      </details>
    </section>
  );
}
