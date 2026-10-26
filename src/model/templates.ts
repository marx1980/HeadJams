import { createChannel, createProject, type Project } from './project';

const pat = (s: string) => Array.from(s.replace(/\s/g, ''), (c) => c === 'x');

function build(name: string, bpm: number, rows: [string, string, string][]): Project {
  const p = createProject(name);
  p.bpm = bpm;
  p.channels = rows.map(([n, sound, steps], i) => ({ ...createChannel(`ch${i + 1}`, n, sound), steps: pat(steps) }));
  return p;
}

export interface Template { id: string; label: string; make: () => Project }

export const TEMPLATES: Template[] = [
  { id: 'empty', label: 'Empty', make: () => createProject() },
  {
    id: 'rock', label: 'Basic rock beat',
    make: () => build('Basic rock', 100, [
      ['Kick', 'kick-1', 'x.......x.x.....'],
      ['Snare', 'snare-1', '....x.......x...'],
      ['Hi-hat', 'hat-1', 'x.x.x.x.x.x.x.x.'],
    ]),
  },
  {
    id: 'house', label: 'Four on the floor',
    make: () => build('House', 124, [
      ['Kick', 'kick-2', 'x...x...x...x...'],
      ['Clap', 'clap-1', '....x.......x...'],
      ['Open hat', 'hat-3', '..x...x...x...x.'],
      ['Bass', 'bass-2', 'x..x..x...x..x..'],
    ]),
  },
  {
    id: 'hiphop', label: 'Hip-hop groove',
    make: () => build('Hip-hop', 90, [
      ['Kick', 'kick-4', 'x.....x...x.....'],
      ['Snare', 'snare-2', '....x.......x...'],
      ['Hi-hat', 'hat-2', 'x.x.x.x.x.x.x.xx'],
    ]),
  },
];
