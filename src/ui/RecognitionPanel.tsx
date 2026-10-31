import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../model/project';
import { createRecognitionTake, SOUND_FOR_CLASS, type ApplyRecognitionOptions } from '../model/recognitionProject';
import { soundForClass } from '../model/hearAs';
import { correctRecognitionPitches } from '../model/recognitionProject';
import { applyPerformanceMode, PERFORMANCE_MODES, type PerformanceMode } from '../model/performanceModes';
import { quantiseRecognitionEvents, quantiseTime } from '../library/quantisation';
import type { SoundDef } from '../model/project';
import type {
  PercussionClass, RecognitionEvent, RecognitionMode, RecognitionTake,
} from '../model/recognition';
import type { SampleData } from '../library/sampleStorage';
import { localRecognitionAdapter, type RecognitionProgress } from '../library/recognitionAdapter';
import { recordedFirst } from '../library/instrumentRegistry';
import { Icon } from './Icon';
import { SoundPicker } from './SoundPicker';

const MODES: Array<{ value: RecognitionMode; label: string }> = [
  { value: 'melody', label: 'Melody' },
  { value: 'bass', label: 'Bass' },
  { value: 'beat', label: 'Beatbox / percussion' },
];
const PERCUSSION_CLASSES: PercussionClass[] = [
  'kick', 'snare', 'closed-hat', 'open-hat', 'clap', 'tom', 'cymbal', 'bass', 'unknown',
];

