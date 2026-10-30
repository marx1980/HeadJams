import { useEffect, useMemo, useRef, useState } from 'react';
import { createChannel, totalSteps, type NoteEvent, type Project } from '../model/project';
import { RHYTHM_USES, rhythmTargets, type RhythmUse } from '../model/rhythmUse';
import { rhythmSteps, tapsToRhythm, type Rhythm } from '../library/tapRhythm';
import { contourToNotes, type ContourPoint, type DrawMode } from '../library/drawMelody';
import { SCALES } from '../model/music';
import { Icon } from './Icon';

/** Tap pad (hum.md H5): tap along with the loop, then use the rhythm for drums, bass, strum or pulses. */
export function TapPad({ project, start, stop, beatZeroMs, onUse }: {
  project: Project;
  start: () => Promise<void>;
  stop: () => void;
  beatZeroMs: () => number | undefined;
  onUse: (rhythm: Rhythm, use: RhythmUse, into: string | undefined) => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'tapping' | 'done'>('idle');
  const [taps, setTaps] = useState<{ ms: number }[]>([]);
  const [rhythm, setRhythm] = useState<Rhythm>();
  const [use, setUse] = useState<RhythmUse>('kick');
  const [into, setInto] = useState('new');
  const tapsRef = useRef<{ ms: number }[]>([]);
  const tappingRef = useRef(false);
  useEffect(() => () => { if (tappingRef.current) stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = async () => {
    tapsRef.current = [];
    setTaps([]);
    await start();
    tappingRef.current = true;
    setPhase('tapping');
  };
  const tap = (ms: number) => {
    tapsRef.current = [...tapsRef.current, { ms }];
    setTaps(tapsRef.current);
  };
  const finish = () => {
    const zero = beatZeroMs();
    tappingRef.current = false;
    stop();
    const length = totalSteps(project);
    const found = zero === undefined ? undefined
      : tapsToRhythm(tapsRef.current.filter((item) => item.ms >= zero - 100), { bpm: project.bpm, stepsPerBar: project.noteLength, totalSteps: length, beatZeroMs: zero });
    setRhythm(found);
    setPhase('done');
  };
  const targets = rhythmTargets(project, use);
  const intoValue = targets.some((channel) => channel.id === into) ? into : 'new';

  if (phase === 'tapping') {
    return (
      <div className="tap-pad-wrap">
        <button id="tap-pad" className="tap-pad" aria-label="Tap"
          onPointerDown={(event) => { event.preventDefault(); tap(event.timeStamp); }}
          onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); tap(event.timeStamp); } }}>
          {taps.length}
        </button>
        <button id="tap-stop" className="capture-main recording" onClick={finish}><Icon name="stop" className="inline-icon" /> Stop</button>
      </div>
    );
  }
  if (phase === 'done' && rhythm && rhythmSteps(rhythm).length) {
    const cells = Array.from({ length: rhythm.length }, (_, step) => rhythm.hits[step]);
    return (
      <div className="tap-result">
        <div className="tap-steps" aria-label="Tapped rhythm" style={{ gridTemplateColumns: `repeat(${Math.min(16, rhythm.length)}, 1fr)` }}>
          {cells.map((strength, step) => <span key={step} className={strength ? 'on' : ''} style={strength ? { opacity: 0.45 + strength * 0.55 } : undefined} />)}
        </div>
        <div className="capture-options">
          <label>Use for
            <select id="tap-use" value={use} onChange={(event) => setUse(event.target.value as RhythmUse)}>
              {RHYTHM_USES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label>Into
            <select id="tap-into" value={intoValue} onChange={(event) => setInto(event.target.value)}>
              <option value="new">{use === 'kick' || use === 'snare' || use === 'hat' ? 'New kit' : 'New track'}</option>
              {targets.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
            </select>
          </label>
        </div>
        <div className="capture-more">
          <button className="secondary" onClick={() => void begin()}><Icon name="record" className="inline-icon" /> Again</button>
          <button id="tap-use-btn" onClick={() => onUse(rhythm, use, intoValue === 'new' ? undefined : intoValue)}>Use</button>
        </div>
      </div>
    );
  }
  return (
    <button id="tap-start" className="capture-main" onClick={() => void begin()}>
      <Icon name="play" className="inline-icon" /> {phase === 'done' ? 'Again' : 'Start'}
    </button>
  );
}

const DRAW_MODES: { id: DrawMode; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'cleaned', label: 'Cleaned' },
  { id: 'tight', label: 'Tight' },
];
const PAD_HEIGHT = 220;
const RANGE = 24;

