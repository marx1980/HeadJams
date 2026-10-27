import type { Project } from '../model/project';

export interface TutorialState {
  project: Project;
  base: Project;
  events: ReadonlySet<string>;
}

export type View = 'beat' | 'sound' | 'library' | 'song';

export type TutorialTab = View | 'global';
export type TutorialLevel = 'beginner' | 'intermediate';

export interface TutorialStep {
  text: string;
  /** Informational step: Next is available immediately (for actions the app cannot detect). */
  info?: boolean;
  /** Shown when the target element is not on screen (e.g. permission denied or feature unavailable). */
  fallback?: string;
  /** Screen that must be showing for this step. */
  view?: View;
  /** Open the project menu (Save / Export). */
  menu?: boolean;
  /** Switch the first channel to piano-roll mode. */
  pianoRoll?: boolean;
  /** CSS selector of the element to highlight ("tap here"). */
  target?: string;
  done: (s: TutorialState) => boolean;
}

export interface Tutorial {
  id: string;
  title: string;
  /** Screen whose Help hub lists this tutorial. */
  tab: TutorialTab;
  /** Feature group inside the tab. */
  group: string;
  summary: string;
  level: TutorialLevel;
  estMinutes: number;
  /** Plan.md feature ids this tutorial covers (checked by the coverage test). */
  features: string[];
  /** Message shown when the final step is completed. */
  doneMessage: string;
  steps: TutorialStep[];
}

export interface Workflow {
  id: string;
  title: string;
  outcome: string;
  tutorialIds: string[];
}

export const GROUPS: Record<TutorialTab, string[]> = {
  beat: ['Grid & timing', 'Channels & sounds', 'Kits & chords', 'Mix & tempo'],
  sound: ['Designer', 'Effects'],
  library: ['Recording', 'Importing', 'Sample Editor', 'Recognition'],
  song: ['Patterns', 'Arrangement', 'Assist', 'Export'],
  global: ['Basics', 'Export', 'Privacy & offline'],
};

export const countNotes = (p: Project): number => p.channels.reduce((n, c) => n + c.steps.filter(Boolean).length, 0);
const countPianoNotes = (p: Project): number => p.channels.reduce((n, channel) => n + (channel.notes?.length ?? 0), 0);

const anyChannel = (s: TutorialState, f: (c: Project['channels'][number], b: Project['channels'][number] | undefined) => boolean): boolean =>
  s.project.channels.some((c) => f(c, s.base.channels.find((x) => x.id === c.id)));
const info = (text: string, extra: Partial<TutorialStep> = {}): TutorialStep => ({ text, info: true, done: () => true, ...extra });
const effectsChanged = (s: TutorialState): boolean => JSON.stringify(s.project.effects) !== JSON.stringify(s.base.effects);

export const FEATURES: { id: string; label: string }[] = [
  { id: 'beat-grid', label: 'Beat grid and playback' }, { id: 'note-length', label: 'Note length' }, { id: 'loops', label: 'Loop bars' },
  { id: 'channels', label: 'Channels and sound picker' }, { id: 'save-export', label: 'Save and WAV export' },
  { id: 'bpm', label: 'BPM' }, { id: 'mix', label: 'Volume, pan, mute and solo' }, { id: 'templates', label: 'Templates' },
  { id: 'swing', label: 'Swing templates' }, { id: 'drum-kits', label: 'Drum kits' }, { id: 'guitar-chords', label: 'Guitar chords' },
  { id: 'picker-tools', label: 'Picker favourites, recent and search' }, { id: 'piano-roll', label: 'Piano roll and scale assist' },
  { id: 'pitch-time', label: 'Pitch and time tools' }, { id: 'sound-designer', label: 'Sound Designer' }, { id: 'effects', label: 'Effects chain' },
  { id: 'recording', label: 'Microphone recording' }, { id: 'import', label: 'Importing audio and the library' },
  { id: 'sample-editor', label: 'Sample Editor' }, { id: 'recognition', label: 'Melody, bass and beatbox recognition' },
  { id: 'recognition-edit', label: 'Recognition correction' }, { id: 'patterns', label: 'Patterns' },
  { id: 'timeline', label: 'Arrangement timeline' }, { id: 'arrangement-assist', label: 'Arrangement assistance' },
  { id: 'export-options', label: 'Export options' }, { id: 'privacy-offline', label: 'Privacy and offline use' },
];

