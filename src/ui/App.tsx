import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LOOP_BARS, MAX_CHANNELS, NOTE_LENGTHS, addChannel, addCustomSound, addNote, addSampleSound, duplicateChannel, removeChannel, setBpm, setLoopBars,
  setEffects, setNoteLength, selectPattern, setSwingTemplate, SWING_TEMPLATES, toggleStep, updateChannel, type LoopBars, type NoteLength,
  totalSteps, type Channel, type Project, type SoundDef, type SynthParams,
} from '../model/project';
import { TEMPLATES } from '../model/templates';
import { loadProject, saveProject } from '../model/storage';
import { allSounds, findSound, STARTER_SOUNDS } from '../library/sounds';
import { applyDrumKit, DRUM_KITS, findDrumKit } from '../library/drumKits';
import { getSample, saveSample, type SampleData } from '../library/sampleStorage';
import { Engine } from '../audio/engine';
import { applyRecognitionTake, rebaseRecognitionTakeForTempo, removeRecognitionTake } from '../model/recognitionProject';
import type { RecognitionTake } from '../model/recognition';
import { countNotes, TUTORIALS, type Tutorial, type TutorialStep, type View } from '../tutorial/tutorials';
import { TutorialMenu, TutorialOverlay } from './Tutorial';
import { loadDone, saveDone } from '../tutorial/progress';
import { SoundDesigner } from './SoundDesigner';
import { SampleLibrary } from './SampleLibrary';
import { SoundPicker } from './SoundPicker';
import { PianoRoll, SongEditor } from './CompositionEditor';
import { MidiInput } from './MidiInput';
import { AppearanceSettings } from './AppearanceSettings';
import { loadTheme, saveTheme, type ThemeId } from './themes';
import { recordedMidiEvent, type MidiMessage, type RecordedMidiNote } from '../platform/midi';
import { clearAllSamples } from '../library/sampleStorage';
import { clearAppData, loadPreferences, savePreferences, MIDI_INPUT_KEY } from './preferences';
import { HeaderTile } from './Popover';
import { loadExportDefaults, saveExportDefaults } from './exportDefaults';
import { Icon, type IconName } from './Icon';
import './styles.css';

const COLORS = Array.from({ length: 8 }, (_, index) => `var(--channel-${index + 1})`);
const SEEN_KEY = 'musicmaker.tutorialSeen';
const VIEW_KEY = 'musicmaker.view';
type HeaderMenu = 'file' | 'share' | 'settings' | 'help';

const TABS: { id: View; icon: IconName; label: string }[] = [
  { id: 'beat', icon: 'beat', label: 'Beat' },
  { id: 'sound', icon: 'sound', label: 'Sound' },
  { id: 'library', icon: 'library', label: 'Library' },
  { id: 'song', icon: 'song', label: 'Song' },
];
const isView = (v: string | null): v is View => TABS.some((t) => t.id === v);

