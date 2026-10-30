import { useEffect, useRef, useState } from 'react';
import { COMMAND_CHIPS, parseCommand, previewOf, runCommand, type Command, type CommandResult, type VoiceAction } from '../library/commands';
import { listenOnce, recognitionConstructor, VoiceFailure, VOICE_MESSAGES, type VoiceSession } from '../platform/voice';
import type { Project } from '../model/project';
import { Icon } from './Icon';
import { SuggestionSet } from './SuggestionSet';

/** Song › Ask (plan.md milestone D): plain-words requests answered with alternatives to hear and keep. */
export function AskPanel({ project, onChange, onAudition, playing, voice, onAction }: {
  project: Project;
  onChange: (next: Project) => void;
  onAudition: (preview?: Project) => void;
  playing: boolean;
  /** Voice commands: recognition language and whether online recognition is allowed. */
  voice?: { lang: string; allowOnline: boolean };
  /** Play, stop, undo or record, said or typed on their own. */
  onAction?: (action: VoiceAction) => void;
}) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<{ command: Command; result: CommandResult }[] | null>(null);
  const [status, setStatus] = useState('');
  const [listening, setListening] = useState(false);
  const session = useRef<VoiceSession | undefined>(undefined);
  useEffect(() => () => session.current?.stop(), []);
  const ask = (request: string) => {
    const { commands, action } = parseCommand(request);
    setStatus('');
    if (action && onAction) { setResults(null); setStatus(request); onAction(action); return; }
    setResults(commands.map((command) => ({ command, result: runCommand(project, command) })));
  };
  const listen = async () => {
    if (!voice) return;
    if (listening) { session.current?.stop(); return; }
    setStatus('');
    setListening(true);
    try {
      session.current = await listenOnce(voice);
      const heard = await session.current.result;
      setText(heard);
      ask(heard);
    } catch (reason) {
      setStatus(reason instanceof VoiceFailure ? VOICE_MESSAGES[reason.reason] : VOICE_MESSAGES.failed);
    } finally {
      session.current = undefined;
      setListening(false);
    }
  };
  const canListen = Boolean(voice && recognitionConstructor());
  return (
    <div className="ask-panel">
      <h3>Ask</h3>
      <form className={`ask-row${canListen ? ' with-voice' : ''}`} onSubmit={(event) => { event.preventDefault(); if (text.trim()) ask(text); }}>
        <input id="ask-input" aria-label="Ask" value={text} onChange={(event) => setText(event.target.value)} enterKeyHint="go" />
        {canListen && (
          <button id="ask-voice" type="button" className={listening ? 'on' : 'secondary'} aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Speak'} onClick={() => void listen()}>
            <Icon name={listening ? 'stop' : 'sample'} className="inline-icon" /></button>
        )}
        <button id="ask-go" type="submit" disabled={!text.trim()} aria-label="Go"><Icon name="sparkle" className="inline-icon" /></button>
      </form>
      <div className="ask-chips">
        {COMMAND_CHIPS.map((chip) => (
          <button key={chip.text} className="secondary" onClick={() => { setText(chip.text); ask(chip.text); }}>{chip.label}</button>
        ))}
      </div>
      {listening && <p className="ask-message" role="status">Listening…</p>}
      {status && <p className="ask-message" role="status">{status}</p>}
      {results && !results.length && <p className="ask-message" role="status">Not understood</p>}
      {results?.map(({ command, result }, index) => (
        <div key={`${command.id}-${index}`} className="ask-result">
          <strong>{result.label}</strong>
          {'message' in result
            ? <p className="ask-message" role="status">{result.message}</p>
            : <SuggestionSet label={result.label} playing={playing} onAudition={onAudition} keepLabel="Keep"
              items={result.options.map((option) => ({
                id: `${command.id}-${option.id}`,
                label: option.label,
                ...(option.detail ? { detail: option.detail } : {}),
                preview: () => previewOf(command, option.project),
                keep: () => { onChange(option.project); setResults(null); },
              }))} />}
        </div>
      ))}
    </div>
  );
}
