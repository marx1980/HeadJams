import { describe, expect, it } from 'vitest';
import { listenOnce, voiceLanguage, voiceMode, VoiceFailure, type RecognitionConstructor, type RecognitionLike } from './voice';
import { parseCommand } from '../library/commands';

function fake(status: 'available' | 'downloadable' | 'unavailable' | undefined, said: string | Error) {
  const made: RecognitionLike[] = [];
  const installs: string[][] = [];
  class Fake implements RecognitionLike {
    lang = ''; interimResults = true; maxAlternatives = 5; processLocally?: boolean;
    onresult: RecognitionLike['onresult'] = null; onerror: RecognitionLike['onerror'] = null; onend: RecognitionLike['onend'] = null;
    constructor() { made.push(this); }
    start() {
      queueMicrotask(() => {
        if (said instanceof Error) this.onerror?.({ error: said.message });
        else this.onresult?.({ results: [{ 0: { transcript: said } }] });
        this.onend?.();
      });
    }
    stop() { this.onend?.(); }
    abort() { this.onend?.(); }
  }
  const Recognition = Fake as unknown as RecognitionConstructor;
  if (status) {
    Recognition.available = async () => status;
    Recognition.install = async ({ langs }) => { installs.push(langs); return true; };
  }
  return { Recognition, made, installs };
}

describe('voice commands', () => {
  it('prefers on-device recognition, installing the language once', async () => {
    const local = fake('downloadable', 'add drums');
    expect(await voiceMode(local.Recognition, 'hr-HR', false)).toBe('local');
    expect(local.installs).toEqual([['hr-HR']]);
    const session = await listenOnce({ lang: 'en-US', allowOnline: false, Recognition: fake('available', ' add drums ').Recognition });
    expect(await session.result).toBe('add drums');
  });

  it('uses the online service only when allowed', async () => {
    expect(await voiceMode(fake('unavailable', '').Recognition, 'en-US', false)).toBe('online-needed');
    expect(await voiceMode(fake(undefined, '').Recognition, 'en-US', true)).toBe('online');
    const online = fake(undefined, 'stop');
    const session = await listenOnce({ lang: 'en-US', allowOnline: true, Recognition: online.Recognition });
    expect(await session.result).toBe('stop');
    await expect(listenOnce({ lang: 'en-US', allowOnline: false, Recognition: fake(undefined, 'x').Recognition })).rejects.toBeInstanceOf(VoiceFailure);
  });

  it('reports errors', async () => {
    const session = await listenOnce({ lang: 'en-US', allowOnline: true, Recognition: fake(undefined, new Error('not-allowed')).Recognition });
    await expect(session.result).rejects.toMatchObject({ reason: 'denied' });
    const silent = await listenOnce({ lang: 'en-US', allowOnline: true, Recognition: fake(undefined, '').Recognition });
    await expect(silent.result).rejects.toMatchObject({ reason: 'no-speech' });
  });

  it('picks Croatian for Croatian browsers', () => {
    expect(voiceLanguage('auto', ['hr-HR', 'en'])).toBe('hr-HR');
    expect(voiceLanguage('auto', ['de-DE'])).toBe('en-US');
    expect(voiceLanguage('en-US', ['hr'])).toBe('en-US');
  });

  it('reads play, stop, undo and record on their own', () => {
    expect(parseCommand('play').action).toBe('play');
    expect(parseCommand('Stani').action).toBe('stop');
    expect(parseCommand('poništi').action).toBe('undo');
    expect(parseCommand('snimi').action).toBe('record');
    expect(parseCommand('play the drums louder').action).toBeUndefined();
  });
});
