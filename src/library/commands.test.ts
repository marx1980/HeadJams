import { describe, expect, it } from 'vitest';
import { melodyChannel, parseCommand, previewOf, runCommand, simplifyNotes } from './commands';
import { createChannel, createProject, setLoopBars, type Project } from '../model/project';
import { buildSong, templateSections } from '../model/songBuilder';

function hummed(): Project {
  const base = setLoopBars({ ...createProject('Hum'), noteLength: 8, channels: [] }, 2);
  const notes = [60, 62, 64, 67, 64, 62, 60, 60, 62, 64, 65, 67].map((pitch, index) => ({ id: `n${index}`, step: [0, 1, 2, 4, 6, 7, 8, 9, 10, 12, 13, 14][index], pitch, durationSteps: 1 }));
  return { ...base, channels: [
    { ...createChannel('mel', 'Melody', 'grand-piano', 16), notes },
    { ...createChannel('gtr', 'Guitar', 'nylon-chords', 16), chordEvents: [{ id: 'c', step: 0, root: 48, quality: 'major', articulation: 'down-strum', durationSteps: 8 }] },
  ] };
}

describe('command parsing', () => {
  it('reads the starter commands in English and Croatian', () => {
    const ids = (text: string) => parseCommand(text).commands.map((command) => command.id);
    expect(ids('Make this bar simpler')).toEqual(['simpler']);
    expect(ids('Create three harmony alternatives')).toEqual(['harmony']);
    expect(ids('Add a simple bass part')).toEqual(['simpler', 'bass']);
    expect(ids('Add a basic drum pattern')).toEqual(['drums']);
    expect(parseCommand('Make the guitar softer').commands).toEqual([{ id: 'softer', target: 'guitar' }]);
    expect(ids('Make the chorus bigger')).toEqual(['bigger-chorus']);
    expect(parseCommand('Keep my melody unchanged').keepMelody).toBe(true);
    expect(ids('Create an ending from these bars')).toEqual(['ending']);
    expect(ids('dodaj bas')).toEqual(['bass']);
    expect(ids('tiša gitara')).toEqual(['softer']);
    expect(parseCommand('make bar 2 simpler').commands[0]).toEqual({ id: 'simpler', bar: 1 });
    expect(ids('hello')).toEqual([]);
  });
});

describe('commands', () => {
  it('Simpler keeps one note per beat (or half bar) and holds it', () => {
    const notes = hummed().channels[0].notes;
    const beat = simplifyNotes(notes, 2);
    expect(beat.map((note) => note.step)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(beat.every((note, index) => index === beat.length - 1 || note.step + note.durationSteps === beat[index + 1].step)).toBe(true);
    const result = runCommand(hummed(), { id: 'simpler', bar: 1 });
    expect('options' in result && result.options.map((option) => option.label)).toEqual(['Simpler', 'Simplest']);
    if ('options' in result) {
      const melody = result.options[1].project.channels[0].notes;
      expect(melody.filter((note) => note.step < 8)).toHaveLength(6);
      expect(melody.filter((note) => note.step >= 8).map((note) => note.step)).toEqual([8, 12]);
    }
  });

  it('offers harmony, bass and drums as separate new tracks', () => {
    const p = hummed();
    for (const id of ['harmony', 'bass', 'drums'] as const) {
      const result = runCommand(p, { id });
      expect('options' in result).toBe(true);
      if ('options' in result) {
        expect(result.options.length).toBeGreaterThanOrEqual(2);
        for (const option of result.options) {
          expect(option.project.channels).toHaveLength(3);
          expect(option.project.channels[0].notes).toEqual(p.channels[0].notes);
        }
      }
    }
    const drums = runCommand(p, { id: 'drums' });
    if ('options' in drums) expect(drums.options[0].project.channels[2].lanes?.find((lane) => lane.id === 'kick')?.steps.filter(Boolean).length).toBe(6);
  });

  it('turns the guitar down and leaves the melody', () => {
    const result = runCommand(hummed(), { id: 'softer', target: 'guitar' });
    expect('options' in result).toBe(true);
    if ('options' in result) {
      expect(result.options[0].project.channels[1].volume).toBeCloseTo(0.8 * 0.75);
      expect(result.options[0].project.channels[0].volume).toBe(0.8);
    }
    expect(runCommand(hummed(), { id: 'softer', target: 'strings' })).toEqual({ label: 'Softer · strings', message: 'No strings track' });
  });

  it('makes the chorus big only when there is one', () => {
    expect('message' in runCommand(hummed(), { id: 'bigger-chorus' })).toBe(true);
    const base = hummed();
    const p = { ...base, channels: [...base.channels, { ...createChannel('kick', 'Kick', 'kick-1', 16), steps: Array.from({ length: 16 }, (_, step) => step % 4 === 0) }] };
    const song = buildSong(p, templateSections(p, 'full').map((section) => ({ ...section, density: section.name === 'Chorus' ? 'sparse' as const : section.density })));
    const result = runCommand(song, { id: 'bigger-chorus' });
    expect('options' in result).toBe(true);
    if ('options' in result) expect(result.options[0].project.arrangement.filter((clip) => clip.section === 'Chorus').every((clip) => !clip.mutedChannelIds?.length)).toBe(true);
  });

  it('adds an ending after the song', () => {
    const result = runCommand(hummed(), { id: 'ending' });
    expect('options' in result).toBe(true);
    if ('options' in result) {
      const ring = result.options[0].project;
      expect(ring.arrangement.map((clip) => [clip.startStep, clip.lengthSteps, clip.section ?? ''])).toEqual([[0, 16, ''], [16, 8, 'Ending']]);
      expect(previewOf({ id: 'ending' }, ring).arrangement).toHaveLength(2);
      expect(previewOf({ id: 'harmony' }, ring).arrangement).toHaveLength(0);
    }
  });

  it('finds the melody', () => {
    expect(melodyChannel(hummed())?.id).toBe('mel');
  });
});
