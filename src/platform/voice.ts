/**
 * Voice commands (plan.md D4) through the browser's speech recognition. On-device recognition is used when
 * the browser has it (Chrome downloads the language pack on first use); the browser's online service
 * (Google in Chrome, Apple in Safari) is used only when the user allows it in Settings.
 */

export type VoiceError = 'unsupported' | 'online-needed' | 'no-speech' | 'denied' | 'failed';

interface RecognitionResultLike { 0: { transcript: string } }
interface RecognitionEventLike { results: ArrayLike<RecognitionResultLike> }
export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
export interface RecognitionConstructor {
  new (): RecognitionLike;
  available?: (options: { langs: string[]; processLocally?: boolean }) => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  install?: (options: { langs: string[]; processLocally?: boolean }) => Promise<boolean>;
}

export function recognitionConstructor(scope: object = globalThis): RecognitionConstructor | undefined {
  const w = scope as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Croatian for Croatian browsers, otherwise English (the command words cover both). */
export function voiceLanguage(choice: 'auto' | 'en-US' | 'hr-HR', browserLanguages: readonly string[]): 'en-US' | 'hr-HR' {
  if (choice !== 'auto') return choice;
  return browserLanguages.some((language) => language.toLowerCase().startsWith('hr')) ? 'hr-HR' : 'en-US';
}

/** Decide where recognition runs: on this device, online (if allowed), or not at all. */
export async function voiceMode(Recognition: RecognitionConstructor, lang: string, allowOnline: boolean): Promise<'local' | 'online' | VoiceError> {
  if (Recognition.available) {
    try {
      let status = await Recognition.available({ langs: [lang], processLocally: true });
      if ((status === 'downloadable' || status === 'downloading') && Recognition.install) {
        status = await Recognition.install({ langs: [lang], processLocally: true }) ? 'available' : 'unavailable';
      }
      if (status === 'available') return 'local';
    } catch { /* fall through to online */ }
  }
  return allowOnline ? 'online' : 'online-needed';
}

export interface VoiceSession { stop: () => void; result: Promise<string> }

/** Listen for one phrase; resolves with what was said. */
export async function listenOnce(options: { lang: string; allowOnline: boolean; Recognition?: RecognitionConstructor }): Promise<VoiceSession> {
  const Recognition = options.Recognition ?? recognitionConstructor();
  if (!Recognition) throw new VoiceFailure('unsupported');
  const mode = await voiceMode(Recognition, options.lang, options.allowOnline);
  if (mode !== 'local' && mode !== 'online') throw new VoiceFailure(mode);
  const recognition = new Recognition();
  recognition.lang = options.lang;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  if ('processLocally' in recognition || Recognition.available) recognition.processLocally = mode === 'local';
  const result = new Promise<string>((resolve, reject) => {
    let text = '';
    recognition.onresult = (event) => { text = Array.from(event.results).map((item) => item[0].transcript).join(' ').trim(); };
    recognition.onerror = (event) => reject(new VoiceFailure(
      event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'denied'
        : event.error === 'no-speech' || event.error === 'aborted' ? 'no-speech'
          : event.error === 'language-not-supported' ? 'online-needed' : 'failed'));
    recognition.onend = () => (text ? resolve(text) : reject(new VoiceFailure('no-speech')));
  });
  recognition.start();
  return { stop: () => recognition.stop(), result };
}

export class VoiceFailure extends Error {
  constructor(readonly reason: VoiceError) { super(reason); }
}

export const VOICE_MESSAGES: Record<VoiceError, string> = {
  unsupported: 'Voice not available in this browser',
  'online-needed': 'On-device voice not available · Settings › Voice',
  'no-speech': 'Nothing heard',
  denied: 'Microphone blocked',
  failed: 'Voice failed',
};
