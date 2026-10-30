import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LOOP_BARS, MAX_CHANNELS, NOTE_LENGTHS, addChannel, addCustomSound, addNote, addSampleSound, duplicateChannel, removeChannel, setBpm, setLoopBars,
  setEffects, setNoteLength, selectPattern, setSwingTemplate, SWING_TEMPLATES, toggleStep, toggleLaneStep, updateChannel, type LoopBars, type NoteLength,
  totalSteps, arrangementLength, type Channel, type Project, type SoundDef, type SynthParams,
  createProject,
} from '../model/project';
import { TEMPLATES } from '../model/templates';
import { loadProject, saveProject } from '../model/storage';
import {
  browserProjectLibrary, clearProjectLibrary, copyName, CURRENT_PROJECT_KEY, deleteNamedProject, listProjects, openNamedProject,
  projectJson, saveNamedProject, type SavedProjectEntry,
} from '../model/projectLibrary';
import { allSounds, findSound, STARTER_SOUNDS } from '../library/sounds';
import { addKitChannel, applyDrumKit, CORE_LANES, DRUM_KITS, findDrumKit, setKitChannelKit } from '../library/drumKits';
import { getSample, saveSample, type SampleData } from '../library/sampleStorage';
import { Engine } from '../audio/engine';
import { startCapture, type CaptureResult } from '../audio/capture';
import { CaptureSheet } from './CaptureSheet';
import { localRecognitionAdapter } from '../library/recognitionAdapter';
import { applyPerformanceMode } from '../model/performanceModes';
import type { RecognitionMode } from '../model/recognition';
import { UndoHistory } from '../model/history';
import { recordingOffsetSeconds } from '../audio/alignment';
import { stepDuration } from '../audio/scheduler';
import { instrumentStore } from '../audio/sampler/browser';
import { instrumentNeeds } from '../audio/sampler/instrumentStore';
import { hearTakeAs } from '../model/hearAs';
import { refreshChordRows } from '../model/chordRow';
import { applyRhythm } from '../model/rhythmUse';
import { addPersonalInstrument, addRecordedChords, personalAudio, personalManifest } from '../model/personalInstrument';
import { applyRecognitionTake, createRecognitionTake, rebaseRecognitionTakeForTempo, removeRecognitionTake } from '../model/recognitionProject';
import type { RecognitionTake } from '../model/recognition';
import { countNotes, TUTORIALS, type Tutorial, type TutorialStep, type View } from '../tutorial/tutorials';
import { TutorialMenu, TutorialOverlay } from './Tutorial';
import { loadDone, saveDone } from '../tutorial/progress';
import { SoundDesigner } from './SoundDesigner';
import { SampleLibrary } from './SampleLibrary';
import { SoundPicker } from './SoundPicker';
import { PianoRoll, SongEditor } from './CompositionEditor';
import { BarsView } from './BarsView';
import { TrackPatternTools } from './TrackPatternTools';
import { gridCells } from '../model/trackPattern';
import { confineTakeToBar, shiftTakeStart } from '../model/takeStart';
import { barPreview } from '../model/bars';
import { OfflineInstruments } from './OfflineInstruments';
import { voiceLanguage } from '../platform/voice';
import { decodeSong, songLink, songPayload } from '../model/songLink';
import { recordVideo, videoSupported } from './videoExport';
import type { VideoShape } from '../library/videoPlan';
import { MidiInput } from './MidiInput';
import { AppearanceSettings } from './AppearanceSettings';
import { loadTheme, saveTheme, type ThemeId } from './themes';
import { recordedMidiEvent, type MidiMessage, type RecordedMidiNote } from '../platform/midi';
import { clearAllSamples } from '../library/sampleStorage';
import { clearAppData, loadPreferences, savePreferences, MIDI_INPUT_KEY, type VoiceLanguage } from './preferences';
import { HeaderTile } from './Popover';
import { loadExportDefaults, saveExportDefaults } from './exportDefaults';
import { Icon, type IconName } from './Icon';
import '@fontsource/exo-2/700.css';
import './styles.css';