export const TUTORIALS: Tutorial[] = [
  {
    id: 'first-beat', title: '1. Make your first beat', tab: 'beat', group: 'Grid & timing', level: 'beginner', estMinutes: 1,
    summary: 'Place beats in the grid and hear them loop.', features: ['beat-grid'], doneMessage: 'You made a beat! 🎉',
    steps: [
      { view: 'beat', text: 'Tap a square in the grid to place a beat.', target: '.step', done: (s) => countNotes(s.project) > countNotes(s.base) },
      { text: 'Press Play to hear it loop.', target: '#play-btn', done: (s) => s.events.has('play') },
      { view: 'beat', text: 'Add a few more beats while it plays. Tap again to remove one.', target: '.step', done: (s) => countNotes(s.project) >= countNotes(s.base) + 3 },
    ],
  },
  {
    id: 'note-length', title: '2. Change the length of a note', tab: 'beat', group: 'Grid & timing', level: 'beginner', estMinutes: 1,
    summary: 'Switch the grid between 1/4, 1/8 and 1/16 notes.', features: ['note-length'], doneMessage: 'Now you can make slow or fast rhythms.',
    steps: [
      { view: 'beat', text: 'Choose a different note length: 1/4 is slow and long, 1/16 is fast and short.', target: '#note-length', done: (s) => s.project.noteLength !== s.base.noteLength },
      { view: 'beat', text: 'Place a beat on the new grid and press Play.', target: '#play-btn', done: (s) => s.events.has('play') },
    ],
  },
  {
    id: 'loop', title: '3. Create a loop', tab: 'beat', group: 'Grid & timing', level: 'beginner', estMinutes: 1,
    summary: 'Make your loop 1, 2 or 4 bars long.', features: ['loops'], doneMessage: 'Your loop is longer now.',
    steps: [
      { view: 'beat', text: 'Choose how many bars your loop lasts.', target: '#loop-bars', done: (s) => s.project.loopBars !== s.base.loopBars },
      { view: 'beat', text: 'Place a beat in the new bars (the extra rows).', target: '.step', done: (s) => s.project.channels.some((c) => c.steps.some((on, i) => on && i >= s.project.noteLength)) },
      { text: 'Press Play. The playhead loops back to the start.', target: '#play-btn', done: (s) => s.events.has('play') },
    ],
  },
  {
    id: 'add-channel', title: '4. Add a channel', tab: 'beat', group: 'Channels & sounds', level: 'beginner', estMinutes: 1,
    summary: 'Add a row and give it a sound.', features: ['channels'], doneMessage: 'Channels let you layer drums, bass and more.',
    steps: [
      { view: 'beat', text: 'Tap "Add channel" to get a new row.', target: '#add-channel', done: (s) => s.project.channels.length > s.base.channels.length },
      { view: 'beat', text: 'Pick a sound for it from the sound menu.', target: '.sound-picker-trigger', done: (s) => s.events.has('sound-change') },
      { view: 'beat', text: 'Tap the speaker button to preview a sound.', target: '.preview-btn', done: (s) => s.events.has('preview') },
    ],
  },
  {
    id: 'save-export', title: '5. Save and export', tab: 'global', group: 'Export', level: 'beginner', estMinutes: 1,
    summary: 'Save your project and download it as a WAV file.', features: ['save-export'], doneMessage: 'Saved and exported!',
    steps: [
      { text: 'Your work saves automatically. Tap Save to be sure.', menu: true, target: '#save-btn', done: (s) => s.events.has('save') },
      { menu: true, text: 'Tap Export WAV to download your loop as an audio file.', target: '#export-btn', done: (s) => s.events.has('export') },
    ],
  },
  {
    id: 'record-sample', title: '6. Record a sample', tab: 'library', group: 'Recording', level: 'beginner', estMinutes: 2,
    summary: 'Record your own sound with the microphone.', features: ['recording'], doneMessage: 'Your recording is in the library.',
    steps: [
      { view: 'library', text: 'Allow microphone access and record a sound.', target: '#record-sample', fallback: 'Recording needs a microphone and permission. You can import an audio file instead (see "Import audio").', done: (s) => s.events.has('record-start') },
      { view: 'library', text: 'Stop the recording, trim it if needed, and save it to your library.', target: '#save-sample', done: (s) => s.events.has('sample-saved') },
    ],
  },
  {
    id: 'composition', title: '7. Build a composition', tab: 'song', group: 'Patterns', level: 'intermediate', estMinutes: 2,
    summary: 'Patterns, piano roll, chords and the timeline.', features: ['patterns', 'piano-roll', 'timeline'], doneMessage: 'You arranged a song!',
    steps: [
      { view: 'song', text: 'Create a pattern so your composition can have multiple sections.', target: '#new-pattern', done: (s) => s.project.patterns.length > s.base.patterns.length },
      { view: 'beat', pianoRoll: true, text: 'Add a note in the piano roll. Scale tones are highlighted, and Snap to scale keeps notes in key.', target: '#piano-roll-cell', done: (s) => countPianoNotes(s.project) > countPianoNotes(s.base) },
      { view: 'beat', pianoRoll: true, text: 'Use Chord assist to add a chord.', target: '#add-chord', done: (s) => countPianoNotes(s.project) >= countPianoNotes(s.base) + 4 },
      { view: 'song', text: 'Add the selected pattern to the timeline to create a song arrangement.', target: '.arrangement-heading button', done: (s) => s.project.arrangement.length > s.base.arrangement.length },
    ],
  },
  {
    id: 'tempo-swing', title: 'Change tempo and swing', tab: 'beat', group: 'Mix & tempo', level: 'beginner', estMinutes: 1,
    summary: 'Speed up or slow down, and add a groove.', features: ['bpm', 'swing'], doneMessage: 'Tempo and groove set.',
    steps: [
      { view: 'beat', text: 'Change the BPM (beats per minute). Higher is faster.', target: '.bar input[type=number]', done: (s) => s.project.bpm !== s.base.bpm },
      { view: 'sound', text: 'Pick a swing template to make the rhythm bounce.', target: '[aria-label="Swing template"]', done: (s) => s.project.swingTemplate !== s.base.swingTemplate },
    ],
  },
  {
    id: 'mix', title: 'Mix your channels', tab: 'beat', group: 'Mix & tempo', level: 'beginner', estMinutes: 1,
    summary: 'Volume, pan, mute and solo.', features: ['mix'], doneMessage: 'You can balance a whole mix.',
    steps: [
      { view: 'beat', text: 'Drag a Volume slider to make a channel louder or quieter.', target: '.strip input[aria-label^="Volume"]', done: (s) => anyChannel(s, (c, b) => !!b && c.volume !== b.volume) },
      { view: 'beat', text: 'Press M to mute a channel, or S to hear only that channel (solo).', target: '.strip button[aria-pressed]', done: (s) => anyChannel(s, (c, b) => !!b && (c.mute !== b.mute || c.solo !== b.solo)) },
      { view: 'beat', text: 'Drag a Pan slider to move a sound left or right.', target: '.strip input[aria-label^="Pan"]', done: (s) => anyChannel(s, (c, b) => !!b && c.pan !== b.pan) },
    ],
  },
  {
    id: 'templates', title: 'Start from a template', tab: 'beat', group: 'Mix & tempo', level: 'beginner', estMinutes: 1,
    summary: 'Load a ready-made beat.', features: ['templates'], doneMessage: 'Templates are a quick way to start.',
    steps: [
      { menu: true, text: 'Open the Template menu and choose one (this replaces your beat, after asking).', target: '.menu-popup select', done: (s) => s.events.has('template') },
      { text: 'Press Play to hear it.', target: '#play-btn', done: (s) => s.events.has('play') },
    ],
  },
  {
    id: 'sound-picker', title: 'Find sounds fast', tab: 'beat', group: 'Channels & sounds', level: 'beginner', estMinutes: 1,
    summary: 'Search, favourite and reuse recent sounds.', features: ['picker-tools'], doneMessage: 'Favourites and Recent make picking quicker.',
    steps: [
      { view: 'beat', text: 'Open the sound menu on a channel.', target: '.sound-picker-trigger', done: () => typeof document !== 'undefined' && !!document.querySelector('.sound-picker') },
      info('Type in the search box, browse the groups, or tap ☆ to favourite a sound. Favourites and Recent appear at the top.', { target: '.sound-picker' }),
      { view: 'beat', text: 'Choose a sound.', target: '.sound-picker-trigger', done: (s) => s.events.has('sound-change') },
    ],
  },
  {
    id: 'drum-kits', title: 'Use a drum kit', tab: 'beat', group: 'Kits & chords', level: 'beginner', estMinutes: 1,
    summary: 'Apply Studio, 808 or Percussion kits.', features: ['drum-kits'], doneMessage: 'Kit applied. Your patterns were kept.',
    steps: [
      { view: 'beat', text: 'Choose a kit (Studio, 808 or Percussion).', target: '[aria-label="Drum kit"]', done: () => typeof document !== 'undefined' && !!(document.querySelector('[aria-label="Drum kit"]') as HTMLSelectElement | null)?.value },
      { view: 'beat', text: 'Press Apply kit. Your beats stay; only the sounds change.', target: '#apply-kit', done: (s) => s.events.has('kit-applied') },
    ],
  },
  {
    id: 'guitar-chords', title: 'Play guitar chords', tab: 'beat', group: 'Kits & chords', level: 'intermediate', estMinutes: 2,
    summary: 'Add strummed chords with a guitar chord sound.', features: ['guitar-chords'], doneMessage: 'Chords added.',
    steps: [
      { view: 'beat', text: 'Choose a guitar chord sound (e.g. Acoustic Chord) on a channel.', target: '.sound-picker-trigger', done: (s) => s.events.has('sound-change') },
      { view: 'beat', pianoRoll: true, text: 'In the piano roll, choose a chord root, quality and articulation, then tap "Add guitar chord".', target: '.chord-controls', done: (s) => s.project.channels.some((c) => (c.chordEvents?.length ?? 0) > (s.base.channels.find((x) => x.id === c.id)?.chordEvents?.length ?? 0)) },
    ],
  },
  {
    id: 'pitch-time', title: 'Transpose and shift notes', tab: 'beat', group: 'Kits & chords', level: 'intermediate', estMinutes: 1,
    summary: 'Move notes up/down, earlier/later, or longer/shorter.', features: ['pitch-time'], doneMessage: 'Pitch and time tools are in the piano roll.',
    steps: [
      { view: 'beat', pianoRoll: true, text: 'Add a note in the piano roll.', target: '[role=gridcell]', done: (s) => countPianoNotes(s.project) > countPianoNotes(s.base) },
      info('Open "Pitch and time tools" to transpose, shift or double/halve note lengths.', { view: 'beat', pianoRoll: true, target: '.pitch-time-controls' }),
    ],
  },
  {
    id: 'sound-designer', title: 'Design your own sound', tab: 'sound', group: 'Designer', level: 'intermediate', estMinutes: 2,
    summary: 'Shape a synth sound and save it.', features: ['sound-designer'], doneMessage: 'Your sound is saved and ready to use.',
    steps: [
      { view: 'sound', text: 'Tap "Make a sound".', target: '#make-sound', done: (s) => s.events.has('designer-open') },
      info('Move the sliders and preview until it sounds right.', { target: '.designer' }),
      { text: 'Save it to your library.', target: '.designer', done: (s) => s.project.customSounds.length > s.base.customSounds.length },
    ],
  },
  {
    id: 'effects', title: 'Add reverb, delay, filter and EQ', tab: 'sound', group: 'Effects', level: 'beginner', estMinutes: 1,
    summary: 'Shape the whole mix with the effects chain.', features: ['effects'], doneMessage: 'Effects shape everything you play.',
    steps: [
      { view: 'sound', text: 'Raise Reverb for space, or Delay for echoes.', target: '[aria-label="Reverb"], [aria-label="Delay"]', done: (s) => effectsChanged(s) },
      { view: 'sound', text: 'Try the Filter cutoff or an EQ band, then press Play.', target: '[aria-label="Filter cutoff"]', done: (s) => s.events.has('play') },
    ],
  },
  {
    id: 'import-audio', title: 'Import audio', tab: 'library', group: 'Importing', level: 'beginner', estMinutes: 1,
    summary: 'Bring in an audio file and search your library.', features: ['import'], doneMessage: 'Imported samples live in your library.',
    steps: [
      info('Choose an audio file to import, trim it, and save it to the library.', { view: 'library', target: '.sample-library' }),
      { view: 'library', text: 'Save it so it appears in the library.', target: '#save-sample', done: (s) => s.events.has('sample-saved') },
      info('Use search and tags to find sounds, and the pads to play them.', { target: '.sample-library' }),
    ],
  },
  {
    id: 'sample-editor', title: 'Edit a sample', tab: 'library', group: 'Sample Editor', level: 'intermediate', estMinutes: 2,
    summary: 'Trim, clean, tune, stretch and add effects without losing the original.', features: ['sample-editor'], doneMessage: 'Edits are non-destructive: reset any time.',
    steps: [
      info('Pick a sample in "Samples to edit". Your original audio is always kept.', { view: 'library', target: '.sample-edit-list', fallback: 'Record or import a sample first.' }),
      info('Open Clean (trim, gain, noise), Tune (pitch), Time (speed, fit to beat), Tone (EQ, compression) or Creative effects.', { target: '.sample-editor details' }),
      info('Compare with the original, undo/redo, or reset whenever you like.', { target: '.sample-editor' }),
    ],
  },
  {
    id: 'recognize', title: 'Turn a recording into notes', tab: 'library', group: 'Recognition', level: 'intermediate', estMinutes: 2,
    summary: 'Recognize a melody, bass line or beatbox.', features: ['recognition'], doneMessage: 'A new editable track was added.',
    steps: [
      info('Record with the count-in and metronome, or choose an existing recording. Everything runs on your device.', { view: 'library', target: '.recognition-panel', fallback: 'Record or import a sample first.' }),
      info('Choose the mode: Melody, Bass or Beatbox.', { target: '[aria-label="Recognition mode"]' }),
      { text: 'Recognize it. A track is added to the Beat screen.', target: '.recognition-panel', done: (s) => s.project.recognitionTakes.length > s.base.recognitionTakes.length },
    ],
  },
  {
    id: 'recognition-edit', title: 'Correct a recognized take', tab: 'library', group: 'Recognition', level: 'intermediate', estMinutes: 2,
    summary: 'Fix pitch and timing, quantise, and reclassify drums.', features: ['recognition-edit'], doneMessage: 'The original audio is kept as a muted track.',
    steps: [
      info('Use Timing correction and Quantisation to tidy the rhythm.', { view: 'library', target: '[aria-label="Quantisation strength"]' }),
      info('Use Pitch correction for melodies, or change Classify/Sound on drum events.', { target: '.recognition-results' }),
      info('Low-confidence events are marked; review them by ear. Restore returns to the original result.', { target: '.recognition-results' }),
    ],
  },
  {
    id: 'song-patterns', title: 'Multiple patterns and the launcher', tab: 'song', group: 'Patterns', level: 'intermediate', estMinutes: 1,
    summary: 'Make variations and switch between them.', features: ['patterns'], doneMessage: 'Patterns let you build sections.',
    steps: [
      { view: 'song', text: 'Create a new pattern.', target: '#new-pattern', done: (s) => s.project.patterns.length > s.base.patterns.length },
      { view: 'song', text: 'Tap a pattern to select it and edit it on the Beat screen.', target: '.composition button.secondary', done: (s) => s.project.currentPatternId !== s.base.currentPatternId },
    ],
  },
  {
    id: 'timeline', title: 'Arrange a song on the timeline', tab: 'song', group: 'Arrangement', level: 'intermediate', estMinutes: 1,
    summary: 'Put patterns in order.', features: ['timeline'], doneMessage: 'Press Play to hear the arrangement.',
    steps: [
      { view: 'song', text: 'Add the selected pattern to the timeline. Repeat for other patterns.', target: '.arrangement-heading button', done: (s) => s.project.arrangement.length > s.base.arrangement.length },
      { text: 'Press Play to hear the song.', target: '#play-btn', done: (s) => s.events.has('play') },
    ],
  },
  {
    id: 'arrangement-assist', title: 'Get chords, bass and harmony', tab: 'song', group: 'Assist', level: 'intermediate', estMinutes: 2,
    summary: 'Generate accompaniment tracks from a melody.', features: ['arrangement-assist'], doneMessage: 'Generated tracks can be edited, replaced or removed.',
    steps: [
      info('Pick a melody source. Chord suggestions come from your melody.', { view: 'song', target: '[aria-label="Arrangement assistance"]' }),
      { text: 'Preview, then add a result as a separate generated track.', target: '[aria-label="Arrangement assistance"]', done: (s) => s.project.channels.some((c) => c.generatedMetadata) },
      info('Choose Acoustic, Pop, Electronic or Orchestral styles for harmony and accompaniment. Replace or remove generated tracks any time.', { target: '[aria-label="Arrangement style"]' }),
    ],
  },
  {
    id: 'export-options', title: 'Choose export quality', tab: 'global', group: 'Export', level: 'intermediate', estMinutes: 1,
    summary: 'Sample rate, bit depth and normalization.', features: ['export-options'], doneMessage: 'Exported with your chosen settings.',
    steps: [
      info('Pick a sample rate (44.1, 48 or 96 kHz), 16- or 24-bit, and optional normalization.', { menu: true, target: '[aria-label="WAV sample rate"], [aria-label="WAV bit depth"]' }),
      { menu: true, text: 'Tap Export WAV.', target: '#export-btn', done: (s) => s.events.has('export') },
    ],
  },
  {
    id: 'privacy-offline', title: 'Where is my data? Working offline', tab: 'global', group: 'Privacy & offline', level: 'beginner', estMinutes: 1,
    summary: 'Everything stays on your device.', features: ['privacy-offline'], doneMessage: 'You are in control of your data.',
    steps: [
      info('Projects are saved in this browser (localStorage); recorded and imported audio is stored in IndexedDB. Nothing is uploaded; recognition runs on your device.'),
      info('After the first load the app works offline. Clearing site data removes your projects and samples, so export WAVs you want to keep.'),
    ],
  },
];

