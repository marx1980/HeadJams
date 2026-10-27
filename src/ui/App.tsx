import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LOOP_BARS, MAX_CHANNELS, NOTE_LENGTHS, addChannel, addCustomSound, addSampleSound, removeChannel, setBpm, setLoopBars,
  setEffects, setNoteLength, setSwingTemplate, SWING_TEMPLATES, toggleStep, updateChannel, type LoopBars, type NoteLength,
  type Project, type SoundDef, type SynthParams,
} from '../model/project';
import { TEMPLATES } from '../model/templates';
import { loadProject, saveProject } from '../model/storage';
import { allSounds, findSound, SAMPLE_RATE, STARTER_SOUNDS } from '../library/sounds';
import { getSample, saveSample, type SampleData } from '../library/sampleStorage';
import { Engine } from '../audio/engine';
import { renderProject } from '../audio/render';
import { encodeWav } from '../audio/wav';
import { countNotes, TUTORIALS, type Tutorial } from '../tutorial/tutorials';
import { TutorialMenu, TutorialOverlay } from './Tutorial';
import { SoundDesigner } from './SoundDesigner';
import { SampleLibrary } from './SampleLibrary';
import { CompositionEditor } from './CompositionEditor';
import './styles.css';

const COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f15bb5', '#fb8500', '#8ecae6'];
const SEEN_KEY = 'musicmaker.tutorialSeen';

export function App() {
  const [project, setProject] = useState<Project>(loadProject);
  const [playStep, setPlayStep] = useState<number | null>(null);
  const [events, setEvents] = useState<ReadonlySet<string>>(new Set());
  const [tutorial, setTutorial] = useState<Tutorial | null>(null);
  const [base, setBase] = useState<Project>(project);
  const [menu, setMenu] = useState(false);
  const [designer, setDesigner] = useState(false);
  const [message, setMessage] = useState('');
  const [sampleData, setSampleData] = useState<Map<string, SampleData>>(() => new Map());

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
  useEffect(() => {
    let active = true;
    void Promise.all(project.customSounds.flatMap((sound) => sound.sampleId ? [getSample(sound.sampleId).catch(() => undefined)] : []))
      .then((samples) => {
        if (!active) return;
        const loaded = new Map<string, SampleData>();
        samples.forEach((sample) => { if (sample) loaded.set(sample.id, sample); });
        setSampleData(loaded);
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
  const categories = useMemo(() => [...new Set(sounds.map((s) => s.category))], [sounds]);

  const togglePlay = async () => {
    if (engine.playing) engine.stop();
    else { await engine.start(); emit('play'); }
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

  const groupSize = Math.max(1, project.noteLength / 4);

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
        <label>Swing
          <select aria-label="Swing template" value={project.swingTemplate}
            onChange={(e) => setProject(setSwingTemplate(project, e.target.value as Project['swingTemplate']))}>
            {SWING_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
          </select>
        </label>
        <label>Template
          <select value="" onChange={(e) => loadTemplate(e.target.value)}>
            <option value="" disabled>Choose…</option>
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <button id="save-btn" onClick={() => { saveProject(project); emit('save'); flash('Saved ✓'); }}>Save</button>
        <button id="export-btn" onClick={exportWav}>Export WAV</button>
        <button className="secondary" onClick={() => setMenu(true)}>? Tutorials</button>
      </header>
      {message && <div className="toast" role="status">{message}</div>}

      {menu && <TutorialMenu onPick={startTutorial} onClose={() => setMenu(false)} />}

      <section className="channels">
        {project.channels.map((c, ci) => {
          const color = COLORS[ci % COLORS.length];
          const def = findSound(project, c.soundId);
          return (
            <div className="channel" key={c.id} style={{ ['--color' as string]: color }}>
              <div className="strip">
                <select className="sound-select" aria-label={`Sound for ${c.name}`} value={c.soundId}
                  onChange={(e) => {
                    const d = findSound(project, e.target.value);
                    setProject(updateChannel(project, c.id, { soundId: e.target.value, name: d?.name ?? c.name }));
                    preview(d, c.volume);
                    emit('sound-change');
                  }}>
                  {categories.map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {sounds.filter((s) => s.category === cat).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <button className="preview-btn" aria-label={`Preview ${c.name}`} onClick={() => preview(def, c.volume)}>🔊</button>
                <button aria-pressed={c.mute} className={c.mute ? 'on' : ''} onClick={() => setProject(updateChannel(project, c.id, { mute: !c.mute }))}>M</button>
                <button aria-pressed={c.solo} className={c.solo ? 'on' : ''} onClick={() => setProject(updateChannel(project, c.id, { solo: !c.solo }))}>S</button>
                <input type="range" aria-label={`Volume ${c.name}`} min={0} max={1} step={0.05} value={c.volume}
                  onChange={(e) => setProject(updateChannel(project, c.id, { volume: Number(e.target.value) }))} />
                <button className="secondary" aria-label={`Remove ${c.name}`} onClick={() => setProject(removeChannel(project, c.id))}>✕</button>
              </div>
              <div className="grid">
                {Array.from({ length: project.loopBars }, (_, bar) => (
                  <div className="bar-row" key={bar} style={{ gridTemplateColumns: `repeat(${project.noteLength}, 1fr)` }}>
                    {c.steps.slice(bar * project.noteLength, (bar + 1) * project.noteLength).map((on, j) => {
                      const i = bar * project.noteLength + j;
                      return (
                        <button key={i} aria-label={`${c.name} step ${i + 1}`} aria-pressed={on}
                          className={`step${on ? ' on' : ''}${j % groupSize === 0 ? ' group' : ''}${playStep === i ? ' playing' : ''}`}
                          onClick={() => setProject(toggleStep(project, c.id, i))} />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {project.channels.length === 0 && <p className="hint">No channels yet. Add one to start.</p>}
      </section>

      <div className="row">
        <button id="add-channel" disabled={project.channels.length >= MAX_CHANNELS}
          onClick={() => setProject(addChannel(project, STARTER_SOUNDS[4].name, STARTER_SOUNDS[4].id))}>＋ Add channel</button>
        <button className="secondary" onClick={() => setDesigner(!designer)}>🎛 Make a sound</button>
      </div>

      <CompositionEditor project={project} onChange={setProject} />

      <section className="panel effects-panel" aria-label="Sound shaping">
        <h2>Sound shaping</h2>
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

      <SampleLibrary
        sounds={sounds}
        channels={project.channels}
        onPreview={(sound) => preview(sound)}
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
        onRecordStart={() => emit('record-start')}
      />

      {designer && (
        <SoundDesigner
          onPreview={(name, params: SynthParams) => void engine.preview({ id: 'preview', name, category: 'Mine', params })}
          onSave={(name, params) => { setProject(addCustomSound(project, name, params).project); flash('Saved to your library ✓'); }}
          onClose={() => setDesigner(false)}
        />
      )}

      {tutorial && <TutorialOverlay key={tutorial.id} tutorial={tutorial} state={{ project, base, events }} onExit={() => setTutorial(null)} />}
    </main>
  );
}
