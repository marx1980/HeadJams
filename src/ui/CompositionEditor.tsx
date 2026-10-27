import { useMemo, useState } from 'react';
import {
  addArrangementClip, addNote, addPattern, arrangementLength, removeArrangementClip, removeNote,
  removePattern, renamePattern, selectPattern, totalSteps, type Project,
} from '../model/project';
import { chordPitches, isPitchInScale, SCALES, scalePitches, snapPitchToScale } from '../model/music';

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const CHORDS = ['major', 'minor', 'diminished', 'sus2', 'sus4'] as const;
const LOW_PITCH = 48;
const PITCH_COUNT = 36;

export function CompositionEditor({ project, onChange }: { project: Project; onChange: (project: Project) => void }) {
  const [channelId, setChannelId] = useState(project.channels[0]?.id ?? '');
  const [snap, setSnap] = useState(true);
  const [duration, setDuration] = useState(1);
  const [chordQuality, setChordQuality] = useState<(typeof CHORDS)[number]>('major');
  const [chordRoot, setChordRoot] = useState(60);
  const [chordStep, setChordStep] = useState(0);
  const channel = project.channels.find((item) => item.id === channelId) ?? project.channels[0];
  const scale = SCALES.find((item) => item.id === project.scaleId) ?? SCALES[0];
  const steps = totalSteps(project);
  const scaleRoots = useMemo(() => scalePitches(project.scaleRoot, scale, 3).filter((pitch) => pitch >= LOW_PITCH && pitch < LOW_PITCH + PITCH_COUNT), [project.scaleRoot, scale]);
  const bars = Math.max(1, Math.ceil(arrangementLength(project) / project.noteLength));
  const pitches = Array.from({ length: PITCH_COUNT }, (_, index) => LOW_PITCH + PITCH_COUNT - 1 - index);

  const updatePattern = (id: string) => onChange(selectPattern(project, id));
  const addPianoNote = (step: number, pitch: number) => {
    if (!channel) return;
    const existing = channel.notes?.find((note) => note.step === step && note.pitch === pitch);
    if (existing) {
      onChange(removeNote(project, channel.id, existing.id));
      return;
    }
    const adjustedPitch = snap ? snapPitchToScale(pitch, project.scaleRoot, scale) : pitch;
    onChange(addNote(project, channel.id, {
      id: `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      step, pitch: adjustedPitch, durationSteps: duration,
    }));
  };
  const addChord = () => {
    if (!channel) return;
    const updated = chordPitches(chordRoot, chordQuality).reduce((current, pitch, index) => {
      const chordPitch = snap ? snapPitchToScale(pitch, project.scaleRoot, scale) : pitch;
      return addNote(current, channel.id, {
        id: `note-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2)}`,
        step: chordStep, pitch: chordPitch, durationSteps: duration,
      });
    }, project);
    onChange(updated);
  };
  const appendArrangementClip = () => {
    const patternId = project.currentPatternId ?? project.patterns[0]?.id;
    if (!patternId) return;
    onChange(addArrangementClip(project, patternId, arrangementLength(project)));
  };

  return (
    <section className="composition panel" aria-label="Composition tools">
      <h2>Composition</h2>
      <div className="composition-controls">
        <div className="pattern-controls">
          <strong>Patterns</strong>
          {project.patterns.map((pattern) => (
            <button key={pattern.id} className={pattern.id === project.currentPatternId ? 'on' : 'secondary'}
              aria-pressed={pattern.id === project.currentPatternId} onClick={() => updatePattern(pattern.id)}>
              {pattern.name}
            </button>
          ))}
          <button onClick={() => onChange(addPattern(project, `Pattern ${project.patterns.length + 1}`))}>＋ New pattern</button>
          {project.currentPatternId && (
            <>
              <button className="secondary" onClick={() => {
                const current = project.patterns.find((pattern) => pattern.id === project.currentPatternId);
                const name = window.prompt('Pattern name', current?.name);
                if (name !== null && name !== undefined) onChange(renamePattern(project, project.currentPatternId!, name));
              }}>Rename</button>
              <button className="secondary" onClick={() => onChange(removePattern(project, project.currentPatternId!))}>Remove current</button>
            </>
          )}
        </div>
        <div className="scale-controls">
          <label>Root
            <select aria-label="Scale root" value={project.scaleRoot} onChange={(event) => onChange({ ...project, scaleRoot: Number(event.target.value) })}>
              {NOTE_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
            </select>
          </label>
          <label>Scale
            <select aria-label="Scale" value={scale.id} onChange={(event) => onChange({ ...project, scaleId: event.target.value })}>
              {SCALES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="check-label"><input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} /> Snap to scale</label>
        </div>
      </div>

      <div className="piano-controls">
        <label>Channel
          <select aria-label="Piano roll channel" value={channel?.id ?? ''} onChange={(event) => setChannelId(event.target.value)}>
            {project.channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Note duration
          <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
            {[1, 2, 4, 8].map((value) => <option key={value} value={value}>{value} step{value > 1 ? 's' : ''}</option>)}
          </select>
        </label>
      </div>
      {channel ? (
        <div className="piano-roll" role="grid" aria-label={`${channel.name} piano roll`}>
          {pitches.map((pitch) => (
            <div className="piano-row" role="row" key={pitch}>
              <span className="pitch-label">{NOTE_NAMES[pitch % 12]}{Math.floor(pitch / 12) - 1}</span>
              {Array.from({ length: steps }, (_, step) => {
                const activeNote = channel.notes?.find((note) => note.step === step && note.pitch === pitch);
                const inScale = isPitchInScale(pitch, project.scaleRoot, scale);
                return (
                  <button key={step} role="gridcell" aria-label={`${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}, step ${step + 1}`}
                    aria-pressed={Boolean(activeNote)} title={activeNote ? 'Remove note' : 'Add note'}
                    className={`piano-cell${inScale ? ' scale-note' : ''}${activeNote ? ' note-on' : ''}`}
                    onClick={() => addPianoNote(step, pitch)} />
                );
              })}
            </div>
          ))}
        </div>
      ) : <p className="hint">Add a channel to edit notes.</p>}

      {channel && (
        <div className="chord-controls">
          <strong>Chord assist</strong>
          <label>Root note
            <select value={chordRoot} onChange={(event) => setChordRoot(Number(event.target.value))}>
              {scaleRoots.map((pitch) => <option key={pitch} value={pitch}>{NOTE_NAMES[pitch % 12]}{Math.floor(pitch / 12) - 1}</option>)}
            </select>
          </label>
          <label>Chord
            <select value={chordQuality} onChange={(event) => setChordQuality(event.target.value as (typeof CHORDS)[number])}>
              {CHORDS.map((quality) => <option key={quality} value={quality}>{quality}</option>)}
            </select>
          </label>
          <label>Step
            <select value={chordStep} onChange={(event) => setChordStep(Number(event.target.value))}>
              {Array.from({ length: steps }, (_, step) => <option key={step} value={step}>{step + 1}</option>)}
            </select>
          </label>
          <button onClick={addChord}>＋ Add chord</button>
        </div>
      )}

      <div className="arrangement-controls">
        <div className="arrangement-heading">
          <strong>Arrangement timeline</strong>
          <button disabled={!project.patterns.length} onClick={appendArrangementClip}>＋ Add selected pattern</button>
        </div>
        {project.arrangement.length ? (
          <div className="timeline" style={{ gridTemplateColumns: `repeat(${bars}, minmax(110px, 1fr))` }}>
            {Array.from({ length: bars }, (_, bar) => <span className="timeline-bar" key={bar}>Bar {bar + 1}</span>)}
            {project.arrangement.map((clip) => {
              const pattern = project.patterns.find((item) => item.id === clip.patternId);
              return (
                <div className="timeline-clip" key={clip.id}
                  style={{ gridColumn: `${Math.floor(clip.startStep / project.noteLength) + 1} / span ${Math.max(1, Math.ceil(clip.lengthSteps / project.noteLength))}` }}>
                  {pattern?.name ?? 'Missing pattern'}
                  <button aria-label={`Remove ${pattern?.name ?? 'pattern'} clip`} onClick={() => onChange(removeArrangementClip(project, clip.id))}>×</button>
                </div>
              );
            })}
          </div>
        ) : <p className="hint">Add patterns to build a song timeline. Without clips, playback loops the selected pattern.</p>}
      </div>
    </section>
  );
}