/** Draw pad (hum.md H5): draw a contour over the loop, hear it, nudge notes, then use it as a melody. */
export function DrawPad({ project, playing, onAudition, onUse }: {
  project: Project;
  playing: boolean;
  onAudition: (preview?: Project) => void;
  onUse: (notes: NoteEvent[]) => void;
}) {
  const [strokes, setStrokes] = useState<ContourPoint[][]>([]);
  const [mode, setMode] = useState<DrawMode>('cleaned');
  const [nudges, setNudges] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState(0);
  const [auditioning, setAuditioning] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  const length = totalSteps(project);
  const low = 55 + project.scaleRoot;
  const key = { root: project.scaleRoot, scaleId: project.scaleId };
  useEffect(() => { if (!playing) setAuditioning(false); }, [playing]);

  const base = useMemo(() => contourToNotes(strokes, length, mode, key, project.noteLength),
    [strokes, length, mode, key.root, key.scaleId, project.noteLength]); // eslint-disable-line react-hooks/exhaustive-deps
  const notes = base.map((note, index) => ({ ...note, pitch: note.pitch + (nudges[index] ?? 0) }));
  const active = Math.min(selected, Math.max(0, notes.length - 1));

  const point = (event: React.PointerEvent): ContourPoint | undefined => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return undefined;
    const x = ((event.clientX - box.left) / box.width) * length;
    const y = low + RANGE * (1 - (event.clientY - box.top) / box.height);
    return { x: Math.max(0, Math.min(length - 0.001, x)), y: Math.max(low, Math.min(low + RANGE, y)) };
  };
  const preview = (list: NoteEvent[]): Project => ({
    ...project,
    arrangement: [],
    channels: [...project.channels, { ...createChannel('draw-preview', 'Drawn melody', 'grand-piano', length), notes: list }],
  });
  const scale = SCALES.find((item) => item.id === project.scaleId) ?? SCALES[0];
  const yOf = (pitch: number) => (1 - (pitch - low) / RANGE) * PAD_HEIGHT;

  return (
    <div className="draw-pad">
      <svg ref={svg} className="draw-canvas" role="img" aria-label="Draw a melody" viewBox={`0 0 ${length} ${PAD_HEIGHT}`} preserveAspectRatio="none"
        onPointerDown={(event) => {
          const p = point(event);
          if (!p) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          setNudges({});
          setStrokes((current) => [...current, [p]]);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const p = point(event);
          if (p) setStrokes((current) => [...current.slice(0, -1), [...(current.at(-1) ?? []), p]]);
        }}
        onPointerUp={() => { drawing.current = false; }}>
        {Array.from({ length: RANGE + 1 }, (_, i) => low + i).filter((pitch) => scale.intervals.includes(((pitch - project.scaleRoot) % 12 + 12) % 12))
          .map((pitch) => <line key={pitch} x1={0} x2={length} y1={yOf(pitch)} y2={yOf(pitch)}
            className={((pitch - project.scaleRoot) % 12 + 12) % 12 === 0 ? 'draw-tonic' : 'draw-line'} />)}
        {Array.from({ length: Math.floor(length / project.noteLength) + 1 }, (_, bar) => (
          <line key={`bar-${bar}`} x1={bar * project.noteLength} x2={bar * project.noteLength} y1={0} y2={PAD_HEIGHT} className="draw-bar" />
        ))}
        {notes.map((note, index) => (
          <rect key={note.id} x={note.step} y={yOf(note.pitch + 0.5)} width={note.durationSteps} height={PAD_HEIGHT / RANGE}
            className={index === active ? 'draw-note active' : 'draw-note'} />
        ))}
        {strokes.map((stroke, index) => (
          <polyline key={index} className="draw-stroke" points={stroke.map((p) => `${p.x},${yOf(p.y)}`).join(' ')} />
        ))}
      </svg>
      <div className="draw-modes" role="group" aria-label="Performance">
        {DRAW_MODES.map((item) => (
          <button key={item.id} className={mode === item.id ? 'on' : 'secondary'} aria-pressed={mode === item.id}
            onClick={() => { setMode(item.id); setNudges({}); }}>{item.label}</button>
        ))}
      </div>
      <div className="draw-nudge">
        <button className="secondary" aria-label="Previous note" disabled={active <= 0} onClick={() => setSelected(active - 1)}><Icon name="back" className="inline-icon" /></button>
        <span className="draw-note-label">{notes.length ? `${active + 1}/${notes.length}` : '0/0'}</span>
        <button className="secondary" aria-label="Next note" disabled={active >= notes.length - 1} onClick={() => setSelected(active + 1)}><Icon name="forward" className="inline-icon" /></button>
        <button className="secondary" disabled={!notes.length} onClick={() => setNudges({ ...nudges, [active]: (nudges[active] ?? 0) - 1 })}>Lower</button>
        <button className="secondary" disabled={!notes.length} onClick={() => setNudges({ ...nudges, [active]: (nudges[active] ?? 0) + 1 })}>Higher</button>
      </div>
      <div className="draw-actions">
        <button className="secondary" aria-label="Clear drawing" disabled={!strokes.length}
          onClick={() => { setStrokes([]); setNudges({}); setSelected(0); }}><Icon name="close" className="inline-icon" /></button>
        <button className="secondary" aria-label={auditioning && playing ? 'Stop' : 'Play'} disabled={!notes.length}
          onClick={() => {
            if (auditioning && playing) { onAudition(undefined); setAuditioning(false); return; }
            setAuditioning(true);
            onAudition(preview(notes));
          }}><Icon name={auditioning && playing ? 'stop' : 'play'} className="inline-icon" /></button>
        <button id="draw-use" disabled={!notes.length} onClick={() => { if (auditioning) onAudition(undefined); onUse(notes); }}>Use</button>
      </div>
    </div>
  );
}
