import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LOOP_BARS, MAX_CHANNELS, NOTE_LENGTHS, addChannel, addCustomSound, addSampleSound, removeChannel, setBpm, setLoopBars,
  setEffects, setNoteLength, selectPattern, setSwingTemplate, SWING_TEMPLATES, toggleStep, updateChannel, type LoopBars, type NoteLength,
  type Channel, type Project, type SoundDef, type SynthParams,
} from '../model/project';
import { TEMPLATES } from '../model/templates';
import { loadProject, saveProject } from '../model/storage';
import { allSounds, findSound, SAMPLE_RATE, STARTER_SOUNDS } from '../library/sounds';
import { applyDrumKit, DRUM_KITS, findDrumKit } from '../library/drumKits';
import { getSample, saveSample, type SampleData } from '../library/sampleStorage';
import { Engine } from '../audio/engine';
import { renderProject } from '../audio/render';
import { encodeWav } from '../audio/wav';
import { countNotes, TUTORIALS, type Tutorial, type TutorialStep, type View } from '../tutorial/tutorials';
import { TutorialMenu, TutorialOverlay } from './Tutorial';
import { SoundDesigner } from './SoundDesigner';
import { SampleLibrary } from './SampleLibrary';
import { SoundPicker } from './SoundPicker';
import { PianoRoll, SongEditor } from './CompositionEditor';
import './styles.css';

const COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f15bb5', '#fb8500', '#8ecae6'];
const SEEN_KEY = 'musicmaker.tutorialSeen';
const VIEW_KEY = 'musicmaker.view';
const UNLOCK_KEY = 'musicmaker.unlockedTabs';
const TABS: { id: View; icon: string; label: string }[] = [
  { id: 'beat', icon: '🥁', label: 'Beat' },
  { id: 'sound', icon: '🎚', label: 'Sound' },
  { id: 'library', icon: '📚', label: 'Library' },
  { id: 'song', icon: '🎬', label: 'Song' },
];
const isView = (v: string | null): v is View => TABS.some((t) => t.id === v);