const COLORS = Array.from({ length: 8 }, (_, index) => `var(--channel-${index + 1})`);
const SEEN_KEY = 'musicmaker.tutorialSeen';
const VIEW_KEY = 'musicmaker.view';
const BEAT_VIEW_KEY = 'musicmaker.beatView';
type HeaderMenu = 'file' | 'settings' | 'help' | 'capture' | 'song';

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
  const [midiOpen, setMidiOpen] = useState(false);
  const [toolChannels, setToolChannels] = useState<ReadonlySet<string>>(new Set());
  const toggleTools = (id: string) => {
    if (!toolChannels.has(id)) emit('pattern-tools');
    setToolChannels((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  // Phones show one bar of every grid at a time, with a bar pager above the tracks.
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 600px)').matches === true);
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 600px)');
    if (!query) return;
    const update = () => setNarrow(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  const [viewBar, setViewBar] = useState(0);
  const pagerBar = Math.min(viewBar, project.loopBars - 1);
  const shownBar = narrow && project.loopBars > 1 ? pagerBar : undefined;
  const [beatView, setBeatView] = useState<'tracks' | 'bars'>(() => {
    try { return localStorage.getItem(BEAT_VIEW_KEY) === 'bars' ? 'bars' : 'tracks'; } catch { return 'tracks'; }
  });
  const pickBeatView = (next: 'tracks' | 'bars') => {
    setBeatView(next);
    try { localStorage.setItem(BEAT_VIEW_KEY, next); } catch { /* storage unavailable */ }
  };
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
  const [toastUndo, setToastUndo] = useState(false);
  const toastTimerRef = useRef<number | undefined>(undefined);
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
  /** A temporary project being auditioned (Song › Chords by ear); playback uses it instead of the project. */
  const auditionRef = useRef<Project | undefined>(undefined);
  engineRef.current ??= new Engine(() => auditionRef.current ?? projectRef.current, setPlayStep, (id) => sampleDataRef.current.get(id), instrumentStore);
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

  // Named projects: the working project autosaves; Save stores it under its name in the library.
  const [projectId, setProjectIdState] = useState<string | undefined>(() => {
    try { return localStorage.getItem(CURRENT_PROJECT_KEY) ?? undefined; } catch { return undefined; }
  });
  const setProjectId = (id: string | undefined) => {
    setProjectIdState(id);
    try { if (id) localStorage.setItem(CURRENT_PROJECT_KEY, id); else localStorage.removeItem(CURRENT_PROJECT_KEY); } catch { /* storage unavailable */ }
  };
  const [savedJson, setSavedJson] = useState<string>();
  const [savedProjects, setSavedProjects] = useState<SavedProjectEntry[]>([]);
  const refreshProjects = () => { void listProjects(browserProjectLibrary).then(setSavedProjects, () => setSavedProjects([])); };
  useEffect(() => {
    refreshProjects();
    if (projectId) void openNamedProject(browserProjectLibrary, projectId).then((saved) => setSavedJson(saved?.json), () => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dirty = useMemo(() => !projectId || savedJson !== projectJson(project), [project, projectId, savedJson]);
  const confirmLeave = () => !dirty || countNotes(project) === 0 || window.confirm('Leave this project? Unsaved changes are lost.');
  const saveNamed = async (asNew: boolean) => {
    try {
      const target = asNew ? { ...project, name: copyName(project.name, savedProjects.map((entry) => entry.name)) } : project;
      const { id } = await saveNamedProject(browserProjectLibrary, target, asNew ? undefined : projectId);
      if (asNew) setProject(target);
      setProjectId(id);
      setSavedJson(projectJson(target));
      refreshProjects();
      emit('save');
      flash(`${target.name.trim() || 'Untitled'} saved ✓`);
    } catch {
      flash('Could not save · storage full?');
    }
  };
  const openSaved = async (id: string) => {
    if (id === projectId && !dirty) return;
    if (!confirmLeave()) return;
    const saved = await openNamedProject(browserProjectLibrary, id).catch(() => undefined);
    if (!saved) { flash('Could not open project'); refreshProjects(); return; }
    engine.stop();
    auditionRef.current = undefined;
    const own = projectRef.current.customSounds.filter((sound) => sound.assetSource === 'user-sample'
      && !saved.project.customSounds.some((item) => item.id === sound.id));
    const opened = own.length ? { ...saved.project, customSounds: [...saved.project.customSounds, ...own] } : saved.project;
    setProject(opened);
    setProjectId(id);
    setSavedJson(own.length ? projectJson(opened) : saved.json);
    closeMenu();
    flash(`${saved.project.name} opened`);
  };
  const newProject = () => {
    if (!confirmLeave()) return;
    engine.stop();
    auditionRef.current = undefined;
    const fresh = createProject('Untitled');
    setProject({ ...fresh, customSounds: projectRef.current.customSounds.filter((sound) => sound.assetSource === 'user-sample') });
    setProjectId(undefined);
    setSavedJson(undefined);
    closeMenu();
  };
  const removeSaved = async (entry: SavedProjectEntry) => {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    await deleteNamedProject(browserProjectLibrary, entry.id).catch(() => undefined);
    if (entry.id === projectId) { setProjectId(undefined); setSavedJson(undefined); }
    refreshProjects();
  };

  // Song links: a project in the URL fragment opens as a song to hear, then open to remix.
  const [incoming, setIncoming] = useState<Project>();
  const [incomingPlaying, setIncomingPlaying] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [videoShape, setVideoShape] = useState<VideoShape>('vertical');
  const [videoProgress, setVideoProgress] = useState('');
  useEffect(() => { if (playStep === null) setIncomingPlaying(false); }, [playStep]);
  useEffect(() => {
    const read = () => {
      const payload = songPayload(window.location.hash);
      if (!payload) return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      void decodeSong(payload).then((song) => {
        if (song) { setIncoming(song); setOpenMenu('song'); } else flash('Song link not readable');
      });
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const historyRef = useRef<UndoHistory<Project> | undefined>(undefined);
  historyRef.current ??= new UndoHistory(project);
  const history = historyRef.current;
  const historyTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Coalesce rapid edits (slider drags, typing) into one undo step.
    window.clearTimeout(historyTimerRef.current);
    historyTimerRef.current = window.setTimeout(() => history.commit(projectRef.current), 400);
    return () => window.clearTimeout(historyTimerRef.current);
  }, [project, history]);
  const undo = useCallback(() => {
    window.clearTimeout(historyTimerRef.current);
    const previous = history.undo(projectRef.current);
    if (previous) { engineRef.current?.stopLiveNotes(); setProject(previous); setMessage(''); }
  }, [history]);
  const redo = useCallback(() => {
    window.clearTimeout(historyTimerRef.current);
    const next = history.redo(projectRef.current);
    if (next) setProject(next);
  }, [history]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
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
  const [instrumentVersion, setInstrumentVersion] = useState(0);
  useEffect(() => instrumentStore.subscribe(() => setInstrumentVersion((version) => version + 1)), []);
  // Say once when an instrument the project uses can't load (missing or corrupt files); it plays its synth sound instead.
  const reportedInstrumentsRef = useRef(new Set<string>());
  useEffect(() => {
    for (const channel of project.channels) {
      const sound = findSound(project, channel.soundId);
      const id = sound?.instrumentId;
      if (!sound || !id || instrumentStore.status(id)?.state !== 'error' || reportedInstrumentsRef.current.has(id)) continue;
      reportedInstrumentsRef.current.add(id);
      flash(`${sound.name} unavailable · playing a synth sound`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrumentVersion, project.channels]);
  // Personal instruments are built from saved samples and registered with the sampler (expansion.md E6).
  useEffect(() => {
    if (!samplesLoaded) return;
    for (const instrument of project.personalInstruments ?? []) {
      instrumentStore.register(personalManifest(instrument), personalAudio(instrument, sampleData));
    }
  }, [project.personalInstruments, sampleData, samplesLoaded]);
  useEffect(() => {
    // Load sampled instruments the project uses in the background, so Play starts without waiting.
    const timer = window.setTimeout(() => void instrumentStore.prepare(instrumentNeeds(project)), 250);
    return () => window.clearTimeout(timer);
  }, [project]);
  const unavailableSoundIds = useMemo(() => new Set([
    ...(samplesLoaded
      ? sounds.filter((sound) => sound.sampleId && !sampleData.has(sound.sampleId)).map((sound) => sound.id)
      : []),
    ...sounds.filter((sound) => sound.instrumentId && instrumentStore.status(sound.instrumentId)?.state === 'error')
      .map((sound) => sound.id),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [sounds, sampleData, samplesLoaded, instrumentVersion]);
  const loadingSoundIds = useMemo(() => new Set([
    ...(samplesLoaded ? [] : sounds.filter((sound) => sound.sampleId).map((sound) => sound.id)),
    ...sounds.filter((sound) => sound.instrumentId && instrumentStore.status(sound.instrumentId)?.state === 'loading')
      .map((sound) => sound.id),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [sounds, samplesLoaded, instrumentVersion]);

  const togglePlay = async () => {
    if (engine.playing) { engine.stop(); auditionRef.current = undefined; }
    else {
      auditionRef.current = undefined;
      await engine.start();
      emit('play');
      if (engine.audioState !== 'running' && !await engine.resumeAudio()) flash('Audio blocked by the browser · tap Play again');
    }
  };
  const audition = async (preview?: Project) => {
    engine.stop();
    auditionRef.current = preview;
    if (preview) await engine.start();
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
    flash(`${kit.name} applied · patterns preserved ✓`, true);
  };

  /** Render the project to WAV in a worker with the sampled instruments it uses. */
  const renderWav = async (target: Project, options: { sampleRate: number; bitDepth: 16 | 24; normalize: boolean }) => {
    const samples = [...sampleData.values()].map((sample) => ({
      id: sample.id,
      samples: sample.samples.slice(),
      sampleRate: sample.sampleRate,
    }));
    const needs = instrumentNeeds(target);
    await instrumentStore.prepare(needs);
    const instruments = instrumentStore.exportAudio(needs.keys());
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const worker = new Worker(new URL('../audio/exportWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        worker.terminate();
        resolve(event.data);
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(event.error ?? new Error(event.message));
      };
      worker.postMessage({ project: target, samples, ...options, instruments },
        [...samples.map((sample) => sample.samples.buffer), ...instruments.regions.map((region) => region.data.buffer)]);
    });
  };

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const fileBase = () => project.name.replace(/[^\w-]+/g, '_') || 'loop';

  const exportWav = async () => {
    if (exporting) return;
    setExporting(true);
    flash('Preparing WAV export…');
    try {
      const wav = await renderWav(project, { sampleRate: exportSampleRate, bitDepth: exportBitDepth, normalize: normalizeExport });
      download(new Blob([wav], { type: 'audio/wav' }), `${fileBase()}.wav`);
      emit('export');
      flash('WAV exported ✓');
    } catch {
      flash('WAV export failed. Check project size and browser memory, then try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportVideo = async () => {
    if (videoProgress) return;
    setVideoProgress('0 s');
    try {
      if (engine.playing) { engine.stop(); auditionRef.current = undefined; }
      const songWav = await renderWav(project, { sampleRate: 48000, bitDepth: 16, normalize: true });
      const withOriginal = project.channels.find((channel) => channel.original);
      const sampleId = withOriginal && project.customSounds.find((sound) => sound.id === withOriginal.original!.soundId)?.sampleId;
      const data = sampleId ? sampleDataRef.current.get(sampleId) : undefined;
      const { blob, extension } = await recordVideo({
        project, shape: videoShape, songWav,
        ...(data ? { original: { samples: data.originalSamples ?? data.samples, sampleRate: data.sampleRate } } : {}),
        onProgress: (seconds, total) => setVideoProgress(`${Math.floor(seconds)}/${Math.ceil(total)} s`),
      });
      const file = new File([blob], `${fileBase()}.${extension}`, { type: blob.type });
      try {
        if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: project.name }); flash('Video ready ✓'); return; }
      } catch { /* share cancelled: download instead */ }
      download(blob, file.name);
      flash('Video exported ✓');
    } catch {
      flash('Video export failed');
    } finally {
      setVideoProgress('');
    }
  };

  /** Show a short status message; `undoable` adds an Undo action for big one-shot changes. */
  const recordingOffsetFor = (recorderStartMs: number, inputLatencySec: number) => {
    const beatZeroAudibleMs = engine.playbackBeatZeroMs;
    if (beatZeroAudibleMs === undefined) return undefined;
    // The loop that is playing: the whole project, or one bar on its own while capturing over a bar.
    const p = auditionRef.current ?? projectRef.current;
    return recordingOffsetSeconds({
      beatZeroAudibleMs, recorderStartMs, inputLatencySec, userOffsetMs: prefs.recordingOffsetMs,
      loopSeconds: (arrangementLength(p) || totalSteps(p)) * stepDuration(p.bpm, p.noteLength),
    });
  };
  const captureEngineRef = useRef(false);
  const startCaptureSession = async (metronome: boolean, bar?: number, playAlong = true) => {
    engine.setMetronome(metronome);
    const loop = bar !== undefined ? barPreview(projectRef.current, bar) : undefined;
    if (!playAlong) {
      // Only the metronome: the loop keeps time silently, so the take still lines up with the grid.
      engine.stop();
      const base = loop ?? projectRef.current;
      auditionRef.current = { ...base, arrangement: [], channels: [] };
      await engine.start();
      captureEngineRef.current = true;
    } else if (loop) {
      engine.stop();
      auditionRef.current = loop;
      await engine.start();
      captureEngineRef.current = true;
    } else if (!engine.playing) { await engine.start(); captureEngineRef.current = true; }
    try {
      return await startCapture(recordingOffsetFor);
    } catch (reason) {
      stopCaptureSession();
      throw reason;
    }
  };
  const stopCaptureSession = () => {
    engine.setMetronome(false);
    if (captureEngineRef.current) { engine.stop(); auditionRef.current = undefined; }
    captureEngineRef.current = false;
  };
  const applyCapture = async (capture: CaptureResult, kind: RecognitionMode, into: string | undefined, bar?: number) => {
    const current = projectRef.current;
    const kindLabel = kind === 'beat' ? 'Beat' : kind === 'bass' ? 'Bass' : 'Melody';
    const label = `${kindLabel} ${current.recognitionTakes.filter((take) => take.mode === kind).length + 1}`;
    const sample: SampleData = {
      id: globalThis.crypto?.randomUUID?.() ?? `sample-${Date.now().toString(36)}`,
      samples: capture.samples,
      originalSamples: capture.samples,
      sampleRate: capture.sampleRate,
      recordedAt: Date.now(),
      source: 'mic',
      ...(capture.recordingOffsetSeconds === undefined ? {} : { recordingOffsetSeconds: capture.recordingOffsetSeconds }),
      metadataVersion: 2,
    };
    // Keep the recording before analysis, so a failed analysis never loses the idea.
    await saveSample(sample);
    const samples = new Map(sampleDataRef.current);
    samples.set(sample.id, sample);
    sampleDataRef.current = samples;
    setSampleData(samples);
    const withSound = addSampleSound(projectRef.current, label, sample.id, ['idea']);
    const result = await localRecognitionAdapter.recognize(sample.samples, sample.sampleRate, kind);
    if (!result.events.length) {
      setProject(withSound);
      flash(`${label} saved · nothing to put on the grid`, true);
      return;
    }
    const created = createRecognitionTake(sample.id, result, { enabled: true, strength: 0.5, subdivision: 'sixteenth' },
      withSound.bpm, withSound.noteLength, undefined, 0.5, false, withSound.scaleRoot, withSound.scaleId, sample.recordingOffsetSeconds ?? 0);
    const placed = bar === undefined ? created
      : confineTakeToBar(created, bar, withSound.noteLength * stepDuration(withSound.bpm, withSound.noteLength));
    if (!placed.originalEvents.length) {
      setProject(withSound);
      flash(`${label} saved · nothing to put on the grid`, true);
      return;
    }
    const take = {
      ...applyPerformanceMode(placed, 'cleaned', withSound.bpm, withSound.noteLength, withSound.scaleRoot, withSound.scaleId),
      source: 'mic' as const, label, ...(into ? { targetChannelId: into } : {}),
    };
    const updated = applyRecognitionTake(withSound, take);
    if (!updated) {
      setProject(withSound);
      flash('No room for another track. Remove a channel or capture into an existing one.');
      return;
    }
    setProject(updated);
    emit('capture');
    closeMenu();
    flash(`${label} added`, true);
  };
  const flash = (m: string, undoable = false) => {
    window.clearTimeout(toastTimerRef.current);
    setMessage(m);
    setToastUndo(undoable);
    toastTimerRef.current = window.setTimeout(() => { setMessage(''); setToastUndo(false); }, undoable ? 5000 : 2500);
  };
  const preview = (d: SoundDef | undefined, vol?: number) => { if (d) { void engine.preview(d, vol); emit('preview'); } };

  const loadTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    if (countNotes(project) > 0 && !window.confirm('Replace your current beat with this template?')) return;
    engine.stop();
    setProject({ ...t.make(), customSounds: project.customSounds });
    setProjectId(undefined);
    setSavedJson(undefined);
    emit('template');
    flash(`${t.label} loaded`, true);
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
        <h1 className="app-brand"><img className="app-logo" src={`${import.meta.env.BASE_URL}icon-v2.png`} alt="" /><img className="app-wordmark" src={`${import.meta.env.BASE_URL}wordmark.svg`} alt="MusicMaker" /></h1>
        <div className="header-menus">
          <div className="project-menu">
            <button className="secondary icon-btn" aria-haspopup="true" aria-expanded={openMenu === 'file'} aria-label="File menu" title="File" onClick={() => toggleMenu('file')}><Icon name="file" /></button>
          </div>
          <div className="project-menu">
            <button className="secondary icon-btn" aria-haspopup="true" aria-expanded={openMenu === 'settings'} aria-label="Settings" title="Settings" onClick={() => toggleMenu('settings')}><Icon name="settings" /></button>
          </div>
          <button className="secondary icon-btn help-btn" aria-label="Help" title="Help" aria-haspopup="true" aria-expanded={openMenu === 'help'} onClick={() => toggleMenu('help')}><Icon name="help" /></button>
          <button id="capture-btn" className={`icon-btn capture-btn${openMenu === 'capture' ? ' on' : ' secondary'}`} aria-label="Capture" title="Capture"
            aria-haspopup="true" aria-expanded={openMenu === 'capture'} onClick={() => toggleMenu('capture')}><Icon name="record" /></button>
          <button id="play-btn" className="play" onClick={togglePlay} aria-label={playStep === null ? 'Play' : 'Stop'}>
            <Icon name={playStep === null ? 'play' : 'stop'} className="inline-icon" /> {playStep === null ? 'Play' : 'Stop'}
          </button>
        </div>
      </header>
            {openMenu === 'file' && (
              <HeaderTile label="File" onClose={closeMenu}>
                <div className="row undo-row">
                  <button id="undo-btn" className="secondary" disabled={!history.canUndo(project)} onClick={undo}>Undo</button>
                  <button id="redo-btn" className="secondary" disabled={!history.canRedo(project)} onClick={redo}>Redo</button>
                </div>
                <label>Project name
                  <input id="project-name" value={project.name} maxLength={60} onChange={(event) => setProject({ ...project, name: event.target.value })} />
                </label>
                <div className="row save-row">
                  <button id="save-btn" disabled={!dirty} onClick={() => void saveNamed(false)}>{dirty ? 'Save' : 'Saved'}</button>
                  <button id="save-as-btn" className="secondary" disabled={!projectId} onClick={() => void saveNamed(true)}>Save as new</button>
                </div>
                <h3>Projects</h3>
                {savedProjects.length > 0 && (
                  <ul className="project-list" aria-label="Saved projects">
                    {savedProjects.map((entry) => (
                      <li key={entry.id} className={entry.id === projectId ? 'current' : ''}>
                        <span className="project-entry">
                          <span className="project-entry-name">{entry.name}</span>
                          <span className="project-entry-date">{new Date(entry.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </span>
                        <button className="secondary" aria-label={`Open ${entry.name}`} disabled={entry.id === projectId && !dirty}
                          onClick={() => void openSaved(entry.id)}>Open</button>
                        <button className="secondary" aria-label={`Delete ${entry.name}`} onClick={() => void removeSaved(entry)}><Icon name="close" className="inline-icon" /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <button id="new-project" className="secondary" onClick={newProject}><Icon name="add" className="inline-icon" /> New project</button>
                <h3>Share</h3>
                <button id="share-link" className="secondary" onClick={() => {
                  void songLink(project, window.location.origin + import.meta.env.BASE_URL).then(async (url) => {
                    setShareUrl(url);
                    try {
                      if (navigator.share) { await navigator.share({ title: project.name, url }); return; }
                      await navigator.clipboard.writeText(url);
                      flash('Link copied ✓');
                    } catch { /* share cancelled or clipboard blocked: the link stays in the field */ }
                  });
                }}><Icon name="share" className="inline-icon" /> Share link</button>
                {shareUrl && <input id="share-url" aria-label="Song link" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} />}
                <h3>Export</h3>
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
                {videoSupported() && (
                  <div className="video-export">
                    <label>Video
                      <select id="video-shape" value={videoShape} onChange={(event) => setVideoShape(event.target.value as VideoShape)}>
                        <option value="vertical">Vertical</option>
                        <option value="square">Square</option>
                      </select>
                    </label>
                    <button id="export-video" disabled={Boolean(videoProgress)} onClick={() => void exportVideo()}>
                      {videoProgress ? `Recording ${videoProgress}` : 'Export video'}</button>
                  </div>
                )}
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
                <label>Recording offset (ms)
                  <input id="recording-offset" type="number" min={-500} max={500} step={5} value={prefs.recordingOffsetMs}
                    onChange={(e) => updatePrefs({ recordingOffsetMs: Math.max(-500, Math.min(500, Math.round(Number(e.target.value) || 0))) })} />
                </label>
                <h3>Voice</h3>
                <label>Voice language
                  <select id="voice-language" value={prefs.voiceLanguage} onChange={(e) => updatePrefs({ voiceLanguage: e.target.value as VoiceLanguage })}>
                    <option value="auto">Auto</option>
                    <option value="en-US">English</option>
                    <option value="hr-HR">Hrvatski</option>
                  </select>
                </label>
                <label className="check-label"><input id="voice-online" type="checkbox" checked={prefs.voiceOnline}
                  onChange={(e) => updatePrefs({ voiceOnline: e.target.checked })} /> Online recognition (browser service)</label>
                <h3>Offline</h3>
                <OfflineInstruments onMessage={flash} />
                <h3>Data and privacy</h3>
                <p className="hint">Projects, settings and recordings stay in this browser; nothing is uploaded.</p>
                <button className="secondary" onClick={() => {
                  if (!window.confirm('Delete all saved sample audio? Projects keep their sound settings but samples will be missing.')) return;
                  void clearAllSamples().then(() => flash('Saved samples cleared'), () => flash('Could not clear samples'));
                }}>Clear saved samples</button>
                <button className="secondary" onClick={() => {
                  if (!window.confirm('Reset MusicMaker? This deletes your saved project, settings and progress.')) return;
                  void clearAllSamples().catch(() => undefined).then(() => clearProjectLibrary()).finally(() => { clearAppData(); window.location.reload(); });
                }}>Reset all app data</button>
              </HeaderTile>
            )}
      {openMenu === 'song' && incoming && (
        <HeaderTile label="Song" onClose={() => { if (incomingPlaying) void audition(undefined); setIncomingPlaying(false); setIncoming(undefined); closeMenu(); }}>
          <div className="song-link">
            <strong id="song-link-name">{incoming.name}</strong>
            <span>{incoming.bpm} BPM · {incoming.channels.length} tracks</span>
            <div className="song-link-actions">
              <button id="song-link-play" className="secondary" aria-label={incomingPlaying ? 'Stop' : 'Play'} onClick={() => {
                if (incomingPlaying) { void audition(undefined); setIncomingPlaying(false); return; }
                setIncomingPlaying(true);
                void audition(incoming);
              }}><Icon name={incomingPlaying ? 'stop' : 'play'} className="inline-icon" /></button>
              <button id="song-link-open" onClick={() => {
                if (incomingPlaying) void audition(undefined);
                try { localStorage.setItem('musicmaker.project.beforeLink', JSON.stringify(projectRef.current)); } catch { /* storage full */ }
                const own = projectRef.current.customSounds.filter((sound) => sound.assetSource === 'user-sample'
                  && !incoming.customSounds.some((item) => item.id === sound.id));
                setProject({ ...incoming, customSounds: [...incoming.customSounds, ...own] });
                setProjectId(undefined);
                setSavedJson(undefined);
                setIncomingPlaying(false);
                setIncoming(undefined);
                closeMenu();
                flash(`${incoming.name} opened`, true);
              }}>Open</button>
            </div>
          </div>
        </HeaderTile>
      )}
      {openMenu === 'capture' && (
        <HeaderTile label="Capture" onClose={closeMenu}>
          <CaptureSheet
            channels={project.channels.filter((channel) => !channel.lanes && findSound(project, channel.soundId)?.playbackMode !== 'one-shot')}
            beatChannels={project.channels.filter((channel) => channel.lanes)}
            hasSound={project.channels.some((channel) => !channel.mute && (channel.steps.some(Boolean) || channel.notes.length > 0
              || (channel.chordEvents?.length ?? 0) > 0 || (channel.lanes ?? []).some((lane) => lane.steps.some(Boolean))))}
            project={project}
            startTap={async (metronome) => {
              engine.setMetronome(metronome);
              auditionRef.current = undefined;
              if (!engine.playing) { await engine.start(); captureEngineRef.current = true; }
            }}
            beatZeroMs={() => engine.playbackBeatZeroMs}
            onUseRhythm={(rhythm, use, into) => {
              const updated = applyRhythm(projectRef.current, rhythm, use, into);
              if (updated === projectRef.current) { flash('No room for another track. Choose one in Into.'); return; }
              setProject(updated);
              closeMenu();
              flash('Rhythm added', true);
            }}
            onUseDrawn={(notes) => {
              const current = projectRef.current;
              const added = addChannel(current, 'Drawn melody', 'grand-piano');
              if (added === current) { flash('No room for another track.'); return; }
              auditionRef.current = undefined;
              setProject(updateChannel(added, added.channels.at(-1)!.id, { notes }));
              closeMenu();
              flash('Melody added', true);
            }}
            onAudition={(preview) => void audition(preview)}
            playing={playStep !== null}
            onOpenSong={(section) => {
              closeMenu();
              goTab('song');
              window.setTimeout(() => document.querySelector(section === 'chords' ? '.chords-by-ear' : '.harmony-assistant')
                ?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
            }}
            start={startCaptureSession}
            stop={stopCaptureSession}
            onUse={applyCapture}
            onPlay={(capture) => void engine.previewSample({ id: 'capture', samples: capture.samples, sampleRate: capture.sampleRate })}
          />
        </HeaderTile>
      )}
      {openMenu === 'help' && (
        <TutorialMenu tab={view} done={doneTutorials} onPick={startTutorial}
          onResetProgress={() => { const empty = new Set<string>(); setDoneTutorials(empty); saveDone(empty); }}
          onClose={closeMenu} />
      )}
      {message && <div className="toast" role="status">{message}{toastUndo && <button className="toast-undo" onClick={() => { undo(); setMessage(''); setToastUndo(false); }}>Undo</button>}</div>}


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
            <label>Template
              <select id="template-select" value="" onChange={(e) => loadTemplate(e.target.value)}>
                <option value="" disabled>Choose…</option>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label>BPM
              <input id="bpm-input" type="number" min={40} max={200} value={project.bpm} onChange={(e) => setProject(setBpm(project, Number(e.target.value)))} />
            </label>
            <label>Note length
              <select id="note-length" value={project.noteLength} onChange={(e) => setProject(refreshChordRows(setNoteLength(project, Number(e.target.value) as NoteLength)))}>
                {NOTE_LENGTHS.map((n) => <option key={n} value={n}>1/{n}</option>)}
              </select>
            </label>
            <label>Loop
              <select id="loop-bars" value={project.loopBars} onChange={(e) => setProject(refreshChordRows(setLoopBars(project, Number(e.target.value) as LoopBars)))}>
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
          </div>
          <div className="beat-view-toggle" role="group" aria-label="View">
            <button id="view-tracks" className={beatView === 'tracks' ? 'on' : 'secondary'} aria-pressed={beatView === 'tracks'}
              onClick={() => pickBeatView('tracks')}>Tracks</button>
            <button id="view-bars" className={beatView === 'bars' ? 'on' : 'secondary'} aria-pressed={beatView === 'bars'}
              onClick={() => pickBeatView('bars')}>Bars</button>
          </div>
          {beatView === 'bars' && !tutorial ? (
            <BarsView project={project} colors={COLORS} playStep={playStep} playing={playStep !== null}
              onChange={setProject}
              onAudition={(preview) => void audition(preview)} />
          ) : (<>
          {shownBar !== undefined && (
            <div className="bar-pager" role="group" aria-label="Bar shown">
              <button className="secondary" aria-label="Previous bar" disabled={pagerBar === 0} onClick={() => setViewBar(pagerBar - 1)}><Icon name="back" className="inline-icon" /></button>
              <span id="bar-pager-value">Bar {pagerBar + 1}/{project.loopBars}</span>
              <button className="secondary" aria-label="Next bar" disabled={pagerBar >= project.loopBars - 1} onClick={() => setViewBar(pagerBar + 1)}><Icon name="forward" className="inline-icon" /></button>
            </div>
          )}
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
                        : c.generatedMetadata.kind === 'accompaniment-generation' ? 'Accompaniment'
                          : c.generatedMetadata.kind === 'phrase-variation' ? 'Phrase' : 'Chords'}
                  </span>
                )}
                {c.lanes ? (
                  <select className="kit-select" aria-label={`Kit for ${c.name}`} value={c.kitId ?? ''}
                    onChange={(e) => {
                      const kit = findDrumKit(e.target.value);
                      if (kit) setProject(setKitChannelKit(project, c.id, kit));
                    }}>
                    {!findDrumKit(c.kitId ?? '') && <option value="">Kit</option>}
                    {DRUM_KITS.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>)}
                  </select>
                ) : <SoundPicker sounds={sounds} soundId={c.soundId} unavailableSoundIds={unavailableSoundIds}
                  loadingSoundIds={loadingSoundIds}
                  onPreview={(sound) => preview(sound, c.volume)}
                  onSelect={(sound) => {
                    setProject(updateChannel(project, c.id, { soundId: sound.id, name: sound.name }));
                    preview(sound, c.volume);
                    emit('sound-change');
                  }} />}
                <button aria-pressed={c.solo} className={c.solo ? 'on' : ''} onClick={() => setProject(updateChannel(project, c.id, { solo: !c.solo }))}>S</button>
                <button aria-pressed={c.mute} className={c.mute ? 'on' : ''} onClick={() => setProject(updateChannel(project, c.id, { mute: !c.mute }))}>M</button>
                <button className="preview-btn" aria-label={`Preview ${c.name}`} onClick={() => preview(def, c.volume)}><Icon name="audio" className="inline-icon" /></button>
                <input type="range" aria-label={`Volume ${c.name}`} min={0} max={1} step={0.05} value={c.volume}
                  onChange={(e) => setProject(updateChannel(project, c.id, { volume: Number(e.target.value) }))} />
                <input type="range" aria-label={`Pan ${c.name}`} min={-1} max={1} step={0.1} value={c.pan}
                  onChange={(e) => setProject(updateChannel(project, c.id, { pan: Number(e.target.value) }))} />
                <button className="secondary" aria-label={`Duplicate ${c.name}`} disabled={project.channels.length >= MAX_CHANNELS}
                  onClick={() => setProject(duplicateChannel(project, c.id))}><Icon name="duplicate" className="inline-icon" /></button>
                {c.original && (
                  <button className={c.playOriginal ? 'on' : 'secondary'} aria-pressed={Boolean(c.playOriginal)}
                    aria-label={`Play original recording with ${c.name}`} title="Original"
                    onClick={() => setProject(updateChannel(project, c.id, { playOriginal: !c.playOriginal }))}><Icon name="record" className="inline-icon" /></button>
                )}
                {!c.lanes && (
                  <button className="secondary" aria-pressed={pianoChannels.has(c.id)} aria-label={`${pianoChannels.has(c.id) ? 'Show grid' : 'Show piano roll'} for ${c.name}`}
                    onClick={() => togglePiano(c.id)}><Icon name={pianoChannels.has(c.id) ? 'grid' : 'piano'} className="inline-icon" /> {pianoChannels.has(c.id) ? 'Grid' : 'Piano roll'}</button>
                )}
                {!pianoChannels.has(c.id) && (
                  <button className={toolChannels.has(c.id) ? 'on' : 'secondary'} aria-pressed={toolChannels.has(c.id)}
                    aria-label={`Pattern tools for ${c.name}`} onClick={() => toggleTools(c.id)}><Icon name="custom" className="inline-icon" /></button>
                )}
                <button className="secondary" aria-label={`Remove ${c.name}`} onClick={() => {
                  const take = project.recognitionTakes.find((item) =>
                    item.channelIds.includes(c.id) || item.originalChannelId === c.id);
                  setProject(take ? removeRecognitionTake(project, take.id) : removeChannel(project, c.id));
                }}><Icon name="close" className="inline-icon" /></button>
              </div>
              {toolChannels.has(c.id) && !pianoChannels.has(c.id) && (
                <TrackPatternTools project={project} channel={c} shownBar={shownBar} onChange={setProject} onMessage={(text) => flash(text)} />
              )}
              {c.lanes
                ? <KitLanes channel={c} loopBars={project.loopBars} noteLength={project.noteLength} playStep={playStep} shownBar={shownBar}
                  onToggle={(laneId, step) => setProject(toggleLaneStep(project, c.id, laneId, step))}
                  onKeyboardNavigate={() => emit('keyboard-nav')} />
                : pianoChannels.has(c.id)
                ? <PianoRoll project={project} onChange={setProject} channelId={c.id} onKeyboardNavigate={() => emit('piano-keyboard-nav')} />
                : <BeatGrid channel={c} loopBars={project.loopBars} noteLength={project.noteLength} playStep={playStep} shownBar={shownBar}
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
            <button id="add-kit" className="secondary" disabled={project.channels.length >= MAX_CHANNELS}
              onClick={() => setProject(addKitChannel(project, findDrumKit(drumKitId) ?? findDrumKit('acoustic-kit')!))}><Icon name="add" className="inline-icon" /> Add kit</button>
          </div>
          <details className="midi-details" open={midiOpen || !!tutorial || midiRecording} onToggle={(e) => setMidiOpen(e.currentTarget.open)}>
            <summary>MIDI keyboard (optional)</summary>
          <MidiInput channels={project.channels} targetChannelId={midiTargetChannelId}
            onTargetChannelChange={setMidiTargetChannelId} recording={midiRecording}
            onRecordingChange={onMidiRecordingChange} onMessage={onMidiMessage}
            onConnected={() => emit('midi-connected')}
            onReleaseAll={() => {
              engine.stopLiveNotes();
              if (midiRecordingRef.current) finishMidiRecording();
              else midiActiveNotesRef.current.clear();
            }} />
          </details>
          </>)}
        </div>

        <div id="pane-sound" role="tabpanel" aria-labelledby="tab-sound" className={`pane pane-sound${view === 'sound' ? ' active' : ''}`}>
          <section className="panel effects-panel" aria-label="Shape a sound">
            <h2>Shape a sound</h2>
        <div className="effect-controls">
          <label>Swing
            <select aria-label="Swing template" value={project.swingTemplate}
              onChange={(e) => setProject(setSwingTemplate(project, e.target.value as Project['swingTemplate']))}>
              {SWING_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
            </select>
          </label>
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
        <SoundDesigner
          onPreview={(name, params: SynthParams) => void engine.preview({ id: 'preview', name, category: 'Mine', params })}
          onSave={(name, params) => { setProject(addCustomSound(project, name, params).project); flash('Saved to your library ✓'); }}
        />

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
        onRecordStart={async (durationMs, _bars, metronome) => {
          emit('record-start');
          engine.setMetronome(metronome);
          // Play the project as it is while recording (or only the metronome when Play along is off); never change its loop.
          if (!engine.playing) {
            let playAlong = false;
            try { playAlong = localStorage.getItem('musicmaker.capturePlayAlong') === '1'; } catch { /* storage unavailable */ }
            if (!playAlong) auditionRef.current = { ...projectRef.current, arrangement: [], channels: [] };
            await engine.start();
            recognitionPlaybackRef.current = true;
            recognitionPlaybackTimerRef.current = window.setTimeout(() => {
              if (recognitionPlaybackRef.current) { engine.stop(); auditionRef.current = undefined; }
              recognitionPlaybackRef.current = false;
              recognitionPlaybackTimerRef.current = undefined;
            }, durationMs);
          }
        }}
        recordingOffset={recordingOffsetFor}
        onRecordStop={() => {
          engine.setMetronome(false);
          window.clearTimeout(recognitionPlaybackTimerRef.current);
          recognitionPlaybackTimerRef.current = undefined;
          if (recognitionPlaybackRef.current) { engine.stop(); auditionRef.current = undefined; }
          recognitionPlaybackRef.current = false;
        }}
        onRecognize={(take, options) => {
          const updated = applyRecognitionTake(project, take, undefined, options);
          if (!updated) {
            flash('There is not enough channel space for this recognition result. Remove a channel and try again.');
            return false;
          }
          setProject(updated);
          flash(`${take.mode === 'beat' ? 'Percussion' : take.mode === 'bass' ? 'Bass' : 'Melody'} track updated ✓`, true);
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
        onRemoveIdea={(takeId) => { setProject(removeRecognitionTake(projectRef.current, takeId)); flash('Idea removed', true); }}
        onHearAs={(takeId, id) => setProject(hearTakeAs(projectRef.current, takeId, id))}
        onShiftStart={(takeId, steps) => setProject(shiftTakeStart(projectRef.current, takeId, steps))}
        onAudition={(preview) => void audition(preview)}
        playing={playStep !== null}
        onUseSound={(channelId, soundId) => { auditionRef.current = undefined; setProject(updateChannel(projectRef.current, channelId, { soundId })); }}
        onMakeChords={(name, chords, fallback) => {
          const { project: next, sound } = addRecordedChords(projectRef.current, name, chords, fallback);
          if (!sound) return;
          setProject(next);
          flash(`${sound.name} added`, true);
        }}
        onMakeInstrument={(name, picked) => {
          const { project: next, sound } = addPersonalInstrument(projectRef.current, name, picked);
          if (!sound) return;
          setProject(next);
          flash(`${sound.name} added`, true);
        }}
        onLibraryAction={emit}
      />

        </div>

        <div id="pane-song" role="tabpanel" aria-labelledby="tab-song" className={`pane pane-song${view === 'song' ? ' active' : ''}`}>
          <SongEditor project={project} onChange={(next) => { auditionRef.current = undefined; setProject(next); }}
            onAudition={(preview) => void audition(preview)} playing={playStep !== null}
            voice={{ lang: voiceLanguage(prefs.voiceLanguage, navigator.languages ?? [navigator.language]), allowOnline: prefs.voiceOnline }}
            onAction={(action) => {
              if (action === 'play') { if (!engine.playing) void togglePlay(); }
              else if (action === 'stop') { if (engine.playing) void togglePlay(); }
              else if (action === 'undo') undo();
              else setOpenMenu('capture');
            }} />
        </div>
      </div>

      {tutorial && <TutorialOverlay key={tutorial.id} tutorial={tutorial} state={{ project, base, events }} onExit={() => setTutorial(null)} onStep={onTutorialStep}
        onComplete={(t) => setDoneTutorials((d) => { const n = new Set(d).add(t.id); saveDone(n); return n; })} />}
    </main>
  );
}

/** A kit channel's lanes, each a beat grid with its name (expansion.md E2b). */
function KitLanes({
  channel, loopBars, noteLength, playStep, shownBar, onToggle, onKeyboardNavigate,
}: {
  channel: Channel;
  loopBars: number;
  noteLength: number;
  playStep: number | null;
  shownBar?: number;
  onToggle: (laneId: string, step: number) => void;
  onKeyboardNavigate: () => void;
}) {
  const [allLanes, setAllLanes] = useState(false);
  const lanes = channel.lanes ?? [];
  const shown = allLanes ? lanes : lanes.filter((lane) => CORE_LANES.includes(lane.id) || lane.steps.some(Boolean));
  return (
    <div className="kit-lanes">
      {shown.map((lane) => (
        <div className="kit-lane" key={lane.id}>
          <span className="kit-lane-name">{lane.name}</span>
          <BeatGrid channel={{ ...channel, name: `${channel.name} ${lane.name}`, steps: lane.steps, stepEventMetadata: lane.stepEventMetadata }}
            loopBars={loopBars} noteLength={noteLength} playStep={playStep} shownBar={shownBar}
            onToggle={(step) => onToggle(lane.id, step)} onKeyboardNavigate={onKeyboardNavigate} />
        </div>
      ))}
      {shown.length < lanes.length || allLanes ? (
        <button className={`kit-lanes-toggle ${allLanes ? 'on' : 'secondary'}`} aria-pressed={allLanes} onClick={() => setAllLanes(!allLanes)}>
          All lanes · {lanes.length}
        </button>
      ) : null}
    </div>
  );
}

function BeatGrid({
  channel, loopBars, noteLength, playStep, shownBar, onToggle, onKeyboardNavigate,
}: {
  channel: Channel;
  loopBars: number;
  noteLength: number;
  playStep: number | null;
  /** On narrow screens, the one bar shown (wraps for tracks shorter than the loop); undefined shows every bar. */
  shownBar?: number;
  onToggle: (step: number) => void;
  onKeyboardNavigate: () => void;
}) {
  const [focusedStep, setFocusedStep] = useState(0);
  const steps = channel.steps;
  const total = loopBars * noteLength;
  const length = channel.lengthSteps && channel.lengthSteps < total ? channel.lengthSteps : total;
  const view = channel.viewSteps && channel.viewSteps < noteLength ? channel.viewSteps : noteLength;
  const every = noteLength / view;
  const trackBars = Math.max(1, Math.ceil(length / noteLength));
  const bars = shownBar === undefined ? Array.from({ length: trackBars }, (_, bar) => bar) : [shownBar % trackBars];
  const rows = bars.map((bar) => {
    const start = bar * noteLength;
    const end = Math.min(length, start + noteLength);
    return { bar, cells: gridCells(steps.slice(start, end), end - start, noteLength, view).map((cell) => ({ ...cell, step: cell.step + start })) };
  });
  const visible = rows.flatMap((row) => row.cells.map((cell) => cell.step));
  const activeFocus = visible.includes(focusedStep) ? focusedStep : visible[0] ?? 0;
  const playing = playStep === null ? null : (playStep % total) % length;
  const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>, step: number) => {
    const index = visible.indexOf(step);
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1
      : event.key === 'ArrowLeft' ? index - 1 : event.key === 'ArrowRight' ? index + 1
        : event.key === 'ArrowUp' ? index - view : event.key === 'ArrowDown' ? index + view : undefined;
    if (target === undefined) return;
    event.preventDefault();
    onKeyboardNavigate();
    const next = visible[Math.max(0, Math.min(visible.length - 1, target))];
    setFocusedStep(next);
    event.currentTarget.closest('.grid')?.querySelector<HTMLButtonElement>(`[data-step="${next}"]`)?.focus();
  };

  return (
    <div className="grid" role="grid" aria-label={`${channel.name} beat grid`}>
      {rows.map(({ bar, cells }) => (
        <div className="bar-row" role="row" key={bar} style={{ gridTemplateColumns: `repeat(${view}, 1fr)` }}>
          {cells.map(({ step, on, hidden }, j) => {
            const metadata = channel.stepEventMetadata?.[step];
            const confidence = metadata?.confidence;
            const details = [
              confidence === undefined ? '' : `${confidence < 0.7 ? 'low confidence ' : 'confidence '}${Math.round(confidence * 100)}%`,
              metadata?.sourceTakeId ? `source take ${metadata.sourceTakeId}` : '',
              hidden ? 'hits between steps' : '',
            ].filter(Boolean).join(', ');
            const isPlaying = playing !== null && playing >= step && playing < step + every;
            return (
              <button key={step} data-step={step} role="gridcell" tabIndex={activeFocus === step ? 0 : -1}
                aria-label={`${channel.name} step ${step + 1}${details ? `, ${details}` : ''}`} aria-pressed={on}
                title={details || undefined}
                className={`step${on ? ' on' : ''}${hidden ? ' hidden-hits' : ''}${j % Math.max(1, view / 4) === 0 ? ' group' : ''}${isPlaying ? ' playing' : ''}${confidence !== undefined ? ' recognized' : ''}${confidence !== undefined && confidence < 0.7 ? ' low-confidence' : ''}`}
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
