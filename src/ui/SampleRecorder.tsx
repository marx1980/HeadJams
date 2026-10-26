import { useEffect, useRef, useState } from 'react';
import type { SampleData } from '../library/sampleStorage';
import { normalizeSample, trimSample } from '../library/sampleStorage';

type Props = { onSave: (name: string, sample: SampleData) => Promise<void>; onEvent: (event: string) => void };

export function SampleRecorder({ onSave, onEvent }: Props) {
  const [name, setName] = useState('');
  const [sample, setSample] = useState<SampleData | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(1);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const stream = useRef<MediaStream | undefined>(undefined);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => () => {
    recorder.current?.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const decode = async (blob: Blob) => {
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      const samples = new Float32Array(buffer.length);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) samples[i] += data[i] / buffer.numberOfChannels;
      }
      setSample({ sampleRate: buffer.sampleRate, samples });
      setStart(0);
      setEnd(1);
      setError('');
    } finally {
      await context.close();
    }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      await decode(file);
      setName(file.name.replace(/\.[^.]+$/, ''));
      onEvent('sample-import');
    } catch {
      setError('This audio file could not be decoded. Try a WAV, MP3, or OGG file.');
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    setError('');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];
      const next = new MediaRecorder(media);
      recorder.current = next;
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => {
        void decode(new Blob(chunks.current, { type: next.mimeType })).catch(() => setError('The recording could not be decoded.'));
        media.getTracks().forEach((track) => track.stop());
        stream.current = undefined;
      };
      next.start();
      setSample(null);
      setRecording(true);
      onEvent('record-start');
    } catch {
      setError('Microphone access was unavailable or denied.');
    }
  };

  const stopRecording = () => {
    recorder.current?.stop();
    setRecording(false);
    onEvent('record-stop');
  };

  const save = async () => {
    if (!sample) return;
    setBusy(true);
    try {
      await onSave(name.trim() || 'My sample', {
        sampleRate: sample.sampleRate,
        samples: normalizeSample(trimSample(sample.samples, start * sample.samples.length, end * sample.samples.length)),
      });
      setError('');
      setSample(null);
      setName('');
    } catch {
      setError('The sample could not be saved. Check that browser storage is available.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel sample-recorder" aria-label="Record or import a sample">
      <h2>Record or import a sample</h2>
      <div className="row">
        <label className="file-label">Import audio
          <input type="file" accept="audio/*,.wav,.mp3,.ogg" disabled={busy} onChange={(e) => void importFile(e.target.files?.[0])} />
        </label>
        <button id="record-start" disabled={busy || recording} onClick={() => void startRecording()}>● Record</button>
        <button disabled={!recording} onClick={stopRecording}>Stop recording</button>
      </div>
      {sample && (
        <>
          <label>Sample name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label>Trim start ({(start * sample.samples.length / sample.sampleRate).toFixed(2)}s)
            <input aria-label="Trim start" type="range" min={0} max={Math.max(0, end - 0.01)} step={0.005} value={start}
              onChange={(e) => setStart(Math.min(Number(e.target.value), end - 0.01))} />
          </label>
          <label>Trim end ({(end * sample.samples.length / sample.sampleRate).toFixed(2)}s)
            <input aria-label="Trim end" type="range" min={Math.min(1, start + 0.01)} max={1} step={0.005} value={end}
              onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 0.01))} />
          </label>
          <button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Normalize and save to library'}</button>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
