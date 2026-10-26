import { useEffect, useState } from 'react';
import { TUTORIALS, type Tutorial as T, type TutorialState } from '../tutorial/tutorials';

export function TutorialMenu({ onPick, onClose }: { onPick: (t: T) => void; onClose: () => void }) {
  return (
    <div className="panel tutorial-menu">
      <h2>Tutorials</h2>
      {TUTORIALS.map((t) => (
        <button key={t.id} onClick={() => onPick(t)}>{t.title}</button>
      ))}
      <button className="secondary" onClick={onClose}>Close</button>
    </div>
  );
}

export function TutorialOverlay({ tutorial, state, onExit }: { tutorial: T; state: TutorialState; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const step = tutorial.steps[index];
  const done = step.done(state);
  const last = index === tutorial.steps.length - 1;

  useEffect(() => {
    if (!step.target) return;
    const els = Array.from(document.querySelectorAll(step.target));
    els.slice(0, 40).forEach((e) => e.classList.add('tut-highlight'));
    return () => els.forEach((e) => e.classList.remove('tut-highlight'));
  });

  return (
    <div className="tutorial-overlay" role="dialog" aria-label={tutorial.title}>
      <div className="tut-title">{tutorial.title} ({index + 1}/{tutorial.steps.length})</div>
      <p>{done ? '✅ ' : '👉 '}{step.text}</p>
      <div className="row">
        <button disabled={!done} onClick={() => (last ? onExit() : setIndex(index + 1))}>{last ? 'Finish' : 'Next'}</button>
        <button className="secondary" onClick={onExit}>Skip</button>
      </div>
    </div>
  );
}
