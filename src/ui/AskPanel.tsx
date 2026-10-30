import { useState } from 'react';
import { COMMAND_CHIPS, parseCommand, previewOf, runCommand, type Command, type CommandResult } from '../library/commands';
import type { Project } from '../model/project';
import { Icon } from './Icon';
import { SuggestionSet } from './SuggestionSet';

/** Song › Ask (plan.md milestone D): plain-words requests answered with alternatives to hear and keep. */
export function AskPanel({ project, onChange, onAudition, playing }: {
  project: Project;
  onChange: (next: Project) => void;
  onAudition: (preview?: Project) => void;
  playing: boolean;
}) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<{ command: Command; result: CommandResult }[] | null>(null);
  const ask = (request: string) => {
    const { commands } = parseCommand(request);
    setResults(commands.map((command) => ({ command, result: runCommand(project, command) })));
  };
  return (
    <div className="ask-panel">
      <h3>Ask</h3>
      <form className="ask-row" onSubmit={(event) => { event.preventDefault(); if (text.trim()) ask(text); }}>
        <input id="ask-input" aria-label="Ask" value={text} onChange={(event) => setText(event.target.value)} enterKeyHint="go" />
        <button id="ask-go" type="submit" disabled={!text.trim()} aria-label="Go"><Icon name="sparkle" className="inline-icon" /></button>
      </form>
      <div className="ask-chips">
        {COMMAND_CHIPS.map((chip) => (
          <button key={chip.text} className="secondary" onClick={() => { setText(chip.text); ask(chip.text); }}>{chip.label}</button>
        ))}
      </div>
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
