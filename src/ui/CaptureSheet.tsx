import { useEffect, useRef, useState } from 'react';
import type { CaptureResult, CaptureSession } from '../audio/capture';
import type { RecognitionMode } from '../model/recognition';
import type { Channel } from '../model/project';
import { guessCaptureKind } from '../library/captureGuess';
import { Icon } from './Icon';

type Part = 'auto' | RecognitionMode;
const PARTS: { id: Part; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'melody', label: 'Hum melody' },
  { id: 'bass', label: 'Hum bass' },
  { id: 'beat', label: 'Beatbox' },
];

const KINDS: { id: RecognitionMode; label: string }[] = [
  { id: 'melody', label: 'Melody' },
  { id: 'bass', label: 'Bass' },
  { id: 'beat', label: 'Beat' },
];

type Phase = 'idle' | 'recording' | 'review' | 'working';

/**
 * Capture an idea or add a part (hum.md H1, H4): choose the part (or let it guess), record over the playing loop,
 * and it lands on the grid. Beatbox goes into a kit channel's lanes; Chords and Harmony open their Song tools.
 */
export function CaptureSheet({ channels, beatChannels, hasSound, start, stop, onUse, onPlay, onOpenSong }: {
  /** Channels a melody or bass can be captured into. */
  channels: Channel[];
  /** Kit channels a beatbox can be captured into. */
  beatChannels: Channel[];
  /** The project already makes sound, so a mic will hear it unless headphones are on. */
  hasSound: boolean;
  start: (metronome: boolean) => Promise<CaptureSession>;
  /** Called when recording ends or is cancelled, to stop playback and the metronome. */
  stop: () => void;
  onUse: (capture: CaptureResult, kind: RecognitionMode, into: string | undefined) => Promise<void>;
  onPlay: (capture: CaptureResult) => void;
  onOpenSong: (section: 'chords' | 'harmony') => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [part, setPart] = useState<Part>('auto');
  const [into, setInto] = useState('new');
  const targets = part === 'beat' ? beatChannels : part === 'auto' ? [...channels, ...beatChannels] : channels;
  const intoValue = targets.some((channel) => channel.id === into) ? into : 'new';
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
      if (part !== 'auto') { await use(part, result); return; }
      setGuess(guessCaptureKind(result.samples, result.sampleRate));
      setPhase('review');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Recording failed.');
      setPhase('idle');
    }
  };

  const use = async (kind: RecognitionMode, recorded = capture) => {
    if (!recorded) return;
    setPhase('working');
    setError('');
    // Beatbox only goes into kit channels; melody and bass only into melodic channels.
    const fits = (kind === 'beat' ? beatChannels : channels).some((channel) => channel.id === intoValue);
    try {
      await onUse(recorded, kind, fits ? intoValue : undefined);
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
            <label>Part
              <select id="capture-part" value={part} onChange={(event) => setPart(event.target.value as Part)}>
                {PARTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>Into
              <select id="capture-into" value={intoValue} onChange={(event) => setInto(event.target.value)}>
                <option value="new">{part === 'beat' ? 'New kit' : 'New track'}</option>
                {targets.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
              </select>
            </label>
            <label className="check-label"><input type="checkbox" checked={metronome} onChange={(event) => setMetronome(event.target.checked)} /> Metronome</label>
          </div>
          {hasSound && <p className="capture-headphones"><Icon name="headphones" className="inline-icon" /> Headphones</p>}
          <button id="capture-record" className="capture-main" onClick={() => void record()}><Icon name="record" className="inline-icon" /> Record</button>
          <div className="capture-more">
            <button className="secondary" onClick={() => onOpenSong('chords')}>Chords</button>
            <button className="secondary" onClick={() => onOpenSong('harmony')}>Harmony</button>
          </div>
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
