import { useEffect, useMemo, useState } from 'react';
import {
  addArrangementClip, addChordEvent, addNote, addPattern, arrangementLength, MAX_CHANNELS, removeArrangementClip, removeChordEvent, removeNote,
  removePattern, renamePattern, scaleChannelNoteDurations, selectPattern, shiftChannelNotes, totalSteps,
  transposeChannelNotes, type Project,
} from '../model/project';
import type { NoteEvent } from '../model/project';
import {
  CHORD_ARTICULATIONS, CHORD_QUALITIES, chordPitches, formatChordSymbol, isPitchInScale, SCALES,
  scalePitches, snapPitchToScale, type ChordArticulation, type ChordQuality,
} from '../model/music';
import { findSound } from '../library/sounds';
import { suggestChordsFromNotes, type ChordChoice, type ChordSuggestion } from '../library/chordSuggestion';
import {
  addGeneratedBassChannel, addGeneratedChordChannel, generateBassFromChords, generateBassFromMelody,
  removeGeneratedTrack, replaceGeneratedBassChannel, replaceGeneratedChordChannel,
} from '../model/arrangement';

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const CHORDS = ['major', 'minor', 'diminished', 'sus2', 'sus4'] as const;
const LOW_PITCH = 48;
const PITCH_COUNT = 36;

