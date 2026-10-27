import type { Project } from '../model/project';

export interface TutorialState {
  project: Project;
  base: Project;
  events: ReadonlySet<string>;
}

export interface TutorialStep {
  text: string;
  /** CSS selector of the element to highlight ("tap here"). */
  target?: string;
  done: (s: TutorialState) => boolean;
}

export interface Tutorial {
  id: string;
  title: string;
  steps: TutorialStep[];
}

export const countNotes = (p: Project): number => p.channels.reduce((n, c) => n + c.steps.filter(Boolean).length, 0);
const countPianoNotes = (p: Project): number => p.channels.reduce((n, channel) => n + (channel.notes?.length ?? 0), 0);

export const TUTORIALS: Tutorial[] = [
  {
    id: 'first-beat',
    title: '1. Make your first beat',
    steps: [
      { text: 'Tap a square in the grid to place a beat.', target: '.step', done: (s) => countNotes(s.project) > countNotes(s.base) },
      { text: 'Press Play to hear it loop.', target: '#play-btn', done: (s) => s.events.has('play') },
      { text: 'Add a few more beats while it plays. Tap again to remove one.', target: '.step', done: (s) => countNotes(s.project) >= countNotes(s.base) + 3 },
    ],
  },
  {
    id: 'note-length',
    title: '2. Change the length of a note',
    steps: [
      { text: 'Choose a different note length: 1/4 is slow and long, 1/16 is fast and short.', target: '#note-length', done: (s) => s.project.noteLength !== s.base.noteLength },
      { text: 'Place a beat on the new grid and press Play.', target: '#play-btn', done: (s) => s.events.has('play') },
    ],
  },
  {
    id: 'loop',
    title: '3. Create a loop',
    steps: [
      { text: 'Choose how many bars your loop lasts.', target: '#loop-bars', done: (s) => s.project.loopBars !== s.base.loopBars },
      { text: 'Place a beat in the new bars (the extra rows).', target: '.step', done: (s) => s.project.channels.some((c) => c.steps.some((on, i) => on && i >= s.project.noteLength)) },
      { text: 'Press Play. The playhead loops back to the start.', target: '#play-btn', done: (s) => s.events.has('play') },
    ],
  },
  {
    id: 'add-channel',
    title: '4. Add a channel',
    steps: [
      { text: 'Tap "Add channel" to get a new row.', target: '#add-channel', done: (s) => s.project.channels.length > s.base.channels.length },
      { text: 'Pick a sound for it from the sound menu.', target: '.sound-select', done: (s) => s.events.has('sound-change') },
      { text: 'Tap the speaker button to preview a sound.', target: '.preview-btn', done: (s) => s.events.has('preview') },
    ],
  },
  {
    id: 'save-export',
    title: '5. Save and export',
    steps: [
      { text: 'Your work saves automatically. Tap Save to be sure.', target: '#save-btn', done: (s) => s.events.has('save') },
      { text: 'Tap Export WAV to download your loop as an audio file.', target: '#export-btn', done: (s) => s.events.has('export') },
    ],
  },
  {
    id: 'record-sample',
    title: '6. Record a sample',
    steps: [
      { text: 'Allow microphone access and record a sound.', target: '#record-sample', done: (s) => s.events.has('record-start') },
      { text: 'Stop the recording, trim it if needed, and save it to your library.', target: '#save-sample', done: (s) => s.events.has('sample-saved') },
    ],
  },
  {
    id: 'composition',
    title: '7. Build a composition',
    steps: [
      { text: 'Create a pattern so your composition can have multiple sections.', target: '#new-pattern', done: (s) => s.project.patterns.length > s.base.patterns.length },
      { text: 'Add a note in the piano roll. Scale tones are highlighted, and Snap to scale keeps notes in key.', target: '#piano-roll-cell', done: (s) => countPianoNotes(s.project) > countPianoNotes(s.base) },
      { text: 'Use Chord assist to add a chord, then add the pattern to the arrangement timeline.', target: '#add-chord', done: (s) => countPianoNotes(s.project) >= countPianoNotes(s.base) + 4 },
      { text: 'Add the selected pattern to the timeline to create a song arrangement.', target: '.arrangement-heading button', done: (s) => s.project.arrangement.length > s.base.arrangement.length },
    ],
  },
];