export function App() {
  const [project, setProject] = useState<Project>(loadProject);
  const [playStep, setPlayStep] = useState<number | null>(null);
  const [events, setEvents] = useState<ReadonlySet<string>>(new Set());
  const [tutorial, setTutorial] = useState<Tutorial | null>(null);
  const [base, setBase] = useState<Project>(project);
  const [menu, setMenu] = useState(false);
  const [designer, setDesigner] = useState(false);
  const [view, setView] = useState<View>(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    return isView(saved) ? saved : 'beat';
  });
  // Sound and Song tabs unlock after the first play (or immediately for returning users / "Show all").
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(UNLOCK_KEY) === '1' || localStorage.getItem(SEEN_KEY) !== null);
  const [projectMenu, setProjectMenu] = useState(false);
  const [pianoChannels, setPianoChannels] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState('');
  const [sampleData, setSampleData] = useState<Map<string, SampleData>>(() => new Map());
  const [samplesLoaded, setSamplesLoaded] = useState(false);
  const [drumKitId, setDrumKitId] = useState('');

  const projectRef = useRef(project);
  projectRef.current = project;
  const sampleDataRef = useRef(sampleData);
  sampleDataRef.current = sampleData;
  const engineRef = useRef<Engine | undefined>(undefined);
  engineRef.current ??= new Engine(() => projectRef.current, setPlayStep, (id) => sampleDataRef.current.get(id));
  const engine = engineRef.current;

  const emit = (e: string) => setEvents((s) => new Set(s).add(e));
  const startTutorial = (t: Tutorial) => {
    setBase(projectRef.current);
    setEvents(new Set());
    setTutorial(t);
    setMenu(false);
    localStorage.setItem(SEEN_KEY, '1');
  };

  useEffect(() => { saveProject(project); }, [project]);
  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);
  useEffect(() => { if (unlocked) localStorage.setItem(UNLOCK_KEY, '1'); }, [unlocked]);
  useEffect(() => { if (events.has('play')) setUnlocked(true); }, [events]);
  useEffect(() => {
    let active = true;
    void Promise.all(project.customSounds.flatMap((sound) => sound.sampleId ? [getSample(sound.sampleId).catch(() => undefined)] : []))
      .then((samples) => {
        if (!active) return;
        const loaded = new Map<string, SampleData>();
        samples.forEach((sample) => { if (sample) loaded.set(sample.id, sample); });
        setSampleData(loaded);
        setSamplesLoaded(true);
      });
    return () => { active = false; };
    // Load persisted samples once; newly created samples are added in onSaveSample.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!localStorage.getItem(SEEN_KEY)) startTutorial(TUTORIALS[0]);
    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sounds = useMemo(() => allSounds(project), [project]);
  const unavailableSoundIds = useMemo(() => new Set(
    samplesLoaded
      ? sounds.filter((sound) => sound.sampleId && !sampleData.has(sound.sampleId)).map((sound) => sound.id)
      : [],
  ), [sounds, sampleData, samplesLoaded]);
  const loadingSoundIds = useMemo(() => new Set(
    samplesLoaded ? [] : sounds.filter((sound) => sound.sampleId).map((sound) => sound.id),
  ), [sounds, samplesLoaded]);

  const togglePlay = async () => {
    if (engine.playing) engine.stop();
    else { await engine.start(); emit('play'); }
  };

  const applySelectedDrumKit = () => {
    const kit = findDrumKit(drumKitId);
    if (!kit) return;
    let result = applyDrumKit(project, kit);
    if (result.status === 'confirmation-required') {
      if (!window.confirm(`Applying ${kit.name} will replace assigned drum sounds. Keep all patterns and apply the kit?`)) return;
      result = applyDrumKit(project, kit, true);
    }
    if (result.status === 'capacity-exceeded') {
      flash('There is not enough channel space to apply this kit. Remove a channel and try again.');
      return;
    }
    setProject(result.project);
    flash(`${kit.name} applied · patterns preserved ✓`);
  };

  const exportWav = () => {
    const { left, right } = renderProject(project, SAMPLE_RATE, sampleData);
    const blob = new Blob([encodeWav(left, right, SAMPLE_RATE)], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^\w-]+/g, '_') || 'loop'}.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    emit('export');
  };

  const flash = (m: string) => { setMessage(m); setTimeout(() => setMessage(''), 2500); };
  const preview = (d: SoundDef | undefined, vol?: number) => { if (d) { void engine.preview(d, vol); emit('preview'); } };

  const loadTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    if (countNotes(project) > 0 && !window.confirm('Replace your current beat with this template?')) return;
    engine.stop();
    setProject({ ...t.make(), customSounds: project.customSounds });
  };

  const goTab = (v: View) => { if (v !== 'beat' && v !== 'library') setUnlocked(true); setView(v); };
  const onTutorialStep = (step: TutorialStep) => {
    if (step.view) goTab(step.view);
    if (step.menu) setProjectMenu(true);
    const first = projectRef.current.channels[0];
    if (step.pianoRoll && first) setPianoChannels((s) => new Set(s).add(first.id));
  };
  const visibleTabs = TABS.filter((t) => unlocked || t.id === 'beat' || t.id === 'library' || t.id === view);
  const onTabKey = (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    const i = visibleTabs.findIndex((t) => t.id === view);
    const next = visibleTabs[(i + dir + visibleTabs.length) % visibleTabs.length];
    goTab(next.id);
    requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus());
  };
  const togglePiano = (id: string) => setPianoChannels((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <main className="app">
      <header className="bar">
        <h1>🎵 MusicMaker</h1>
        <button id="play-btn" className="play" onClick={togglePlay} aria-label={playStep === null ? 'Play' : 'Stop'}>
          {playStep === null ? '▶ Play' : '■ Stop'}
        </button>
        <label>BPM
          <input type="number" min={40} max={200} value={project.bpm} onChange={(e) => setProject(setBpm(project, Number(e.target.value)))} />
        </label>
        <div className="project-menu">
          <button className="secondary" aria-haspopup="true" aria-expanded={projectMenu} aria-label="Project menu" onClick={() => setProjectMenu(!projectMenu)}>⋯</button>
          {projectMenu && (
            <div className="panel menu-popup">
              <label>Template
                <select value="" onChange={(e) => { loadTemplate(e.target.value); setProjectMenu(false); }}>
                  <option value="" disabled>Choose…</option>
                  {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <button id="save-btn" onClick={() => { saveProject(project); emit('save'); flash('Saved ✓'); }}>Save</button>
              <button id="export-btn" onClick={exportWav}>Export WAV</button>
              <label className="check-label"><input type="checkbox" checked={unlocked} disabled={unlocked}
                onChange={() => setUnlocked(true)} /> Show all tabs</label>
              <button className="secondary" onClick={() => setProjectMenu(false)}>Close</button>
            </div>
          )}
        </div>
        <button className="secondary" onClick={() => setMenu(true)}>? Tutorials</button>
      </header>
      {message && <div className="toast" role="status">{message}</div>}

      {menu && <TutorialMenu onPick={startTutorial} onClose={() => setMenu(false)} />}

      <nav className="tabs" role="tablist" aria-label="Screens" onKeyDown={onTabKey}>
        {visibleTabs.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={view === t.id} aria-controls={`pane-${t.id}`}
            tabIndex={view === t.id ? 0 : -1} className={view === t.id ? 'on' : 'secondary'} onClick={() => goTab(t.id)}>
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      <div className={`workspace view-${view}`}>
        <div id="pane-beat" role="tabpanel" aria-labelledby="tab-beat" className={`pane pane-beat${view === 'beat' ? ' active' : ''}`}>
          <div className="row beat-options">
            <label>Note length
              <select id="note-length" value={project.noteLength} onChange={(e) => setProject(setNoteLength(project, Number(e.target.value) as NoteLength))}>
                {NOTE_LENGTHS.map((n) => <option key={n} value={n}>1/{n}</option>)}
              </select>
            </label>
            <label>Loop
              <select id="loop-bars" value={project.loopBars} onChange={(e) => setProject(setLoopBars(project, Number(e.target.value) as LoopBars))}>
                {LOOP_BARS.map((n) => <option key={n} value={n}>{n} bar{n > 1 ? 's' : ''}</option>)}
              </select>
            </label>
            {project.patterns.length > 1 && (
              <label>Pattern
                <select aria-label="Pattern" value={project.currentPatternId ?? ''} onChange={(e) => setProject(selectPattern(project, e.target.value))}>
                  {project.patterns.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                </select>
              </label>
            )}
            <label>Drum kit
              <select aria-label="Drum kit" value={drumKitId} onChange={(e) => setDrumKitId(e.target.value)}>
                <option value="">Choose a kit…</option>
                {DRUM_KITS.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>)}
              </select>
            </label>
            <button className="secondary" disabled={!drumKitId} onClick={applySelectedDrumKit}>Apply kit</button>
          </div>
          <section className="channels">
        {project.channels.map((c, ci) => {
          const color = COLORS[ci % COLORS.length];
          const def = findSound(project, c.soundId);
          return (
            <div className="channel" key={c.id} style={{ ['--color' as string]: color }}>
              <div className="strip">
                <SoundPicker sounds={sounds} soundId={c.soundId} unavailableSoundIds={unavailableSoundIds}
                  loadingSoundIds={loadingSoundIds}
                  onPreview={(sound) => preview(sound, c.volume)}
                  onSelect={(sound) => {
                    setProject(updateChannel(project, c.id, { soundId: sound.id, name: sound.name }));
                    preview(sound, c.volume);
                    emit('sound-change');
                  }} />
                <button className="preview-btn" aria-label={`Preview ${c.name}`} onClick={() => preview(def, c.volume)}>🔊</button>
                <button aria-pressed={c.mute} className={c.mute ? 'on' : ''} onClick={() => setProject(updateChannel(project, c.id, { mute: !c.mute }))}>M</button>
                <button aria-pressed={c.solo} className={c.solo ? 'on' : ''} onClick={() => setProject(updateChannel(project, c.id, { solo: !c.solo }))}>S</button>
                <input type="range" aria-label={`Volume ${c.name}`} min={0} max={1} step={0.05} value={c.volume}
                  onChange={(e) => setProject(updateChannel(project, c.id, { volume: Number(e.target.value) }))} />
                <button className="secondary" aria-pressed={pianoChannels.has(c.id)} aria-label={`${pianoChannels.has(c.id) ? 'Show grid' : 'Show piano roll'} for ${c.name}`}
                  onClick={() => togglePiano(c.id)}>{pianoChannels.has(c.id) ? '▦ Grid' : '🎹 Piano roll'}</button>
                <button className="secondary" aria-label={`Remove ${c.name}`} onClick={() => setProject(removeChannel(project, c.id))}>✕</button>
              </div>
              {pianoChannels.has(c.id)
                ? <PianoRoll project={project} onChange={setProject} channelId={c.id} />
                : <BeatGrid channel={c} loopBars={project.loopBars} noteLength={project.noteLength} playStep={playStep}
                  onToggle={(step) => setProject(toggleStep(project, c.id, step))} />}
            </div>
          );
        })}
            {project.channels.length === 0 && <p className="hint">No channels yet. Add one to start.</p>}
          </section>
          <div className="row">
            <button id="add-channel" disabled={project.channels.length >= MAX_CHANNELS}
              onClick={() => setProject(addChannel(project, STARTER_SOUNDS[4].name, STARTER_SOUNDS[4].id))}>＋ Add channel</button>
          </div>
        </div>

        <div id="pane-sound" role="tabpanel" aria-labelledby="tab-sound" className={`pane pane-sound${view === 'sound' ? ' active' : ''}`}>
          <section className="panel effects-panel" aria-label="Sound shaping">
            <h2>Sound shaping</h2>
            <label>Swing
              <select aria-label="Swing template" value={project.swingTemplate}
                onChange={(e) => setProject(setSwingTemplate(project, e.target.value as Project['swingTemplate']))}>
                {SWING_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
              </select>
            </label>
        <div className="effect-controls">
          <label>Reverb
            <input aria-label="Reverb" type="range" min={0} max={1} step={0.05} value={project.effects.reverb}
              onChange={(e) => setProject(setEffects(project, { reverb: Number(e.target.value) }))} />
            <output>{Math.round(project.effects.reverb * 100)}%</output>
          </label>
          <label>Delay
            <input aria-label="Delay" type="range" min={0} max={1} step={0.05} value={project.effects.delay}
              onChange={(e) => setProject(setEffects(project, { delay: Number(e.target.value) }))} />
            <output>{Math.round(project.effects.delay * 100)}%</output>
          </label>
          <label>Filter cutoff
            <input aria-label="Filter cutoff" type="range" min={200} max={20000} step={100} value={project.effects.filterCutoff}
              onChange={(e) => setProject(setEffects(project, { filterCutoff: Number(e.target.value) }))} />
            <output>{project.effects.filterCutoff} Hz</output>
          </label>
          {([
            ['Low EQ', 'eqLow'],
            ['Mid EQ', 'eqMid'],
            ['High EQ', 'eqHigh'],
          ] as const).map(([label, key]) => (
            <label key={key}>{label}
              <input aria-label={label} type="range" min={-12} max={12} step={1} value={project.effects[key]}
                onChange={(e) => setProject(setEffects(project, { [key]: Number(e.target.value) }))} />
              <output>{project.effects[key]} dB</output>
            </label>
          ))}
        </div>
          </section>
          <div className="row">
            <button className="secondary" onClick={() => setDesigner(!designer)}>🎛 Make a sound</button>
          </div>
      {designer && (
        <SoundDesigner
          onPreview={(name, params: SynthParams) => void engine.preview({ id: 'preview', name, category: 'Mine', params })}
          onSave={(name, params) => { setProject(addCustomSound(project, name, params).project); flash('Saved to your library ✓'); }}
          onClose={() => setDesigner(false)}
        />
      )}

        </div>

        <div id="pane-library" role="tabpanel" aria-labelledby="tab-library" className={`pane pane-library${view === 'library' ? ' active' : ''}`}>
      <SampleLibrary
        sounds={sounds}
        channels={project.channels}
        sampleData={sampleData}
        bpm={project.bpm}
        onPreview={(sound) => preview(sound)}
        onPreviewSample={(sample) => { void engine.previewSample(sample); emit('preview'); }}
        onUse={(soundId, channelId) => {
          const sound = findSound(project, soundId);
          if (!sound) return;
          setProject(updateChannel(project, channelId, { soundId, name: sound.name }));
          preview(sound);
          emit('sound-change');
        }}
        onSaveSample={async (name, tags, sample) => {
          await saveSample(sample);
          const updated = new Map(sampleDataRef.current);
          updated.set(sample.id, sample);
          sampleDataRef.current = updated;
          setSampleData(updated);
          setProject((current) => addSampleSound(current, name, sample.id, tags));
          emit('sample-saved');
          flash('Sample saved to your library ✓');
        }}
        onUpdateSample={async (sample) => {
          await saveSample(sample);
          const updated = new Map(sampleDataRef.current);
          updated.set(sample.id, sample);
          sampleDataRef.current = updated;
          setSampleData(updated);
          flash('Sample edits saved ✓');
        }}
        onRecordStart={() => emit('record-start')}
      />

        </div>

        <div id="pane-song" role="tabpanel" aria-labelledby="tab-song" className={`pane pane-song${view === 'song' ? ' active' : ''}`}>
          <SongEditor project={project} onChange={setProject} />
        </div>
      </div>

      {tutorial && <TutorialOverlay key={tutorial.id} tutorial={tutorial} state={{ project, base, events }} onExit={() => setTutorial(null)} onStep={onTutorialStep} />}
    </main>
  );
}

function BeatGrid({
  channel, loopBars, noteLength, playStep, onToggle,
}: {
  channel: Channel;
  loopBars: number;
  noteLength: number;
  playStep: number | null;
  onToggle: (step: number) => void;
}) {
  const [focusedStep, setFocusedStep] = useState(0);
  const steps = channel.steps;
  const activeFocus = Math.min(focusedStep, Math.max(0, steps.length - 1));
  const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>, step: number) => {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -noteLength,
      ArrowDown: noteLength,
    };
    if (event.key === 'Home') {
      event.preventDefault();
      setFocusedStep(0);
      event.currentTarget.closest('.grid')?.querySelector<HTMLButtonElement>('[data-step="0"]')?.focus();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      const last = Math.max(0, steps.length - 1);
      setFocusedStep(last);
      event.currentTarget.closest('.grid')?.querySelector<HTMLButtonElement>(`[data-step="${last}"]`)?.focus();
      return;
    }
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(steps.length - 1, step + offset));
    setFocusedStep(next);
    event.currentTarget.closest('.grid')?.querySelector<HTMLButtonElement>(`[data-step="${next}"]`)?.focus();
  };

  return (
    <div className="grid" role="grid" aria-label={`${channel.name} beat grid`}>
      {Array.from({ length: loopBars }, (_, bar) => (
        <div className="bar-row" role="row" key={bar} style={{ gridTemplateColumns: `repeat(${noteLength}, 1fr)` }}>
          {steps.slice(bar * noteLength, (bar + 1) * noteLength).map((on, j) => {
            const step = bar * noteLength + j;
            const metadata = channel.stepEventMetadata?.[step];
            const confidence = metadata?.confidence;
            const details = [
              confidence === undefined ? '' : `${confidence < 0.7 ? 'low confidence ' : 'confidence '}${Math.round(confidence * 100)}%`,
              metadata?.sourceTakeId ? `source take ${metadata.sourceTakeId}` : '',
            ].filter(Boolean).join(', ');
            return (
              <button key={step} data-step={step} role="gridcell" tabIndex={activeFocus === step ? 0 : -1}
                aria-label={`${channel.name} step ${step + 1}${details ? `, ${details}` : ''}`} aria-pressed={on}
                title={details || undefined}
                className={`step${on ? ' on' : ''}${j % Math.max(1, noteLength / 4) === 0 ? ' group' : ''}${playStep === step ? ' playing' : ''}${confidence !== undefined ? ' recognized' : ''}${confidence !== undefined && confidence < 0.7 ? ' low-confidence' : ''}`}
                onClick={() => onToggle(step)} onKeyDown={(event) => moveFocus(event, step)}>
                {confidence !== undefined && confidence < 0.7 ? <span className="confidence-indicator" aria-hidden="true">!</span> : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