export function PianoRoll({ project, onChange, channelId }: { project: Project; onChange: (project: Project) => void; channelId: string }) {
  const [snap, setSnap] = useState(true);
  const [duration, setDuration] = useState(1);
  const [focusedCell, setFocusedCell] = useState({ step: 0, pitch: LOW_PITCH + PITCH_COUNT - 1 });
  const [chordQuality, setChordQuality] = useState<(typeof CHORDS)[number]>('major');
  const [chordRoot, setChordRoot] = useState(60);
  const [chordStep, setChordStep] = useState(0);
  const [guitarRoot, setGuitarRoot] = useState(60);
  const [guitarQuality, setGuitarQuality] = useState<ChordQuality>('major');
  const [guitarArticulation, setGuitarArticulation] = useState<ChordArticulation>('down-strum');
  const [guitarStep, setGuitarStep] = useState(0);
  const channel = project.channels.find((item) => item.id === channelId);
  const guitarChordMode = channel ? findSound(project, channel.soundId)?.playbackMode === 'chord' : false;
  const scale = SCALES.find((item) => item.id === project.scaleId) ?? SCALES[0];
  const steps = totalSteps(project);
  const activeFocusedStep = Math.min(focusedCell.step, steps - 1);
  const scaleRoots = useMemo(() => scalePitches(LOW_PITCH + project.scaleRoot, scale, 3).filter((pitch) => pitch >= LOW_PITCH && pitch < LOW_PITCH + PITCH_COUNT), [project.scaleRoot, scale]);
  const activeChordRoot = scaleRoots.includes(chordRoot) ? chordRoot : (scaleRoots[0] ?? 60);
  const activeGuitarStep = Math.min(guitarStep, steps - 1);
  const addGuitarChord = () => {
    if (!channel) return;
    onChange(addChordEvent(project, channel.id, {
      id: `chord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      step: activeGuitarStep,
      root: guitarRoot,
      quality: guitarQuality,
      articulation: guitarArticulation,
      durationSteps: duration,
    }));
  };
  const pitches = Array.from({ length: PITCH_COUNT }, (_, index) => LOW_PITCH + PITCH_COUNT - 1 - index);

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
    const updated = chordPitches(activeChordRoot, chordQuality).reduce((current, pitch, index) => {
      const chordPitch = snap ? snapPitchToScale(pitch, project.scaleRoot, scale) : pitch;
      return addNote(current, channel.id, {
        id: `note-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2)}`,
        step: chordStep, pitch: chordPitch, durationSteps: duration,
      });
    }, project);
    onChange(updated);
  };
  const movePianoFocus = (event: React.KeyboardEvent<HTMLButtonElement>, step: number, pitch: number) => {
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const nextStep = Math.max(0, Math.min(steps - 1, step + offset[0]));
    const nextPitch = Math.max(LOW_PITCH, Math.min(LOW_PITCH + PITCH_COUNT - 1, pitch + offset[1]));
    setFocusedCell({ step: nextStep, pitch: nextPitch });
    event.currentTarget.closest('.piano-roll')
      ?.querySelector<HTMLButtonElement>(`[data-step="${nextStep}"][data-pitch="${nextPitch}"]`)
      ?.focus();
  };
  return (
    <div className="piano-editor">
      <div className="piano-controls">
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
        <label>Note duration
          <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
            {[1, 2, 4, 8].map((value) => <option key={value} value={value}>{value} step{value > 1 ? 's' : ''}</option>)}
          </select>
        </label>
      </div>
      {channel && (
        <details className="pitch-time-controls" aria-label="Pitch and time tools">
          <summary>Pitch and time tools</summary>
          <button className="secondary" aria-label="Transpose notes down one semitone"
            onClick={() => onChange(transposeChannelNotes(project, channel.id, -1))}>−1 semitone</button>
          <button className="secondary" aria-label="Transpose notes up one semitone"
            onClick={() => onChange(transposeChannelNotes(project, channel.id, 1))}>＋1 semitone</button>
          <button className="secondary" aria-label="Shift notes one step earlier"
            onClick={() => onChange(shiftChannelNotes(project, channel.id, -1))}>← Shift 1 step</button>
          <button className="secondary" aria-label="Shift notes one step later"
            onClick={() => onChange(shiftChannelNotes(project, channel.id, 1))}>Shift 1 step →</button>
          <button className="secondary" aria-label="Halve note durations"
            onClick={() => onChange(scaleChannelNoteDurations(project, channel.id, 0.5))}>½ duration</button>
          <button className="secondary" aria-label="Double note durations"
            onClick={() => onChange(scaleChannelNoteDurations(project, channel.id, 2))}>2× duration</button>
        </details>
      )}
      {channel ? (
        <div className="piano-roll" role="grid" aria-label={`${channel.name} piano roll`}>
          {pitches.map((pitch) => (
            <div className="piano-row" role="row" key={pitch} style={{ gridTemplateColumns: `44px repeat(${steps}, minmax(22px, 1fr))` }}>
              <span className="pitch-label">{NOTE_NAMES[pitch % 12]}{Math.floor(pitch / 12) - 1}</span>
              {Array.from({ length: steps }, (_, step) => {
                const activeNote = channel.notes?.find((note) => note.step === step && note.pitch === pitch);
                const inScale = isPitchInScale(pitch, project.scaleRoot, scale);
                const confidence = activeNote?.confidence;
                const noteDetails = [
                  confidence === undefined ? '' : `${confidence < 0.7 ? 'low confidence ' : 'confidence '}${Math.round(confidence * 100)}%`,
                  activeNote?.pitchBend?.length ? `${activeNote.pitchBend.length} pitch bend point${activeNote.pitchBend.length === 1 ? '' : 's'}` : '',
                  activeNote?.sourceTakeId ? `source take ${activeNote.sourceTakeId}` : '',
                ].filter(Boolean).join(', ');
                return (
                  <button key={step} role="gridcell"
                    aria-label={`${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}, step ${step + 1}${noteDetails ? `, ${noteDetails}` : ''}`}
                    data-step={step} data-pitch={pitch}
                    tabIndex={activeFocusedStep === step && focusedCell.pitch === pitch ? 0 : -1}
                    aria-pressed={Boolean(activeNote)}
                    title={activeNote ? `Remove note${noteDetails ? ` · ${noteDetails}` : ''}` : 'Add note'}
                    className={`piano-cell${inScale ? ' scale-note' : ''}${activeNote ? ' note-on' : ''}${confidence !== undefined && confidence < 0.7 ? ' low-confidence' : ''}${activeNote?.pitchBend?.length ? ' has-pitch-bend' : ''}`}
                    id={pitch === pitches[0] && step === 0 ? 'piano-roll-cell' : undefined}
                    onClick={() => addPianoNote(step, pitch)}
                    onKeyDown={(event) => movePianoFocus(event, step, pitch)}>
                    {confidence !== undefined && confidence < 0.7 ? <span className="confidence-indicator" aria-hidden="true">!</span> : null}
                    {activeNote?.pitchBend?.length ? <span className="pitch-bend-indicator" aria-hidden="true">↝</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : <p className="hint">Add a channel to edit notes.</p>}

      {channel && guitarChordMode && (
        <div className="chord-controls" aria-label="Guitar chord editor">
          <strong>Guitar chords</strong>
          <label>Chord root
            <select aria-label="Guitar chord root" value={guitarRoot} onChange={(event) => setGuitarRoot(Number(event.target.value))}>
              {Array.from({ length: 25 }, (_, index) => 48 + index).map((pitch) => (
                <option key={pitch} value={pitch}>{NOTE_NAMES[pitch % 12]}{Math.floor(pitch / 12) - 1}</option>
              ))}
            </select>
          </label>
          <label>Chord
            <select aria-label="Guitar chord quality" value={guitarQuality} onChange={(event) => setGuitarQuality(event.target.value as ChordQuality)}>
              {CHORD_QUALITIES.map((quality) => <option key={quality.id} value={quality.id}>{quality.label}</option>)}
            </select>
          </label>
          <label>Articulation
            <select aria-label="Guitar chord articulation" value={guitarArticulation}
              onChange={(event) => setGuitarArticulation(event.target.value as ChordArticulation)}>
              {CHORD_ARTICULATIONS.map((articulation) => <option key={articulation.id} value={articulation.id}>{articulation.label}</option>)}
            </select>
          </label>
          <label>Step
            <select aria-label="Guitar chord step" value={activeGuitarStep} onChange={(event) => setGuitarStep(Number(event.target.value))}>
              {Array.from({ length: steps }, (_, step) => <option key={step} value={step}>{step + 1}</option>)}
            </select>
          </label>
          <button onClick={addGuitarChord}>＋ Add guitar chord</button>
          <div className="chord-event-list" aria-label="Guitar chord events">
            {(channel.chordEvents ?? []).map((event) => (
              <button key={event.id} className="secondary"
                aria-label={`Remove ${formatChordSymbol(event.root, event.quality, event.articulation)} ${event.articulation} at step ${event.step + 1}`}
                onClick={() => onChange(removeChordEvent(project, channel.id, event.id))}>
                {formatChordSymbol(event.root, event.quality, event.articulation)} · {event.articulation} · step {event.step + 1} ×
              </button>
            ))}
          </div>
        </div>
      )}

      {channel && !guitarChordMode && (
        <div className="chord-controls">
          <strong>Chord assist</strong>
          <label>Root note
            <select value={activeChordRoot} onChange={(event) => setChordRoot(Number(event.target.value))}>
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
          <button id="add-chord" onClick={addChord}>＋ Add chord</button>
        </div>
      )}

    </div>
  );
}

export function SongEditor({ project, onChange }: { project: Project; onChange: (project: Project) => void }) {
  const [sourceChannelId, setSourceChannelId] = useState('');
  const [useOriginalPerformance, setUseOriginalPerformance] = useState(false);
  const [suggestions, setSuggestions] = useState<ChordSuggestion[] | null>(null);
  const [replaceChannelId, setReplaceChannelId] = useState('');
  const [bassMode, setBassMode] = useState<'chords' | 'melody'>('chords');
  const [bassPreview, setBassPreview] = useState<NoteEvent[] | null>(null);
  useEffect(() => { setSuggestions(null); setBassPreview(null); }, [project]);
  const bars = Math.max(1, Math.ceil(arrangementLength(project) / project.noteLength));
  const sourceChannels = project.channels.filter((channel) =>
    !channel.generatedMetadata && (channel.notes?.length ?? 0) > 0,
  );
  const sourceChannel = sourceChannels.find((channel) => channel.id === sourceChannelId) ?? sourceChannels[0];
  const sourceTake = sourceChannel
    ? project.recognitionTakes.find((take) => sourceChannel.notes.some((note) => note.sourceTakeId === take.id))
    : undefined;
  const originalNotes: NoteEvent[] = sourceTake
    ? sourceTake.originalEvents.flatMap((event) => {
      if (!('pitch' in event)) return [];
      const stepSeconds = 60 / project.bpm * 4 / project.noteLength;
      return [{
        id: event.id,
        step: Math.max(0, Math.floor(event.startSeconds / stepSeconds)) % totalSteps(project),
        pitch: event.pitch,
        durationSteps: Math.max(1, Math.round(event.durationSeconds / stepSeconds)),
        confidence: event.confidence,
      }];
    })
    : [];
  const inputNotes = useOriginalPerformance && sourceTake ? originalNotes : sourceChannel?.notes ?? [];
  const generatedChannels = project.channels.filter((channel) => channel.generatedMetadata?.kind === 'chord-suggestions');
  const generatedBassChannels = project.channels.filter((channel) => channel.generatedMetadata?.kind === 'bass-generation');
  const allGeneratedChannels = project.channels.filter((channel) => channel.generatedMetadata);
  const updatePattern = (id: string) => onChange(selectPattern(project, id));
  const generateSuggestions = () => {
    if (!sourceChannel) return;
    setSuggestions(suggestChordsFromNotes(
      inputNotes, project.scaleRoot, project.scaleId, project.noteLength, project.loopBars,
    ));
  };
  const selectSuggestion = (index: number, choice: ChordChoice) => {
    setSuggestions((current) => current?.map((suggestion, itemIndex) =>
      itemIndex === index ? { ...suggestion, ...choice } : suggestion,
    ) ?? null);
    setBassPreview(null);
  };
  const selectedReplaceChannel = generatedChannels.find((channel) => channel.id === replaceChannelId) ?? generatedChannels[0];
  const addSuggestions = () => {
    if (!sourceChannel || !suggestions?.length) return;
    const updated = addGeneratedChordChannel(project, sourceChannel.id, suggestions);
    if (updated !== project) onChange(updated);
  };
  const replaceSuggestions = () => {
    if (!sourceChannel || !selectedReplaceChannel || !suggestions?.length) return;
    onChange(replaceGeneratedChordChannel(project, selectedReplaceChannel.id, sourceChannel.id, suggestions));
  };
  const generateBassPreview = () => {
    const notes = bassMode === 'chords'
      ? generateBassFromChords(suggestions ?? [], project.noteLength, totalSteps(project))
      : generateBassFromMelody(inputNotes, totalSteps(project));
    setBassPreview(notes);
  };
  const addBassTrack = () => {
    if (!sourceChannel || !bassPreview?.length) return;
    const updated = addGeneratedBassChannel(project, sourceChannel.id, bassPreview);
    if (updated !== project) onChange(updated);
  };
  const replaceBassTrack = (channelId: string) => {
    if (!sourceChannel || !bassPreview?.length) return;
    onChange(replaceGeneratedBassChannel(project, channelId, sourceChannel.id, bassPreview));
  };
  const appendArrangementClip = () => {
    const patternId = project.currentPatternId ?? project.patterns[0]?.id;
    if (!patternId) return;
    onChange(addArrangementClip(project, patternId, arrangementLength(project)));
  };

  return (
    <section className="composition panel" aria-label="Song tools">
      <h2>Song</h2>
      <div className="composition-controls">
        <div className="pattern-controls">
          <strong>Patterns</strong>
          {project.patterns.map((pattern) => (
            <button key={pattern.id} className={pattern.id === project.currentPatternId ? 'on' : 'secondary'}
              aria-pressed={pattern.id === project.currentPatternId} onClick={() => updatePattern(pattern.id)}>
              {pattern.name}
            </button>
          ))}
          <button id="new-pattern" onClick={() => onChange(addPattern(project, `Pattern ${project.patterns.length + 1}`))}>＋ New pattern</button>
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
      </div>

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
      <section className="arrangement-assistant" aria-label="Arrangement assistance">
        <h3>Arrangement assistance · Chord suggestions</h3>
        <p className="hint">Suggestions use one melody track and never change it. Preview and add them as a separate editable track.</p>
        <div className="arrangement-assistant-controls">
          <label>Melody source
            <select aria-label="Melody source" value={sourceChannel?.id ?? ''}
              onChange={(event) => { setSourceChannelId(event.target.value); setSuggestions(null); setBassPreview(null); }}>
              <option value="" disabled>{sourceChannels.length ? 'Choose a melody…' : 'Add notes to a channel first'}</option>
              {sourceChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
            </select>
          </label>
          {sourceTake && (
            <label className="check-label">
              <input type="checkbox" checked={useOriginalPerformance}
              onChange={(event) => { setUseOriginalPerformance(event.target.checked); setSuggestions(null); setBassPreview(null); }} />
              Use only original performance notes
            </label>
          )}
          <button className="secondary" disabled={!sourceChannel || !inputNotes.length} onClick={generateSuggestions}>
            ✨ Suggest chords
          </button>
        </div>
        {suggestions && (
          <div className="chord-suggestions" aria-live="polite">
            {suggestions.length ? suggestions.map((suggestion, index) => {
              const choices = [{ root: suggestion.root, quality: suggestion.quality }, ...suggestion.alternatives];
              const selectedValue = `${suggestion.root}:${suggestion.quality}`;
              return (
                <label key={`${suggestion.step}-${index}`} className="chord-suggestion">
                  Bar {Math.floor(suggestion.step / project.noteLength) + 1}
                  <select aria-label={`Chord suggestion for bar ${Math.floor(suggestion.step / project.noteLength) + 1}`}
                    value={selectedValue}
                    onChange={(event) => {
                      const choice = choices.find((item) => `${item.root}:${item.quality}` === event.target.value);
                      if (choice) selectSuggestion(index, choice);
                    }}>
                    {choices.map((choice) => (
                      <option key={`${choice.root}:${choice.quality}`} value={`${choice.root}:${choice.quality}`}>
                        {formatChordSymbol(choice.root, choice.quality)}
                      </option>
                    ))}
                  </select>
                  <span className={suggestion.confidence < 0.6 ? 'low-confidence-label' : ''}>
                    {suggestion.confidence < 0.6 ? 'Low confidence · ' : ''}{Math.round(suggestion.confidence * 100)}%
                  </span>
                </label>
              );
            }) : <p className="hint">No melody notes were found in this loop.</p>}
            {!!suggestions.length && (
              <div className="arrangement-assistant-actions">
                <button disabled={project.channels.length >= MAX_CHANNELS} onClick={addSuggestions}>＋ Add as a separate track</button>
                {!!generatedChannels.length && (
                  <>
                    <label>Replace generated track
                      <select aria-label="Generated track to replace" value={selectedReplaceChannel?.id ?? ''}
                        onChange={(event) => setReplaceChannelId(event.target.value)}>
                        {generatedChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                      </select>
                    </label>
                    <button className="secondary" disabled={!selectedReplaceChannel} onClick={replaceSuggestions}>Replace selected track</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <div className="bass-assistant">
          <h4>Bass generation</h4>
          <p className="hint">Preview a bass line from your reviewed chord suggestions or the selected melody. The source track stays unchanged.</p>
          <div className="arrangement-assistant-controls">
            <label>Bass follows
              <select aria-label="Bass follows" value={bassMode}
                onChange={(event) => { setBassMode(event.target.value as 'chords' | 'melody'); setBassPreview(null); }}>
                <option value="chords">Reviewed chord suggestions</option>
                <option value="melody">Melody notes</option>
              </select>
            </label>
            <button className="secondary"
              disabled={!sourceChannel || (bassMode === 'chords' ? !suggestions?.length : !inputNotes.length)}
              onClick={generateBassPreview}>Preview bass line</button>
          </div>
          {bassMode === 'chords' && !suggestions?.length
            ? <p className="hint">Suggest and review chords above before generating a chord-following bass line.</p>
            : null}
          {bassPreview && (
            <div className="arrangement-assistant-actions" aria-live="polite">
              <span>{bassPreview.length ? `Preview: ${bassPreview.length} bass notes` : 'No bass notes could be generated.'}</span>
              <button disabled={!bassPreview.length || project.channels.length >= MAX_CHANNELS} onClick={addBassTrack}>
                ＋ Add bass track
              </button>
              {!!generatedBassChannels.length && (
                <>
                  <label>Replace bass track
                    <select aria-label="Bass track to replace" value={generatedBassChannels.some((channel) => channel.id === replaceChannelId)
                      ? replaceChannelId : generatedBassChannels[0].id}
                      onChange={(event) => setReplaceChannelId(event.target.value)}>
                      {generatedBassChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                    </select>
                  </label>
                  <button className="secondary" disabled={!bassPreview.length}
                    onClick={() => replaceBassTrack(generatedBassChannels.some((channel) => channel.id === replaceChannelId)
                      ? replaceChannelId : generatedBassChannels[0].id)}>Replace bass track</button>
                </>
              )}
            </div>
          )}
        </div>
        {!!allGeneratedChannels.length && (
          <div className="generated-track-list" aria-label="Generated arrangement tracks">
            <strong>Generated tracks</strong>
            {allGeneratedChannels.map((channel) => (
              <div key={channel.id}>
                <span>{channel.name} · {channel.generatedMetadata?.kind === 'bass-generation' ? 'Bass' : 'Chords'} · {Math.round((channel.generatedMetadata?.confidence ?? 0) * 100)}% confidence</span>
                <button className="secondary" aria-label={`Remove ${channel.name}`}
                  onClick={() => onChange(removeGeneratedTrack(project, channel.id))}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
