import { useEffect, useRef, useState } from 'react';
import type { CaptureResult, CaptureSession } from '../audio/capture';
import type { RecognitionMode } from '../model/recognition';
import type { Channel } from '../model/project';
import { guessCaptureKind } from '../library/captureGuess';
import { Icon } from './Icon';
import { barNames } from '../model/bars';
import { DrawPad, TapPad } from './TapDrawPads';
import type { NoteEvent, Project } from '../model/project';
import type { Rhythm } from '../library/tapRhythm';
import type { RhythmUse } from '../model/rhythmUse';

type Part = 'auto' | RecognitionMode | 'tap' | 'draw';
const PARTS: { id: Part; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'melody', label: 'Hum melody' },
  { id: 'bass', label: 'Hum bass' },
  { id: 'beat', label: 'Beatbox' },
  { id: 'tap', label: 'Tap rhythm' },
  { id: 'draw', label: 'Draw melody' },
];

const KINDS: { id: RecognitionMode; label: string }[] = [
  { id: 'melody', label: 'Melody' },
  { id: 'bass', label: 'Bass' },
  { id: 'beat', label: 'Beat' },
];

type Phase = 'idle' | 'starting' | 'recording' | 'review' | 'working';
const PLAY_ALONG_KEY = 'musicmaker.capturePlayAlong';

/**
 * Capture an idea or add a part (hum.md H1, H4): choose the part (or let it guess), record over the playing loop,
 * and it lands on the grid. Beatbox goes into a kit channel's lanes; Chords and Harmony open their Song tools.
 */
export function CaptureSheet({
  channels, beatChannels, hasSound, start, stop, onUse, onPlay, onOpenSong, project, startTap, beatZeroMs, onUseRhythm, onUseDrawn, onAudition, playing,
}: {
  /** Channels a melody or bass can be captured into. */
  channels: Channel[];
  /** Kit channels a beatbox can be captured into. */
  beatChannels: Channel[];
  /** The project already makes sound, so a mic will hear it unless headphones are on. */
  hasSound: boolean;
  /** Start recording over the loop, or over one bar looping on its own. */
  start: (metronome: boolean, bar?: number, playAlong?: boolean) => Promise<CaptureSession>;
  /** Called when recording ends or is cancelled, to stop playback and the metronome. */
  stop: () => void;
  onUse: (capture: CaptureResult, kind: RecognitionMode, into: string | undefined, bar?: number) => Promise<void>;
  onPlay: (capture: CaptureResult) => void;
  onOpenSong: (section: 'chords' | 'harmony') => void;
  project: Project;
  /** Play the loop (and metronome) for tapping; `stop` ends it. */
  startTap: (metronome: boolean) => Promise<void>;
  beatZeroMs: () => number | undefined;
  onUseRhythm: (rhythm: Rhythm, use: RhythmUse, into: string | undefined) => void;
  onUseDrawn: (notes: NoteEvent[]) => void;
  onAudition: (preview?: Project) => void;
  playing: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [part, setPart] = useState<Part>('auto');
  const [into, setInto] = useState('new');
  const [bar, setBar] = useState('all');
  const barIndex = bar !== 'all' && Number(bar) < project.loopBars ? Number(bar) : undefined;
  const recordedBar = useRef<number | undefined>(undefined);
  const pad = part === 'tap' || part === 'draw';
  const targets = part === 'beat' ? beatChannels : part === 'auto' ? [...channels, ...beatChannels] : channels;
  const intoValue = targets.some((channel) => channel.id === into) ? into : 'new';
  const [metronome, setMetronome] = useState(true);
  // Hearing the existing tracks while humming is optional (off by default): the metronome alone keeps time.
  const [playAlong, setPlayAlongState] = useState(() => { try { return localStorage.getItem(PLAY_ALONG_KEY) === '1'; } catch { return false; } });
  const setPlayAlong = (value: boolean) => {
    setPlayAlongState(value);
    try { localStorage.setItem(PLAY_ALONG_KEY, value ? '1' : '0'); } catch { /* storage unavailable */ }
  };
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
      recordedBar.current = barIndex;
      setPhase('starting');
      session.current = await start(metronome, barIndex, hasSound && playAlong);
      const startedAt = Date.now();
      setElapsed(0);
      timer.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
      setPhase('recording');
    } catch (reason) {
      stop();
      setPhase('idle');
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
      if (part === 'melody' || part === 'bass' || part === 'beat') { await use(part, result); return; }
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
      await onUse(recorded, kind, fits ? intoValue : undefined, recordedBar.current);
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
            {!pad && (
              <label>Into
                <select id="capture-into" value={intoValue} onChange={(event) => setInto(event.target.value)}>
                  <option value="new">{part === 'beat' ? 'New kit' : 'New track'}</option>
                  {targets.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                </select>
              </label>
            )}
            {!pad && project.loopBars > 1 && (
              <label>Bar
                <select id="capture-bar" value={barIndex === undefined ? 'all' : String(barIndex)} onChange={(event) => setBar(event.target.value)}>
                  <option value="all">All</option>
                  {Array.from({ length: project.loopBars }, (_, index) => (
                    <option key={index} value={index}>{barNames(project)[index] || `Bar ${index + 1}`}</option>
                  ))}
                </select>
              </label>
            )}
            {!pad && hasSound && (
              <label className="check-label"><input id="capture-play-along" type="checkbox" checked={playAlong}
                onChange={(event) => setPlayAlong(event.target.checked)} /> Play along</label>
            )}
            {part !== 'draw' && (
              <label className="check-label"><input type="checkbox" checked={metronome} onChange={(event) => setMetronome(event.target.checked)} /> Metronome</label>
            )}
          </div>
          {hasSound && !pad && playAlong && <p className="capture-headphones"><Icon name="headphones" className="inline-icon" /> Headphones</p>}
          {part === 'tap' && <TapPad project={project} start={() => startTap(metronome)} stop={stop} beatZeroMs={beatZeroMs} onUse={onUseRhythm} />}
          {part === 'draw' && <DrawPad project={project} playing={playing} onAudition={onAudition} onUse={onUseDrawn} />}
          {!pad && <button id="capture-record" className="capture-main" onClick={() => void record()}><Icon name="record" className="inline-icon" /> Record</button>}
          <div className="capture-more">
            <button className="secondary" onClick={() => onOpenSong('chords')}>Edit chords</button>
            <button className="secondary" onClick={() => onOpenSong('harmony')}>Edit harmony</button>
          </div>
        </>
      )}
      {phase === 'starting' && (
        <button id="capture-starting" className="capture-main" disabled><Icon name="record" className="inline-icon" /> Starting…</button>
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
