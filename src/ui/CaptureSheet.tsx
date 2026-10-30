import { useEffect, useRef, useState } from 'react';
import type { CaptureResult, CaptureSession } from '../audio/capture';
import type { RecognitionMode } from '../model/recognition';
import type { Channel } from '../model/project';
import { guessCaptureKind } from '../library/captureGuess';
import { Icon } from './Icon';

const KINDS: { id: RecognitionMode; label: string }[] = [
  { id: 'melody', label: 'Melody' },
  { id: 'bass', label: 'Bass' },
  { id: 'beat', label: 'Beat' },
];

type Phase = 'idle' | 'recording' | 'review' | 'working';

/** Capture an idea in one flow: record → confirm Melody/Bass/Beat → it lands on the grid (hum.md H1). */
export function CaptureSheet({ channels, start, stop, onUse, onPlay }: {
  /** Channels a melody or bass can be captured into. */
  channels: Channel[];
  start: (metronome: boolean) => Promise<CaptureSession>;
  /** Called when recording ends or is cancelled, to stop playback and the metronome. */
  stop: () => void;
  onUse: (capture: CaptureResult, kind: RecognitionMode, into: string | undefined) => Promise<void>;
  onPlay: (capture: CaptureResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [into, setInto] = useState('new');
  const [metronome, setMetronome] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [capture, setCapture] = useState<CaptureResult>();
  const [guess, setGuess] = useState<RecognitionMode>('melody');
  const [error, setError] = useState('');
  const session = useRef<CaptureSession | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    window.clearInterval(timer.current);
    if (session.current) { session.current.cancel(); stop(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const record = async () => {
    setError('');
    try {
      session.current = await start(metronome);
      const startedAt = Date.now();
      setElapsed(0);
      timer.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
      setPhase('recording');
    } catch (reason) {
      stop();
      setError(reason instanceof Error && !/permission|denied/i.test(reason.message)
        ? reason.message : 'Microphone access failed. Check browser permissions and try again.');
    }
  };

  const finish = async () => {
    window.clearInterval(timer.current);
    const current = session.current;
    session.current = undefined;
    stop();
    if (!current) return;
    try {
      const result = await current.stop();
      setCapture(result);
      setGuess(guessCaptureKind(result.samples, result.sampleRate));
      setPhase('review');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Recording failed.');
      setPhase('idle');
    }
  };

  const use = async (kind: RecognitionMode) => {
    if (!capture) return;
    setPhase('working');
    setError('');
    try {
      await onUse(capture, kind, into === 'new' || kind === 'beat' ? undefined : into);
      setCapture(undefined);
      setPhase('idle');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Recognition failed.');
      setPhase('review');
    }
  };

  return (
    <div className="capture-sheet">
      {phase === 'idle' && (
        <>
          <div className="capture-options">
            <label>Into
              <select id="capture-into" value={into} onChange={(event) => setInto(event.target.value)}>
                <option value="new">New track</option>
                {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
              </select>
            </label>
            <label className="check-label"><input type="checkbox" checked={metronome} onChange={(event) => setMetronome(event.target.checked)} /> Metronome</label>
          </div>
          <button id="capture-record" className="capture-main" onClick={() => void record()}><Icon name="record" className="inline-icon" /> Record</button>
        </>
      )}
      {phase === 'recording' && (
        <button id="capture-stop" className="capture-main recording" onClick={() => void finish()}>
          <Icon name="stop" className="inline-icon" /> Stop · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </button>
      )}
      {phase === 'review' && capture && (
        <>
          <div className="capture-kinds" role="group" aria-label="What was it">
            {KINDS.map((kind) => (
              <button key={kind.id} className={kind.id === guess ? 'on' : 'secondary'} aria-pressed={kind.id === guess}
                onClick={() => void use(kind.id)}>{kind.label}</button>
            ))}
          </div>
          <div className="capture-actions">
            <button className="secondary" onClick={() => onPlay(capture)}><Icon name="play" className="inline-icon" /> Play</button>
            <button className="secondary" onClick={() => { setCapture(undefined); setPhase('idle'); }}><Icon name="close" className="inline-icon" /> Discard</button>
          </div>
        </>
      )}
      {phase === 'working' && <p className="capture-status" role="status">Recognising…</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