export function RecognitionPanel({
  project, samples, sounds, onApply, onBpmChange, onPreviewSample, onPreviewSound, onEdit,
}: {
  project: Project;
  samples: ReadonlyMap<string, SampleData>;
  sounds: SoundDef[];
  onApply: (take: RecognitionTake, options?: ApplyRecognitionOptions) => boolean;
  onBpmChange: (bpm: number, take?: RecognitionTake) => void;
  onPreviewSample: (sample: SampleData) => void;
  onPreviewSound: (sound: SoundDef) => void;
  onEdit: () => void;
}) {
  const [sampleId, setSampleId] = useState('');
  const [mode, setMode] = useState<RecognitionMode>('melody');
  // The instrument for a new melody or bass track is the user's choice: nothing is picked for them.
  const [soundId, setSoundId] = useState('');
  const [useCleaned, setUseCleaned] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [strength, setStrength] = useState(0.75);
  const [subdivision, setSubdivision] = useState<RecognitionTake['quantisation']['subdivision']>('sixteenth');
  const [pitchCorrection, setPitchCorrection] = useState(0);
  const [scaleAwarePitch, setScaleAwarePitch] = useState(false);
  const [progress, setProgress] = useState<RecognitionProgress>();
  const [error, setError] = useState('');
  const [activeTakeId, setActiveTakeId] = useState('');
  const [replaceResult, setReplaceResult] = useState(false);
  const [eventHistory, setEventHistory] = useState<RecognitionEvent[][]>([]);
  const controller = useRef<AbortController | null>(null);
  const sample = samples.get(sampleId);
  const activeTake = project.recognitionTakes.find((take) => take.id === activeTakeId)
    ?? project.recognitionTakes.at(-1);
  const needsSound = mode !== 'beat' && !(replaceResult && activeTake?.mode === mode);
  const availableSamples = useMemo(() => [...samples.values()].sort((a, b) => (b.recordedAt ?? 0) - (a.recordedAt ?? 0)), [samples]);

  useEffect(() => {
    if (!activeTake) return;
    setEnabled(activeTake.quantisation.enabled);
    setStrength(activeTake.quantisation.strength);
    setSubdivision(activeTake.quantisation.subdivision);
    setPitchCorrection(activeTake.pitchCorrection);
    setScaleAwarePitch(activeTake.scaleAwarePitch);
  }, [activeTake?.id]);

  const runRecognition = async () => {
    if (!sample) return;
    controller.current?.abort();
    const currentController = new AbortController();
    controller.current = currentController;
    setError('');
    setProgress({ progress: 0.02, message: 'Starting on-device recognition…' });
    try {
      const source = useCleaned ? sample.samples : sample.originalSamples ?? sample.samples;
      const result = await localRecognitionAdapter.recognize(source, sample.sampleRate, mode, {
        signal: currentController.signal,
        onProgress: setProgress,
      });
      if (!result.events.length) {
        setError(`No ${mode === 'beat' ? 'percussion onsets' : 'clear pitched notes'} were detected. Try another recording or input mode.`);
        setProgress(undefined);
        return;
      }
      const options = { enabled, strength, subdivision };
      const takeId = replaceResult && activeTake?.mode === mode ? activeTake.id : undefined;
      const take = createRecognitionTake(
        sample.id, result, options, project.bpm, project.noteLength, takeId, pitchCorrection,
        scaleAwarePitch, project.scaleRoot, project.scaleId, sample.recordingOffsetSeconds ?? 0,
      );
      const previous = project.recognitionTakes.find((item) => item.id === take.id);
      take.source = sample.source;
      take.label = previous?.label
        ?? `${MODES.find((item) => item.value === mode)?.label ?? 'Idea'} ${project.recognitionTakes.filter((item) => item.mode === mode).length + 1}`;
      if (!onApply(take, mode === 'beat' || replaceResult ? undefined : { soundId })) {
        setError('There is not enough channel space for this recognition result. Remove a channel and try again.');
        setProgress(undefined);
        return;
      }
      setActiveTakeId(take.id);
      setEventHistory([]);
      setProgress(undefined);
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') {
        setProgress(undefined);
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Recognition could not process this recording.');
      setProgress(undefined);
    }
  };

  const applyMode = (performance: PerformanceMode) => {
    if (!activeTake) return;
    const updated = applyPerformanceMode(activeTake, performance, project.bpm, project.noteLength, project.scaleRoot, project.scaleId);
    if (!onApply(updated)) return;
    setEventHistory((history) => [...history, activeTake.quantisedEvents]);
    setEnabled(updated.quantisation.enabled);
    setStrength(updated.quantisation.strength);
    setSubdivision(updated.quantisation.subdivision);
    setPitchCorrection(updated.pitchCorrection);
    setScaleAwarePitch(updated.scaleAwarePitch);
    onEdit();
  };
  const cancel = () => controller.current?.abort();
  const commitEvents = (events: RecognitionEvent[], patch: Partial<RecognitionTake> = {}) => {
    if (!activeTake) return false;
    const applied = onApply({ ...activeTake, ...patch, quantisedEvents: events });
    if (!applied) {
      setError('There is not enough channel space to update this recognition track.');
      return false;
    }
    setEventHistory((history) => [...history, activeTake.quantisedEvents]);
    onEdit();
    return true;
  };
  const updateEvent = (eventId: string, update: (event: RecognitionEvent) => RecognitionEvent) => {
    if (!activeTake) return;
    commitEvents(activeTake.quantisedEvents.map((event) => event.id === eventId ? update(event) : event));
  };
  const reclassify = (eventId: string, type: PercussionClass) => {
    // A reclassified hit joins that class's track and plays its default sound.
    updateEvent(eventId, (event) => {
      if (!('type' in event)) return event;
      const { assignedSoundId: _previous, ...rest } = event;
      return { ...rest, type };
    });
  };
  const assignSound = (eventId: string, assignedSoundId: string) => {
    if (!activeTake) return;
    commitEvents(activeTake.quantisedEvents.map((event) => {
      if (!('type' in event) || event.id !== eventId) return event;
      if (assignedSoundId !== soundForClass(activeTake, event.type)) return { ...event, assignedSoundId };
      const { assignedSoundId: _previous, ...rest } = event;
      return rest;
    }));
  };
  const updatePitchSettings = (correction: number, scaleAware: boolean) => {
    setPitchCorrection(correction);
    setScaleAwarePitch(scaleAware);
    if (!activeTake || activeTake.mode === 'beat') return;
    const settings = { pitchCorrection: correction, scaleAwarePitch: scaleAware, scaleRoot: project.scaleRoot,
      scaleId: project.scaleId, transposeSemitones: activeTake.transposeSemitones };
    const corrected = correctRecognitionPitches(activeTake.originalEvents, settings);
    const quantisedEvents = activeTake.quantisation.enabled
      ? quantiseRecognitionEvents(corrected, activeTake.tempoBpm, project.noteLength,
        activeTake.quantisation.subdivision, activeTake.quantisation.strength)
      : corrected;
    commitEvents(quantisedEvents, {
      pitchCorrection: correction,
      scaleAwarePitch: scaleAware,
      scaleRoot: project.scaleRoot,
      scaleId: project.scaleId,
    });
  };
  const transpose = (semitones: number) => {
    if (!activeTake || activeTake.mode === 'beat') return;
    const amount = Math.max(-48, Math.min(48, activeTake.transposeSemitones + semitones));
    const settings = { ...activeTake, transposeSemitones: amount };
    const corrected = correctRecognitionPitches(activeTake.originalEvents, settings);
    const quantisedEvents = activeTake.quantisation.enabled
      ? quantiseRecognitionEvents(corrected, activeTake.tempoBpm, project.noteLength,
        activeTake.quantisation.subdivision, activeTake.quantisation.strength)
      : corrected;
    commitEvents(quantisedEvents, { transposeSemitones: amount });
  };
  const undoEvents = () => {
    const previous = eventHistory.at(-1);
    if (!activeTake || !previous) return;
    setEventHistory((history) => history.slice(0, -1));
    onApply({ ...activeTake, quantisedEvents: previous });
  };
  const restoreDetected = () => {
    if (!activeTake) return;
    setPitchCorrection(0);
    setScaleAwarePitch(false);
    setEnabled(false);
    commitEvents(activeTake.originalEvents.map((event) => ({ ...event })), {
      quantisation: { ...activeTake.quantisation, enabled: false },
      pitchCorrection: 0,
      scaleAwarePitch: false,
      transposeSemitones: 0,
    });
  };
  const splitNote = (event: Extract<RecognitionEvent, { pitch: number }>) => {
    if (event.durationSeconds < 0.12) return;
    const half = event.durationSeconds / 2;
    const first = { ...event, id: `${event.id}-a`, durationSeconds: half };
    const second = { ...event, id: `${event.id}-b`, startSeconds: event.startSeconds + half, durationSeconds: half };
    const events = activeTake?.quantisedEvents.flatMap((item) => item.id === event.id ? [first, second] : [item]) ?? [];
    commitEvents(events);
  };
  const joinNote = (event: Extract<RecognitionEvent, { pitch: number }>) => {
    if (!activeTake) return;
    const notes = activeTake.quantisedEvents.filter((item): item is Extract<RecognitionEvent, { pitch: number }> => 'pitch' in item);
    const currentIndex = notes.findIndex((item) => item.id === event.id);
    const next = notes.slice(currentIndex + 1).find((item) => item.pitch === event.pitch
      && item.startSeconds - (event.startSeconds + event.durationSeconds) <= 0.2);
    if (!next) return;
    const joined = { ...event, durationSeconds: Math.max(event.startSeconds + event.durationSeconds,
      next.startSeconds + next.durationSeconds) - event.startSeconds };
    commitEvents(activeTake.quantisedEvents.flatMap((item) => item.id === event.id ? [joined] : item.id === next.id ? [] : [item]));
  };
  const quantiseOne = (event: Extract<RecognitionEvent, { pitch: number }>) => {
    if (!activeTake) return;
    const startSeconds = quantiseTime(event.startSeconds, activeTake.tempoBpm, project.noteLength,
      activeTake.quantisation.subdivision, 1);
    const endSeconds = quantiseTime(event.startSeconds + event.durationSeconds, activeTake.tempoBpm,
      project.noteLength, activeTake.quantisation.subdivision, 1);
    updateEvent(event.id, (item) => 'pitch' in item ? {
      ...item, startSeconds, durationSeconds: Math.max(0.05, endSeconds - startSeconds),
    } : item);
  };
  const quantiseEventStart = (eventId: string, startSeconds: number) => {
    if (!activeTake) return;
    const start = quantiseTime(startSeconds, activeTake.tempoBpm, project.noteLength,
      activeTake.quantisation.subdivision, 1);
    updateEvent(eventId, (event) => ({ ...event, startSeconds: start }));
  };
  const correctOne = (event: Extract<RecognitionEvent, { pitch: number }>, pitch: number) => {
    updateEvent(event.id, (item) => 'pitch' in item ? {
      ...item, pitch: Math.max(0, Math.min(127, Math.round(pitch))),
    } : item);
  };
  const editNote = (eventId: string, field: 'startSeconds' | 'durationSeconds', value: number) => {
    updateEvent(eventId, (item) => 'pitch' in item ? {
      ...item,
      [field]: field === 'startSeconds' ? Math.max(0, value) : Math.max(0.05, value),
    } : item);
  };

  return (
    <section className="panel recognition-panel" aria-label="Audio recognition">
      <div className="recognition-controls">
        <label className="wide">Recording
          <select aria-label="Recording to recognize" value={sampleId} onChange={(event) => setSampleId(event.target.value)}>
            <option value="">Choose a saved sample…</option>
            {availableSamples.map((item) => (
              <option key={item.id} value={item.id}>
                {sounds.find((sound) => sound.sampleId === item.id)?.name ?? item.id}
                {item.recordedAt ? ` · ${new Date(item.recordedAt).toLocaleDateString()}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>Input
          <select aria-label="Recognition mode" value={mode} onChange={(event) => setMode(event.target.value as RecognitionMode)}>
            {MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Project tempo
          <input aria-label="Recognition tempo" type="number" min={40} max={200} value={project.bpm}
            onChange={(event) => onBpmChange(Number(event.target.value))} />
        </label>
        <label>Timing correction
          <select aria-label="Timing correction" value={!enabled ? 'off' : strength < 0.45 ? 'light' : strength < 0.85 ? 'medium' : 'strong'}
            onChange={(event) => {
              const value = event.target.value;
              setEnabled(value !== 'off');
              if (value !== 'off') setStrength(value === 'light' ? 0.35 : value === 'medium' ? 0.65 : 1);
            }}>
            <option value="off">Off</option>
            <option value="light">Light</option>
            <option value="medium">Medium</option>
            <option value="strong">Strong</option>
          </select>
        </label>
        <label>Grid
          <select aria-label="Quantisation grid" value={subdivision}
            onChange={(event) => setSubdivision(event.target.value as typeof subdivision)}>
            <option value="quarter">1/4</option>
            <option value="eighth">1/8</option>
            <option value="sixteenth">1/16</option>
          </select>
        </label>
        {mode !== 'beat' && <>
          <label>Pitch correction
            <select aria-label="Pitch correction" value={pitchCorrection}
              onChange={(event) => updatePitchSettings(Number(event.target.value), scaleAwarePitch)}>
              <option value={0}>Raw</option>
              <option value={0.35}>Light</option>
              <option value={0.65}>Medium</option>
              <option value={1}>Strong</option>
            </select>
          </label>
          <label className="check-label">
            <input type="checkbox" checked={scaleAwarePitch}
              onChange={(event) => updatePitchSettings(
                event.target.checked && pitchCorrection === 0 ? 0.65 : pitchCorrection, event.target.checked,
              )} />
            Snap to project scale
          </label>
        </>}
        <label className="wide">Custom strength
          <input aria-label="Quantisation strength" type="range" min={0} max={1} step={0.05} value={strength}
            disabled={!enabled} onChange={(event) => setStrength(Number(event.target.value))} />
          <output>{Math.round(strength * 100)}%</output>
        </label>
        <label className="check-label">
          <input type="checkbox" checked={useCleaned} onChange={(event) => setUseCleaned(event.target.checked)} />
          Use cleaned audio
        </label>
        <label className="check-label">
          <input type="checkbox" checked={replaceResult} onChange={(event) => setReplaceResult(event.target.checked)} />
          Replace selected track result
        </label>
      </div>
      <div className="row">
        {needsSound && (
          <SoundPicker sounds={sounds} soundId={soundId} placeholder="Choose instrument"
            onPreview={onPreviewSound} onSelect={(sound) => { setSoundId(sound.id); onPreviewSound(sound); }} />
        )}
        <button className="wide" disabled={!sample || Boolean(progress) || (needsSound && !soundId)} onClick={() => void runRecognition()}>
          {progress ? 'Recognizing…' : `Recognize ${MODES.find((item) => item.value === mode)?.label}`}
        </button>
        {progress && <button className="secondary" onClick={cancel}>Cancel</button>}
        {sample && <>
          <button className="secondary" onClick={() => onPreviewSample({
            ...sample, samples: sample.originalSamples ?? sample.samples,
          })}>Preview original</button>
          <button className="secondary" onClick={() => onPreviewSample(sample)}>Preview cleaned</button>
        </>}
      </div>
      {project.recognitionTakes.length > 0 && (
        <label>Recognition track
          <select aria-label="Recognition track" value={activeTake?.id ?? ''}
            onChange={(event) => setActiveTakeId(event.target.value)}>
            {project.recognitionTakes.map((take) => (
              <option key={take.id} value={take.id}>
                {take.mode} · {take.sourceSampleId} · {new Date(take.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      )}
      {progress && (
        <div className="recognition-progress" role="status">
          <progress max={1} value={progress.progress} />
          <span>{progress.message}</span>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {activeTake && (
        <div className="recognition-results" aria-label="Recognition result">
          <div className="row performance-modes" role="group" aria-label="Performance">
            {PERFORMANCE_MODES.map((item) => (
              <button key={item.id} className={activeTake.performance === item.id ? 'on' : 'secondary'}
                aria-pressed={activeTake.performance === item.id} onClick={() => applyMode(item.id)}>
                {activeTake.mode === 'beat' ? item.beatLabel : item.label}
              </button>
            ))}
          </div>
          <p>
            {activeTake.originalEvents.length} {activeTake.mode === 'beat' ? 'percussion events' : 'notes'} ·
            {' '}<strong>{activeTake.modelId} v{activeTake.modelVersion}</strong>
          </p>
          {activeTake.detectedBpm && (
            <div className="row">
              <span>Detected {activeTake.detectedBpm} BPM</span>
              <button className="secondary" onClick={() => onBpmChange(activeTake.detectedBpm!, activeTake)}>Use detected tempo</button>
              {activeTake.tempoAlternatives.map((bpm) => (
                <button key={bpm} className="secondary" onClick={() => onBpmChange(bpm, activeTake)}>{bpm} BPM</button>
              ))}
            </div>
          )}
          <div className="row">
            <button className="secondary" onClick={undoEvents} disabled={!eventHistory.length}>Undo correction</button>
            <button className="secondary" onClick={restoreDetected}>Restore detected result</button>
            <button className="secondary" onClick={() => onApply(activeTake, { discardEdits: true })}>Reset track</button>
          </div>
          {activeTake.mode === 'beat' && activeTake.quantisedEvents.map((event) => 'type' in event ? (
            <label className="recognition-event" key={event.id}>
              {event.id} · {event.startSeconds.toFixed(2)}s
              <select aria-label={`Classify ${event.id}`} value={event.type}
                onChange={(change) => reclassify(event.id, change.target.value as PercussionClass)}>
                {PERCUSSION_CLASSES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select aria-label={`Sound for ${event.id}`}
                value={event.assignedSoundId ?? (activeTake ? soundForClass(activeTake, event.type) : SOUND_FOR_CLASS[event.type])}
                onChange={(change) => assignSound(event.id, change.target.value)}>
                {recordedFirst(sounds).map((sound) => <option key={sound.id} value={sound.id}>{sound.name}</option>)}
              </select>
              {event.confidence !== undefined && <span>{Math.round(event.confidence * 100)}% confidence</span>}
              <button className="secondary" onClick={() => quantiseEventStart(event.id, event.startSeconds)}>Quantise</button>
            </label>
          ) : null)}
          {activeTake.mode !== 'beat' && (
            <>
              <div className="row">
                <button className="secondary" onClick={() => transpose(-12)}>Octave down</button>
                <button className="secondary" onClick={() => transpose(-1)}>−1 semitone</button>
                <button className="secondary" aria-label="Transpose up one semitone" onClick={() => transpose(1)}>
                  <Icon name="transpose-up" className="inline-icon" /> 1 semitone
                </button>
                <button className="secondary" onClick={() => transpose(12)}>Octave up</button>
              </div>
              {activeTake.quantisedEvents.map((event) => 'pitch' in event ? (
                <div className="recognition-event" key={event.id}>
                  <span>{event.id} · raw {event.rawPitch?.toFixed(1) ?? event.pitch} · {Math.round(event.confidence * 100)}% confidence
                    {event.pitchBend?.length ? ` · ${event.pitchBend.length} bend points` : ''}</span>
                  <label>Pitch
                    <input aria-label={`Pitch for ${event.id}`} type="number" min={0} max={127} value={event.pitch}
                      onChange={(change) => correctOne(event, Number(change.target.value))} />
                  </label>
                  <label>Start (s)
                    <input aria-label={`Start time for ${event.id}`} type="number" min={0} step={0.01} value={event.startSeconds}
                      onChange={(change) => editNote(event.id, 'startSeconds', Number(change.target.value))} />
                  </label>
                  <label>Length (s)
                    <input aria-label={`Duration for ${event.id}`} type="number" min={0.05} step={0.01} value={event.durationSeconds}
                      onChange={(change) => editNote(event.id, 'durationSeconds', Number(change.target.value))} />
                  </label>
                  <button className="secondary" onClick={() => quantiseOne(event)}>Quantise</button>
                  <button className="secondary" disabled={event.durationSeconds < 0.12} onClick={() => splitNote(event)}>Split</button>
                  <button className="secondary" onClick={() => joinNote(event)}>Join next</button>
                  <button className="secondary" onClick={() => commitEvents(activeTake.quantisedEvents.filter((item) => item.id !== event.id))}>Delete</button>
                </div>
              ) : null)}
            </>
          )}
        </div>
      )}
    </section>
  );
}
