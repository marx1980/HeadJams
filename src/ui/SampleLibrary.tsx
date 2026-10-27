import { useEffect, useMemo, useRef, useState } from 'react';
import type { Channel } from '../model/project';
import type { InstrumentDefinition } from '../library/instrumentRegistry';
import type { SampleData } from '../library/sampleStorage';

interface DraftSample {
  name: string;
  samples: Float32Array;
  sampleRate: number;
}

export function SampleLibrary({
  sounds, channels, onPreview, onUse, onSaveSample, onRecordStart,
}: {
  sounds: InstrumentDefinition[];
  channels: Channel[];
  onPreview: (sound: InstrumentDefinition) => void;
  onUse: (soundId: string, channelId: string) => void;
  onSaveSample: (name: string, tags: string[], sample: SampleData) => Promise<void>;
  onRecordStart: () => void;
}) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [padView, setPadView] = useState(false);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [draft, setDraft] = useState<DraftSample>();
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(1);
  const [normalize, setNormalize] = useState(true);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const chunksRef = useRef<Blob[]>([]);

  const availableTags = useMemo(() => [...new Set(sounds.flatMap((sound) => sound.tags ?? []))].sort(), [sounds]);
  const visibleSounds = useMemo(() => sounds.filter((sound) => sound.available).filter((sound) => {
    const text = `${sound.name} ${sound.category} ${(sound.tags ?? []).join(' ')}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (!tag || sound.tags?.includes(tag));
  }), [sounds, query, tag]);

  useEffect(() => {
    if (!channels.some((channel) => channel.id === channelId)) setChannelId(channels[0]?.id ?? '');
  }, [channels, channelId]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const loadAudio = async (blob: Blob, fallbackName: string) => {
    setError('');
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const mono = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const data = decoded.getChannelData(channel);
        for (let i = 0; i < mono.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
      }
      setDraft({ name: fallbackName.replace(/\.[^.]+$/, '') || 'My sample', samples: mono, sampleRate: decoded.sampleRate });
      setName(fallbackName.replace(/\.[^.]+$/, '') || 'My sample');
      setTrimStart(0);
      setTrimEnd(1);
    } catch {
      setError('This audio could not be decoded. Try a WAV, MP3, or OGG file.');
    } finally {
      await context.close().catch(() => undefined);
    }
  };

  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        void loadAudio(new Blob(chunksRef.current, { type: recorder.mimeType }), 'My recording');
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = undefined;
      };
      recorder.start();
      setRecording(true);
      onRecordStart();
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = undefined;
      setError('Microphone access failed. Check browser permissions and try again.');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const saveDraft = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError('');
    const start = Math.floor(trimStart * draft.samples.length);
    const end = Math.max(start + 1, Math.min(draft.samples.length, Math.floor(trimEnd * draft.samples.length)));
    const samples = draft.samples.slice(start, end);
    if (normalize) {
      let peak = 0;
      for (const value of samples) peak = Math.max(peak, Math.abs(value));
      if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] /= peak;
    }
    const id = globalThis.crypto?.randomUUID?.() ?? `sample-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    try {
      await onSaveSample(name.trim() || 'My sample', tags.split(',').map((value) => value.trim()).filter(Boolean), { id, samples, sampleRate: draft.sampleRate });
      setDraft(undefined);
      setTags('');
    } catch {
      setError('Could not save this sample. Check that browser storage is available.');
    } finally {
      setBusy(false);
    }
  };

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
      <div className="sample-editor">
        <h3>Add a sample</h3>
        <div className="row">
          <label>Import audio
            <input type="file" accept="audio/*,.wav,.mp3,.ogg" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadAudio(file, file.name);
              event.target.value = '';
            }} />
          </label>
          {!recording
            ? <button id="record-sample" className="secondary" onClick={() => void startRecording()}>● Record from mic</button>
            : <button onClick={stopRecording}>■ Stop recording</button>}
        </div>
        {draft && <>
          <div className="row">
            <label>Sample name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="drums, vocal, field" /></label>
          </div>
          <label>Trim start: {Math.round(trimStart * 100)}%
            <input type="range" min={0} max={Math.max(0, trimEnd - 0.01)} step={0.005} value={trimStart} onChange={(event) => setTrimStart(Number(event.target.value))} />
          </label>
          <label>Trim end: {Math.round(trimEnd * 100)}%
            <input type="range" min={Math.min(1, trimStart + 0.01)} max={1} step={0.005} value={trimEnd} onChange={(event) => setTrimEnd(Number(event.target.value))} />
          </label>
          <label className="check-label"><input type="checkbox" checked={normalize} onChange={(event) => setNormalize(event.target.checked)} /> Normalize to peak</label>
          <button id="save-sample" onClick={() => void saveDraft()} disabled={busy}>{busy ? 'Saving…' : 'Save sample'}</button>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