export function App() {
  const [project, setProject] = useState<Project>(loadProject);
  const [playStep, setPlayStep] = useState<number | null>(null);
  const [events, setEvents] = useState<ReadonlySet<string>>(new Set());
  const [tutorial, setTutorial] = useState<Tutorial | null>(null);
  const [base, setBase] = useState<Project>(project);
  const [theme, setTheme] = useState<ThemeId>(loadTheme);
  const [doneTutorials, setDoneTutorials] = useState<ReadonlySet<string>>(loadDone);
  const [prefs, setPrefs] = useState(loadPreferences);
  const updatePrefs = (patch: Partial<typeof prefs>) => setPrefs((p) => { const n = { ...p, ...patch }; savePreferences(n); return n; });
  const [nudge, setNudge] = useState<View | null>(null);
  const [designer, setDesigner] = useState(false);
  const [view, setView] = useState<View>(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    return isView(saved) ? saved : 'beat';
  });
  // Sound and Song tabs unlock after the first play (or immediately for returning users / "Show all").
  const [openMenu, setOpenMenu] = useState<HeaderMenu | null>(null);
  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const toggleMenu = (m: HeaderMenu) => setOpenMenu((cur) => (cur === m ? null : m));
  const [pianoChannels, setPianoChannels] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState('');
  const [sampleData, setSampleData] = useState<Map<string, SampleData>>(() => new Map());
  const [samplesLoaded, setSamplesLoaded] = useState(false);
  const [drumKitId, setDrumKitId] = useState('');
  const [midiRecording, setMidiRecording] = useState(false);
  const [midiTargetChannelId, setMidiTargetChannelId] = useState(project.channels[0]?.id ?? '');
  const [exportSampleRate, setExportSampleRate] = useState(() => loadExportDefaults().sampleRate);
  const [exportBitDepth, setExportBitDepth] = useState<16 | 24>(() => loadExportDefaults().bitDepth);
  const [normalizeExport, setNormalizeExport] = useState(() => loadExportDefaults().normalize);
  const [exporting, setExporting] = useState(false);
  const recognitionPlaybackRef = useRef(false);
  const recognitionPlaybackTimerRef = useRef<number | undefined>(undefined);
  const midiRecordingRef = useRef(false);
  const midiRecordingStartedAtRef = useRef<number | undefined>(undefined);
  const midiTargetChannelRef = useRef(midiTargetChannelId);
  const midiActiveNotesRef = useRef(new Map<string, RecordedMidiNote>());

  const projectRef = useRef(project);
  projectRef.current = project;
  const sampleDataRef = useRef(sampleData);
  sampleDataRef.current = sampleData;
  const engineRef = useRef<Engine | undefined>(undefined);
  engineRef.current ??= new Engine(() => projectRef.current, setPlayStep, (id) => sampleDataRef.current.get(id));
  const engine = engineRef.current;
  midiTargetChannelRef.current = midiTargetChannelId;

  const emit = (e: string) => setEvents((s) => new Set(s).add(e));
  const startTutorial = (t: Tutorial) => {
    setBase(projectRef.current);
    setEvents(new Set());
    setTutorial(t);
    setOpenMenu(null);
    localStorage.setItem(SEEN_KEY, '1');
  };

  useEffect(() => { saveProject(project); }, [project]);
  useEffect(() => {
    saveTheme(theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);
  useEffect(() => {
    if (!project.channels.some((channel) => channel.id === midiTargetChannelId)) {
      setMidiTargetChannelId(project.channels[0]?.id ?? '');
    }
  }, [project.channels, midiTargetChannelId]);
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

  const recordMidiNote = (voiceId: string, note: RecordedMidiNote, endedAt: number) => {
    const startedAt = midiRecordingStartedAtRef.current;
    if (startedAt === undefined) return;
    const current = projectRef.current;
    const channelId = midiTargetChannelRef.current;
    if (!current.channels.some((channel) => channel.id === channelId)) return;
    const recorded = recordedMidiEvent(note, endedAt, startedAt, current.bpm, current.noteLength, totalSteps(current));
    if (!recorded) return;
    setProject((projectValue) => addNote(projectValue, channelId, {
      ...recorded,
      id: `midi-${voiceId}-${Date.now().toString(36)}`,
    }));
    emit('midi-note-recorded');
  };

  const finishMidiRecording = () => {
    midiRecordingRef.current = false;
    const endedAt = performance.now();
    for (const [voiceId, note] of midiActiveNotesRef.current) recordMidiNote(voiceId, note, endedAt);
    midiActiveNotesRef.current.clear();
    midiRecordingStartedAtRef.current = undefined;
    setMidiRecording(false);
  };

  const onMidiRecordingChange = (recording: boolean) => {
    if (recording) {
      midiRecordingStartedAtRef.current = performance.now();
      midiRecordingRef.current = true;
      setMidiRecording(true);
    } else {
      finishMidiRecording();
    }
  };

  const onMidiMessage = (message: MidiMessage, timestamp: number) => {
    if (message.type === 'all-notes-off') {
      engine.stopLiveNotes();
      for (const [voiceId, note] of midiActiveNotesRef.current) recordMidiNote(voiceId, note, timestamp);
      midiActiveNotesRef.current.clear();
      return;
    }
    const voiceId = `${message.channel}-${message.pitch}`;
    if (message.type === 'note-off') {
      engine.stopLiveNote(voiceId);
      const note = midiActiveNotesRef.current.get(voiceId);
      if (note && midiRecordingRef.current) recordMidiNote(voiceId, note, timestamp);
      midiActiveNotesRef.current.delete(voiceId);
      return;
    }
    const current = projectRef.current;
    const channel = current.channels.find((item) => item.id === midiTargetChannelRef.current);
    const sound = channel ? findSound(current, channel.soundId) : undefined;
    if (sound && channel) void engine.startLiveNote(voiceId, sound, message.pitch, message.velocity, channel.volume, channel.pan);
    if (midiRecordingRef.current) {
      midiActiveNotesRef.current.set(voiceId, { pitch: message.pitch, velocity: message.velocity, startedAt: timestamp });
    }
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
    emit('kit-applied');
    flash(`${kit.name} applied · patterns preserved ✓`);
  };

  const exportWav = async () => {
    if (exporting) return;
    setExporting(true);
    flash('Preparing WAV export…');
    try {
      const samples = [...sampleData.values()].map((sample) => ({
        id: sample.id,
        samples: sample.samples.slice(),
        sampleRate: sample.sampleRate,
      }));
      const wav = await new Promise<ArrayBuffer>((resolve, reject) => {
        const worker = new Worker(new URL('../audio/exportWorker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<ArrayBuffer>) => {
          worker.terminate();
          resolve(event.data);
        };
        worker.onerror = (event) => {
          worker.terminate();
          reject(event.error ?? new Error(event.message));
        };
        worker.postMessage({
          project,
          samples,
          sampleRate: exportSampleRate,
          bitDepth: exportBitDepth,
          normalize: normalizeExport,
        }, samples.map((sample) => sample.samples.buffer));
      });
      const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/[^\w-]+/g, '_') || 'loop'}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      emit('export');
      flash('WAV exported ✓');
    } catch {
      flash('WAV export failed. Check project size and browser memory, then try again.');
    } finally {
      setExporting(false);
    }
  };

  const flash = (m: string) => { setMessage(m); setTimeout(() => setMessage(''), 2500); };
  const preview = (d: SoundDef | undefined, vol?: number) => { if (d) { void engine.preview(d, vol); emit('preview'); } };

  const loadTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    if (countNotes(project) > 0 && !window.confirm('Replace your current beat with this template?')) return;
    engine.stop();
    setProject({ ...t.make(), customSounds: project.customSounds });
    emit('template');
  };

  const goTab = (v: View) => {
    if (v !== 'beat' && prefs.hints && !tutorial && !localStorage.getItem(`musicmaker.nudge.${v}`)) {
      localStorage.setItem(`musicmaker.nudge.${v}`, '1');
      setNudge(v);
    }
    setView(v);
  };
  const onTutorialStep = (step: TutorialStep) => {
    if (step.view) goTab(step.view);
    if (step.menu) setOpenMenu(step.menu);
    const first = projectRef.current.channels[0];
    if (step.pianoRoll && first) setPianoChannels((s) => new Set(s).add(first.id));
  };
  const visibleTabs = TABS;
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
    <main className="app" data-theme={theme} data-reduce-motion={prefs.reduceMotion || undefined} data-large-icons={prefs.largeIcons || undefined}>
      <header className="bar">
        <h1 className="app-brand"><img className="app-logo" src={`${import.meta.env.BASE_URL}icon-v2.png`} alt="" />MusicMaker</h1>
        <label>BPM
          <input type="number" min={40} max={200} value={project.bpm} onChange={(e) => setProject(setBpm(project, Number(e.target.value)))} />
        </label>
        <div className="header-menus">
          <div className="project-menu">
            <button className="secondary icon-btn" aria-haspopup="true" aria-expanded={openMenu === 'file'} aria-label="File menu" title="File" onClick={() => toggleMenu('file')}><Icon name="file" /></button>
          </div>
          <div className="project-menu">
            <button className="secondary icon-btn" aria-haspopup="true" aria-expanded={openMenu === 'share'} aria-label="Share and export menu" title="Share / Export" onClick={() => toggleMenu('share')}><Icon name="share" /></button>
          </div>
          <div className="project-menu">
            <button className="secondary icon-btn" aria-haspopup="true" aria-expanded={openMenu === 'settings'} aria-label="Settings" title="Settings" onClick={() => toggleMenu('settings')}><Icon name="settings" /></button>
          </div>
          <button className="secondary icon-btn help-btn" aria-label="Help" title="Help" aria-haspopup="true" aria-expanded={openMenu === 'help'} onClick={() => toggleMenu('help')}><Icon name="help" /></button>
        </div>
        <button id="play-btn" className="play" onClick={togglePlay} aria-label={playStep === null ? 'Play' : 'Stop'}>
          <Icon name={playStep === null ? 'play' : 'stop'} className="inline-icon" /> {playStep === null ? 'Play' : 'Stop'}
        </button>
      </header>
            {openMenu === 'file' && (
              <HeaderTile label="File" onClose={closeMenu}>
                <button id="save-btn" onClick={() => { saveProject(project); emit('save'); flash('Saved ✓'); closeMenu(); }}>Save Project</button>
              </HeaderTile>
            )}
            {openMenu === 'share' && (
              <HeaderTile label="Export" onClose={closeMenu}>
                <label>WAV sample rate
                  <select aria-label="WAV sample rate" value={exportSampleRate}
                    onChange={(event) => setExportSampleRate(Number(event.target.value))}>
                    {[44100, 48000, 96000].map((rate) => <option key={rate} value={rate}>{(rate / 1000).toFixed(rate % 1000 ? 1 : 0)} kHz</option>)}
                  </select>
                </label>
                <label>WAV bit depth
                  <select aria-label="WAV bit depth" value={exportBitDepth}
                    onChange={(event) => setExportBitDepth(Number(event.target.value) as 16 | 24)}>
                    <option value={16}>16-bit PCM</option>
                    <option value={24}>24-bit PCM</option>
                  </select>
                </label>
                <label className="check-label">
                  <input type="checkbox" checked={normalizeExport} onChange={(event) => setNormalizeExport(event.target.checked)} />
                  Normalize to −1 dBFS
                </label>
                <button id="export-btn" disabled={exporting} onClick={() => void exportWav()}>{exporting ? 'Preparing WAV…' : 'Export WAV'}</button>
              </HeaderTile>
            )}
            {openMenu === 'settings' && (
              <HeaderTile label="Settings" className="settings-tile" onClose={closeMenu}>
                <AppearanceSettings theme={theme} onThemeChange={setTheme} />
                <h3>Export defaults</h3>
                <button className="secondary" onClick={() => {
                  saveExportDefaults({ sampleRate: exportSampleRate, bitDepth: exportBitDepth, normalize: normalizeExport });
                  flash('Export defaults saved ✓');
                }}>Use current export options as default</button>
                <h3>Interface</h3>
                <label className="check-label"><input type="checkbox" checked={prefs.largeIcons}
                  onChange={(e) => updatePrefs({ largeIcons: e.target.checked })} /> Larger icons</label>
                <label className="check-label"><input type="checkbox" checked={prefs.reduceMotion}
                  onChange={(e) => updatePrefs({ reduceMotion: e.target.checked })} /> Reduce motion</label>
                <h3>Tutorials</h3>
                <label className="check-label"><input type="checkbox" checked={prefs.hints}
                  onChange={(e) => updatePrefs({ hints: e.target.checked })} /> Show first-visit hints</label>
                <button className="secondary" onClick={() => { const empty = new Set<string>(); setDoneTutorials(empty); saveDone(empty); flash('Tutorial progress reset'); }}>Reset tutorial progress</button>
                <h3>Audio and MIDI</h3>
                <p className="hint">The last MIDI input you pick is remembered on this device.</p>
                <button className="secondary" onClick={() => { localStorage.removeItem(MIDI_INPUT_KEY); flash('MIDI input forgotten'); }}>Forget MIDI input</button>
                <h3>Data and privacy</h3>
                <p className="hint">Projects, settings and recordings stay in this browser; nothing is uploaded.</p>
                <button className="secondary" onClick={() => {
                  if (!window.confirm('Delete all saved sample audio? Projects keep their sound settings but samples will be missing.')) return;
                  void clearAllSamples().then(() => flash('Saved samples cleared'), () => flash('Could not clear samples'));
                }}>Clear saved samples</button>
                <button className="secondary" onClick={() => {
                  if (!window.confirm('Reset MusicMaker? This deletes your saved project, settings and progress.')) return;
                  void clearAllSamples().catch(() => undefined).finally(() => { clearAppData(); window.location.reload(); });
                }}>Reset all app data</button>
              </HeaderTile>
            )}
      {openMenu === 'help' && (
        <TutorialMenu tab={view} done={doneTutorials} onPick={startTutorial}
          onResetProgress={() => { const empty = new Set<string>(); setDoneTutorials(empty); saveDone(empty); }}
          onClose={closeMenu} />
      )}
      {message && <div className="toast" role="status">{message}</div>}


      <nav className={`tabs${openMenu ? ' covered' : ''}`} role="tablist" aria-label="Screens" onKeyDown={onTabKey}>
        {visibleTabs.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={view === t.id} aria-controls={`pane-${t.id}`}
            tabIndex={view === t.id ? 0 : -1} className={`tab-${t.id} ${view === t.id ? 'on' : 'secondary'}`} onClick={() => goTab(t.id)}>
            <Icon name={t.icon} className="tab-icon" /><span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
      {nudge === view && !tutorial && (
        <div className="toast nudge" role="status">New here? <button onClick={() => { setNudge(null); setOpenMenu('help'); }}>Try a tutorial</button>
          <button className="secondary" onClick={() => setNudge(null)}>Dismiss</button></div>
      )}

      <div className={`workspace view-${view}${openMenu ? ' covered' : ''}`}>
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
            <button id="apply-kit" className="secondary" disabled={!drumKitId} onClick={applySelectedDrumKit}>Apply kit</button>
            <label>Template
              <select id="template-select" value="" onChange={(e) => loadTemplate(e.target.value)}>
                <option value="" disabled>Choose…</option>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <MidiInput channels={project.channels} targetChannelId={midiTargetChannelId}
            onTargetChannelChange={setMidiTargetChannelId} recording={midiRecording}
            onRecordingChange={onMidiRecordingChange} onMessage={onMidiMessage}
            onConnected={() => emit('midi-connected')}
            onReleaseAll={() => {
              engine.stopLiveNotes();
              if (midiRecordingRef.current) finishMidiRecording();
              else midiActiveNotesRef.current.clear();
            }} />
          <section className="channels">
        {project.channels.map((c, ci) => {
          const color = COLORS[ci % COLORS.length];
          const def = findSound(project, c.soundId);
          return (
            <div className="channel" key={c.id} style={{ ['--color' as string]: color }}>
              <div className="strip">
                <label>Track name
                  <input aria-label={`Track name ${c.name}`} value={c.name}
                    onChange={(e) => setProject(updateChannel(project, c.id, { name: e.target.value }))} />
                </label>
                {c.generatedMetadata && (
                  <span className="generated-track-badge">
                    Generated · {c.generatedMetadata.kind === 'bass-generation' ? 'Bass'
                      : c.generatedMetadata.kind === 'harmony-generation' ? 'Harmony'
                        : c.generatedMetadata.kind === 'accompaniment-generation' ? 'Accompaniment' : 'Chords'}
                  </span>
                )}
                <SoundPicker sounds={sounds} soundId={c.soundId} unavailableSoundIds={unavailableSoundIds}
                  loadingSoundIds={loadingSoundIds}
                  onPreview={(sound) => preview(sound, c.volume)}
                  onSelect={(sound) => {
                    setProject(updateChannel(project, c.id, { soundId: sound.id, name: sound.name }));
                    preview(sound, c.volume);
                    emit('sound-change');
                  }} />
                <button className="preview-btn" aria-label={`Preview ${c.name}`} onClick={() => preview(def, c.volume)}><Icon name="audio" className="inline-icon" /></button>
                <button aria-pressed={c.mute} className={c.mute ? 'on' : ''} onClick={() => setProject(updateChannel(project, c.id, { mute: !c.mute }))}>M</button>
                <button aria-pressed={c.solo} className={c.solo ? 'on' : ''} onClick={() => setProject(updateChannel(project, c.id, { solo: !c.solo }))}>S</button>
                <input type="range" aria-label={`Volume ${c.name}`} min={0} max={1} step={0.05} value={c.volume}
                  onChange={(e) => setProject(updateChannel(project, c.id, { volume: Number(e.target.value) }))} />
                <input type="range" aria-label={`Pan ${c.name}`} min={-1} max={1} step={0.1} value={c.pan}
                  onChange={(e) => setProject(updateChannel(project, c.id, { pan: Number(e.target.value) }))} />
                <button className="secondary" aria-label={`Duplicate ${c.name}`} disabled={project.channels.length >= MAX_CHANNELS}
                  onClick={() => setProject(duplicateChannel(project, c.id))}><Icon name="duplicate" className="inline-icon" /></button>
                <button className="secondary" aria-pressed={pianoChannels.has(c.id)} aria-label={`${pianoChannels.has(c.id) ? 'Show grid' : 'Show piano roll'} for ${c.name}`}
                  onClick={() => togglePiano(c.id)}><Icon name={pianoChannels.has(c.id) ? 'grid' : 'piano'} className="inline-icon" /> {pianoChannels.has(c.id) ? 'Grid' : 'Piano roll'}</button>
                <button className="secondary" aria-label={`Remove ${c.name}`} onClick={() => {
                  const take = project.recognitionTakes.find((item) =>
                    item.channelIds.includes(c.id) || item.originalChannelId === c.id);
                  setProject(take ? removeRecognitionTake(project, take.id) : removeChannel(project, c.id));
                }}><Icon name="close" className="inline-icon" /></button>
              </div>
              {pianoChannels.has(c.id)
                ? <PianoRoll project={project} onChange={setProject} channelId={c.id} onKeyboardNavigate={() => emit('piano-keyboard-nav')} />
                : <BeatGrid channel={c} loopBars={project.loopBars} noteLength={project.noteLength} playStep={playStep}
                  onToggle={(step) => setProject(toggleStep(project, c.id, step))}
                  onKeyboardNavigate={() => emit('keyboard-nav')} />}
            </div>
          );
        })}
            {project.channels.length === 0 && <p className="hint">No channels yet. Add one to start.</p>}
          </section>
          <div className="row">
            <button id="add-channel" disabled={project.channels.length >= MAX_CHANNELS}
              onClick={() => setProject(addChannel(project, STARTER_SOUNDS[4].name, STARTER_SOUNDS[4].id))}><Icon name="add" className="inline-icon" /> Add channel</button>
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
            <button id="make-sound" className="secondary" onClick={() => { if (!designer) emit('designer-open'); setDesigner(!designer); }}><Icon name="sound" className="inline-icon" /> Make a sound</button>
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
        project={project}
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
          emit('sample-updated');
          flash('Sample edits saved ✓');
        }}
        onRecordStart={async (durationMs, bars) => {
          emit('record-start');
          const loopProject = setLoopBars(projectRef.current, bars as LoopBars);
          projectRef.current = loopProject;
          setProject(loopProject);
          if (!engine.playing) {
            await engine.start();
            recognitionPlaybackRef.current = true;
            recognitionPlaybackTimerRef.current = window.setTimeout(() => {
              if (recognitionPlaybackRef.current) engine.stop();
              recognitionPlaybackRef.current = false;
              recognitionPlaybackTimerRef.current = undefined;
            }, durationMs);
          }
        }}
        onRecordStop={() => {
          window.clearTimeout(recognitionPlaybackTimerRef.current);
          recognitionPlaybackTimerRef.current = undefined;
          if (recognitionPlaybackRef.current) engine.stop();
          recognitionPlaybackRef.current = false;
        }}
        onRecognize={(take) => {
          const updated = applyRecognitionTake(project, take);
          if (!updated) {
            flash('There is not enough channel space for this recognition result. Remove a channel and try again.');
            return false;
          }
          setProject(updated);
          flash(`${take.mode === 'beat' ? 'Percussion' : take.mode === 'bass' ? 'Bass' : 'Melody'} track added ✓`);
          return true;
        }}
        onRecognitionBpmChange={(bpm, take) => {
          const updated = setBpm(project, bpm);
          if (!take) {
            setProject(updated);
            return;
          }
          const updatedTake = rebaseRecognitionTakeForTempo(take, bpm, updated.noteLength);
          const result = applyRecognitionTake(updated, updatedTake, bpm);
          if (result) setProject(result);
          else flash('There is not enough channel space to update this recognition track.');
        }}
        onImport={() => emit('sample-imported')}
        onEdit={() => emit('sample-edited')}
        onRecognitionEdit={() => emit('recognition-edited')}
        onLibraryAction={emit}
      />

        </div>

        <div id="pane-song" role="tabpanel" aria-labelledby="tab-song" className={`pane pane-song${view === 'song' ? ' active' : ''}`}>
          <SongEditor project={project} onChange={setProject} />
        </div>
      </div>

      {tutorial && <TutorialOverlay key={tutorial.id} tutorial={tutorial} state={{ project, base, events }} onExit={() => setTutorial(null)} onStep={onTutorialStep}
        onComplete={(t) => setDoneTutorials((d) => { const n = new Set(d).add(t.id); saveDone(n); return n; })} />}
    </main>
  );
}

function BeatGrid({
  channel, loopBars, noteLength, playStep, onToggle, onKeyboardNavigate,
}: {
  channel: Channel;
  loopBars: number;
  noteLength: number;
  playStep: number | null;
  onToggle: (step: number) => void;
  onKeyboardNavigate: () => void;
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
      onKeyboardNavigate();
      setFocusedStep(0);
      event.currentTarget.closest('.grid')?.querySelector<HTMLButtonElement>('[data-step="0"]')?.focus();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      onKeyboardNavigate();
      const last = Math.max(0, steps.length - 1);
      setFocusedStep(last);
      event.currentTarget.closest('.grid')?.querySelector<HTMLButtonElement>(`[data-step="${last}"]`)?.focus();
      return;
    }
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    onKeyboardNavigate();
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