export const WORKFLOWS: Workflow[] = [
  { id: 'make-song', title: 'Make a song from scratch', outcome: 'You will have a playable, exported song.', tutorialIds: ['first-beat', 'add-channel', 'composition', 'timeline', 'save-export'] },
  { id: 'own-sound', title: 'Record and use your own sound', outcome: 'Your own sample plays in a beat.', tutorialIds: ['record-sample', 'sample-editor', 'add-channel'] },
  { id: 'sing-melody', title: 'Sing or hum a melody into a track', outcome: 'Your voice becomes an editable track with chords and bass.', tutorialIds: ['record-sample', 'recognize', 'recognition-edit', 'arrangement-assist'] },
  { id: 'beatbox', title: 'Beatbox a drum loop', outcome: 'Your beatbox becomes a drum track.', tutorialIds: ['record-sample', 'recognize', 'recognition-edit'] },
  { id: 'design-instrument', title: 'Design your own instrument', outcome: 'A custom sound with effects, used on a channel.', tutorialIds: ['sound-designer', 'effects', 'add-channel'] },
  { id: 'share', title: 'Share your work', outcome: 'A saved project and a high-quality WAV.', tutorialIds: ['save-export', 'export-options', 'privacy-offline'] },
];

export const findTutorial = (id: string): Tutorial | undefined => TUTORIALS.find((t) => t.id === id);
