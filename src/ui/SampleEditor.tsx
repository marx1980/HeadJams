import { useEffect, useMemo, useRef, useState } from 'react';
import type { SampleData } from '../library/sampleStorage';
import {
  DEFAULT_SAMPLE_SETTINGS, detectSampleBpm, detectSamplePitch, normalizeSampleSettings,
  detectSampleTrim, processSample, type SampleProcessingSettings,
} from '../library/sampleProcessing';
import type { SoundDef } from '../model/project';

interface DraftSample {
  name: string;
  samples: Float32Array;
  sampleRate: number;
}

function Setting({
  label, value, min, max, step = 1, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="sample-setting">
      {label}<input type="range" min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(Number(event.target.value))} />
      <output>{value}</output>
    </label>
  );
}

export function SampleEditor({
  sounds, samples, bpm, onSaveSample, onUpdateSample, onPreviewSample, onRecordStart,
}: {
  sounds: SoundDef[];
  samples: ReadonlyMap<string, SampleData>;
  bpm: number;
  onSaveSample: (name: string, tags: string[], sample: SampleData) => Promise<void>;
  onUpdateSample: (sample: SampleData) => Promise<void>;
  onPreviewSample: (sample: SampleData) => void;
  onRecordStart: () => void;
}) {
  const [activeSampleId, setActiveSampleId] = useState('');
  const [draft, setDraft] = useState<DraftSample>();
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [settings, setSettings] = useState<SampleProcessingSettings>(() => normalizeSampleSettings({ targetBpm: bpm }));
  const [undoStack, setUndoStack] = useState<SampleProcessingSettings[]>([]);
  const [redoStack, setRedoStack] = useState<SampleProcessingSettings[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [targetNote, setTargetNote] = useState(69);
  const [detectedBpm, setDetectedBpm] = useState<number>();
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const chunksRef = useRef<Blob[]>([]);

  const activeSound = sounds.find((sound) => sound.sampleId === activeSampleId);
  const activeSample = samples.get(activeSampleId);
  const original = activeSample
    ? activeSample.originalSamples ?? activeSample.samples
    : draft?.samples;
  const sampleRate = activeSample?.sampleRate ?? draft?.sampleRate ?? 0;
  const processed = useMemo(
    () => original ? processSample(original, sampleRate, settings, bpm) : undefined,
    [original, sampleRate, settings, bpm],
  );
  const detectedPitch = useMemo(
    () => original ? detectSamplePitch(original, sampleRate) : undefined,
    [original, sampleRate],
  );
  const waveform = useMemo(() => {
    if (!original?.length) return [];
    const bars = 180;
    return Array.from({ length: bars }, (_, index) => {
      const start = Math.floor(index * original.length / bars);
      const end = Math.max(start + 1, Math.floor((index + 1) * original.length / bars));
      let peak = 0;
      for (let i = start; i < Math.min(end, original.length); i++) peak = Math.max(peak, Math.abs(original[i]));
      return peak;
    });
  }, [original]);
  const clipped = Boolean(processed?.some((value) => Math.abs(value) >= 0.98));

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const openNew = (next: DraftSample) => {
    setActiveSampleId('');
    setDraft(next);
    setName(next.name);
    setTags('');
    setSettings(normalizeSampleSettings({ targetBpm: bpm }));
    setUndoStack([]);
    setRedoStack([]);
    setDetectedBpm(undefined);
    setError('');
  };

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
      openNew({
        name: fallbackName.replace(/\.[^.]+$/, '') || 'My sample',
        samples: mono, sampleRate: decoded.sampleRate,
      });
    } catch {
      setError('This audio could not be decoded. Try a WAV, MP3, or OGG file.');
    } finally {
      await context.close().catch(() => undefined);
    }
  };

  const openExisting = (sound: SoundDef) => {
    if (!sound.sampleId || !samples.has(sound.sampleId)) return;
    const sample = samples.get(sound.sampleId)!;
    setActiveSampleId(sound.sampleId);
    setDraft(undefined);
    setName(sound.name);
    setTags(sound.tags?.join(', ') ?? '');
    setSettings(normalizeSampleSettings(sample.processingSettings));
    setUndoStack([]);
    setRedoStack([]);
    setDetectedBpm(sample.detectedBpm);
    setError('');
  };

  const changeSetting = <K extends keyof SampleProcessingSettings>(key: K, value: SampleProcessingSettings[K]) => {
    changeSettings({ [key]: value });
  };

  const changeSettings = (updates: Partial<SampleProcessingSettings>) => {
    setUndoStack((history) => [...history.slice(-49), settings]);
    setRedoStack([]);
    setSettings((current) => ({ ...current, ...updates }));
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((history) => [...history, settings]);
    setSettings(previous);
    setUndoStack((history) => history.slice(0, -1));
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((history) => [...history, settings]);
    setSettings(next);
    setRedoStack((history) => history.slice(0, -1));
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

  const save = async () => {
    if (!processed || !original || busy) return;
    setBusy(true);
    setError('');
    const sample: SampleData = {
      id: activeSampleId || globalThis.crypto?.randomUUID?.()
        || `sample-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      samples: processed,
      originalSamples: original,
      sampleRate,
      processingSettings: settings,
      recordedAt: activeSample?.recordedAt ?? Date.now(),
      detectedBpm,
      metadataVersion: 2,
    };
    try {
      if (activeSampleId) await onUpdateSample(sample);
      else {
        await onSaveSample(name.trim() || 'My sample', tags.split(',').map((value) => value.trim()).filter(Boolean), sample);
        setActiveSampleId(sample.id);
        setDraft(undefined);
      }
      setUndoStack([]);
      setRedoStack([]);
    } catch {
      setError('Could not save this sample. Check that browser storage is available.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSettings({ ...DEFAULT_SAMPLE_SETTINGS, targetBpm: bpm });
    setUndoStack([]);
    setRedoStack([]);
  };

  return (
    <div className="sample-editor">
      <h3>Sample editor</h3>
      <div className="row">
        <label>Import audio
          <input type="file" accept="audio/*,.wav,.mp3,.ogg" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadAudio(file, file.name);
            event.target.value = '';
          }} />
        </label>
        {!recording
          ? <button className="secondary" onClick={() => void startRecording()}>● Record from mic</button>
          : <button onClick={stopRecording}>■ Stop recording</button>}
        {activeSampleId && <button className="secondary" onClick={() => { setActiveSampleId(''); setDraft(undefined); }}>Close editor</button>}
      </div>
      {draft && <>
        <div className="row">
          <label>Sample name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="drums, vocal, field" /></label>
        </div>
      </>}
      {original && processed && <>
        <div className="sample-waveform" aria-label="Sample waveform">
          <svg viewBox="0 0 1000 100" role="img" aria-label={`${waveform.length} waveform peaks`}>
            {waveform.map((peak, index) => (
              <rect key={index} x={index * (1000 / waveform.length)} y={50 - peak * 46}
                width={Math.max(1, 1000 / waveform.length - 1)} height={Math.max(1, peak * 92)} />
            ))}
            <rect className="trim-overlay" x="0" y="0" width={settings.trimStart * 1000} height="100" />
            <rect className="trim-overlay" x={settings.trimEnd * 1000} y="0" width={(1 - settings.trimEnd) * 1000} height="100" />
          </svg>
          <div className="sample-waveform-caption">{(original.length / sampleRate).toFixed(2)} sec original · {processed.length} processed samples</div>
          {clipped && <p className="sample-clipping" role="status">Output reached the safety limiter; lower gain or disable normalisation to preserve more headroom.</p>}
        </div>
        <div className="sample-edit-actions">
          <button className="secondary" disabled={!undoStack.length} onClick={undo}>Undo</button>
          <button className="secondary" disabled={!redoStack.length} onClick={redo}>Redo</button>
          <button className="secondary" onClick={() => onPreviewSample({
            id: 'sample-original-preview', samples: original, sampleRate,
          })}>Compare original</button>
          <button className="secondary" onClick={() => onPreviewSample({
            id: 'sample-processed-preview', samples: processed, sampleRate,
          })}>Preview processed</button>
          <button className="secondary" onClick={reset}>Reset to original</button>
          <button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save sample'}</button>
        </div>
        <details className="sample-tool-family" open>
          <summary>Clean</summary>
          <div className="sample-tool-grid">
            <Setting label="Trim start" value={settings.trimStart} min={0} max={settings.trimEnd - 0.001} step={0.005}
              onChange={(value) => changeSetting('trimStart', value)} />
            <Setting label="Trim end" value={settings.trimEnd} min={settings.trimStart + 0.001} max={1} step={0.005}
              onChange={(value) => changeSetting('trimEnd', value)} />
            <button className="secondary" onClick={() => {
              const [trimStart, trimEnd] = detectSampleTrim(original);
              changeSettings({ trimStart, trimEnd });
            }}>Auto trim silence</button>
            <label>Noise reduction
              <select value={settings.noiseReduction} onChange={(event) => changeSetting('noiseReduction', Number(event.target.value))}>
                <option value={0}>Off</option>
                <option value={0.25}>Low</option>
                <option value={0.55}>Medium</option>
                <option value={0.85}>High</option>
              </select>
            </label>
            <Setting label="Noise gate" value={settings.gateThreshold} min={0} max={0.3} step={0.005}
              onChange={(value) => changeSetting('gateThreshold', value)} />
            <Setting label="Fade in (sec)" value={settings.fadeIn} min={0} max={2} step={0.01}
              onChange={(value) => changeSetting('fadeIn', value)} />
            <Setting label="Fade out (sec)" value={settings.fadeOut} min={0} max={2} step={0.01}
              onChange={(value) => changeSetting('fadeOut', value)} />
            <Setting label="Gain (dB)" value={settings.gainDb} min={-36} max={12} step={0.5}
              onChange={(value) => changeSetting('gainDb', value)} />
            <label className="check-label"><input type="checkbox" checked={settings.normalize}
              onChange={(event) => changeSetting('normalize', event.target.checked)} /> Normalize safely</label>
            <label className="check-label"><input type="checkbox" checked={settings.deClick}
              onChange={(event) => changeSetting('deClick', event.target.checked)} /> Automatic de-click</label>
          </div>
        </details>
        <details className="sample-tool-family">
          <summary>Tune</summary>
          <div className="sample-tool-grid">
            <Setting label="Pitch (semitones)" value={settings.pitchSemitones} min={-24} max={24} step={1}
              onChange={(value) => changeSetting('pitchSemitones', value)} />
            <Setting label="Fine tune (cents)" value={settings.fineTuneCents} min={-100} max={100} step={1}
              onChange={(value) => changeSetting('fineTuneCents', value)} />
            <label>Target note
              <select value={targetNote} onChange={(event) => setTargetNote(Number(event.target.value))}>
                {Array.from({ length: 49 }, (_, index) => index + 36).map((note) => (
                  <option key={note} value={note}>{['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][note % 12]}{Math.floor(note / 12) - 1}</option>
                ))}
              </select>
            </label>
            <button className="secondary" disabled={detectedPitch === undefined} onClick={() => {
              if (detectedPitch !== undefined) changeSetting('pitchSemitones', targetNote - detectedPitch);
            }}>Tune to note {detectedPitch === undefined ? '(no clear pitch)' : `(detected MIDI ${detectedPitch})`}</button>
            <button className="secondary" onClick={() => changeSetting('pitchSemitones', 0)}>Reset pitch</button>
          </div>
        </details>
        <details className="sample-tool-family">
          <summary>Time</summary>
          <div className="sample-tool-grid">
            <label>Speed
              <select value={settings.speed} onChange={(event) => changeSetting('speed', Number(event.target.value))}>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
              </select>
            </label>
            <Setting label="Time stretch" value={settings.stretch} min={0.5} max={2} step={0.01}
              onChange={(value) => changeSetting('stretch', value)} />
            <label className="check-label"><input type="checkbox" checked={settings.reverse}
              onChange={(event) => changeSetting('reverse', event.target.checked)} /> Reverse</label>
            <Setting label="Fit to beats (0 = off)" value={settings.fitBeats} min={0} max={16} step={1}
              onChange={(value) => changeSetting('fitBeats', value)} />
            <button className="secondary" onClick={() => {
              if (original) {
                const detected = detectSampleBpm(original, sampleRate);
                setDetectedBpm(detected);
                if (detected) changeSetting('targetBpm', detected);
              }
            }}>Detect BPM{detectedBpm ? ` · ${detectedBpm}` : ''}</button>
            <Setting label="Target BPM" value={settings.targetBpm} min={40} max={240} step={1}
              onChange={(value) => changeSetting('targetBpm', value)} />
            <button className="secondary" onClick={() => changeSetting('fitBeats', 1)}>Fit to beat</button>
            <button className="secondary" onClick={() => changeSetting('fitBeats', 4)}>Fit to bar</button>
          </div>
        </details>
        <details className="sample-tool-family">
          <summary>Tone</summary>
          <div className="sample-tool-grid">
            <Setting label="Low EQ" value={settings.eqLow} min={-12} max={12} step={1}
              onChange={(value) => changeSetting('eqLow', value)} />
            <Setting label="Mid EQ" value={settings.eqMid} min={-12} max={12} step={1}
              onChange={(value) => changeSetting('eqMid', value)} />
            <Setting label="High EQ" value={settings.eqHigh} min={-12} max={12} step={1}
              onChange={(value) => changeSetting('eqHigh', value)} />
            <Setting label="High-pass (Hz)" value={settings.highPass} min={0} max={1000} step={10}
              onChange={(value) => changeSetting('highPass', value)} />
            <label>Compression
              <select value={settings.compression} onChange={(event) => changeSetting('compression', Number(event.target.value))}>
                <option value={0}>Off</option>
                <option value={1}>Gentle</option>
                <option value={2}>Strong</option>
              </select>
            </label>
          </div>
        </details>
        <details className="sample-tool-family">
          <summary>Creative effects</summary>
          <div className="sample-tool-grid">
            <Setting label="Reverb" value={settings.reverb} min={0} max={1} step={0.05}
              onChange={(value) => changeSetting('reverb', value)} />
            <Setting label="Delay" value={settings.delay} min={0} max={1} step={0.05}
              onChange={(value) => changeSetting('delay', value)} />
            <Setting label="Distortion" value={settings.distortion} min={0} max={1} step={0.05}
              onChange={(value) => changeSetting('distortion', value)} />
            <Setting label="Chorus" value={settings.chorus} min={0} max={1} step={0.05}
              onChange={(value) => changeSetting('chorus', value)} />
            <Setting label="Lo-fi" value={settings.loFi} min={0} max={1} step={0.05}
              onChange={(value) => changeSetting('loFi', value)} />
          </div>
        </details>
      </>}
      {sounds.some((sound) => sound.sampleId) && (
        <div className="sample-edit-list" aria-label="Samples to edit">
          <h4>Edit a saved sample</h4>
          {sounds.filter((sound) => sound.sampleId).map((sound) => (
            <button key={sound.id} className="secondary" disabled={!samples.has(sound.sampleId!)}
              aria-pressed={activeSampleId === sound.sampleId} onClick={() => openExisting(sound)}>
              {sound.name}{!samples.has(sound.sampleId!) ? ' · unavailable' : ''}
            </button>
          ))}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
