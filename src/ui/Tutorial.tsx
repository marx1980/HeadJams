import { useEffect, useRef, useState } from 'react';
import { GROUPS, TUTORIALS, WORKFLOWS, findTutorial, isTutorialAvailable, type Tutorial as T, type TutorialCapability, type TutorialState, type TutorialStep, type TutorialTab } from '../tutorial/tutorials';
import { workflowProgress } from '../tutorial/progress';

export function TutorialMenu({ tab, done, onPick, onResetProgress, onClose }: {
  /** Current screen; the hub lists its tutorials first and "Show all tabs" lists everything. */
  tab?: TutorialTab;
  done: ReadonlySet<string>;
  onPick: (t: T, workflowId?: string) => void;
  onResetProgress: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'actions' | 'workflows'>('actions');
  const [all, setAll] = useState(!tab);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    el?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !el) return;
      const f = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), input'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabs: TutorialTab[] = all || !tab ? ['beat', 'sound', 'library', 'song', 'global'] : [tab, 'global'];
  const capabilities = new Set<TutorialCapability>();
  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
    capabilities.add('microphone');
  }
  const availableTutorials = TUTORIALS.filter((tutorial) => isTutorialAvailable(tutorial, capabilities));
  const availableIds = new Set(availableTutorials.map((tutorial) => tutorial.id));
  const tutorialRow = (t: T) => (
    <li key={t.id}>
      <button className="tut-item" onClick={() => onPick(t)}>
        <span aria-hidden="true">{done.has(t.id) ? '✅' : '▫️'}</span>{' '}
        <strong>{t.title}</strong>
        <small> · {t.estMinutes} min · {t.level}{done.has(t.id) ? ' · done' : ''}</small>
        <span className="tut-summary">{t.summary}</span>
      </button>
    </li>
  );

  return (
    <div className="panel tutorial-menu" role="dialog" aria-modal="true" aria-label="Tutorials" ref={ref}>
      <h2>Tutorials</h2>
      <div className="row" role="group" aria-label="Browse by">
        <button className={mode === 'actions' ? 'on' : 'secondary'} aria-pressed={mode === 'actions'} onClick={() => setMode('actions')}>Actions</button>
        <button className={mode === 'workflows' ? 'on' : 'secondary'} aria-pressed={mode === 'workflows'} onClick={() => setMode('workflows')}>Workflows</button>
        {tab && mode === 'actions' && (
          <label className="check-label"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all tabs</label>
        )}
      </div>
      {mode === 'actions' && tabs.map((tb) => (
        GROUPS[tb].map((group) => {
          const items = availableTutorials.filter((t) => t.tab === tb && t.group === group);
          if (!items.length) return null;
          return (
            <details key={`${tb}-${group}`} open={tb === tab || all}>
              <summary>{tb === 'global' ? 'General' : tb[0].toUpperCase() + tb.slice(1)} · {group} ({items.filter((t) => done.has(t.id)).length}/{items.length})</summary>
              <ul className="tut-list">{items.map(tutorialRow)}</ul>
            </details>
          );
        })
      ))}
      {mode === 'workflows' && (
        <ul className="tut-list">
          {WORKFLOWS.filter((w) => w.tutorialIds.every((id) => availableIds.has(id))).map((w) => {
            const p = workflowProgress(w, done);
            const next = p.nextId ? findTutorial(p.nextId) : undefined;
            return (
              <li key={w.id} className="tut-workflow">
                <strong>{w.title}</strong>
                <span className="tut-summary">{w.outcome}</span>
                <progress max={p.total} value={p.completed} aria-label={`${w.title} progress`} />
                <small>Step {Math.min(p.completed + 1, p.total)} of {p.total}: {next ? next.title : 'complete ✅'}</small>
                <button disabled={!next} onClick={() => next && onPick(next, w.id)}>{p.completed === 0 ? 'Start' : next ? 'Continue' : 'Done'}</button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="row">
        <button className="secondary" onClick={() => { if (window.confirm('Reset all tutorial progress?')) onResetProgress(); }}>Reset tutorials</button>
        <button className="secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export function TutorialOverlay({ tutorial, state, onExit, onStep, onComplete }: {
  tutorial: T; state: TutorialState; onExit: () => void; onStep: (step: TutorialStep) => void; onComplete: (t: T) => void;
}) {
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  const [missing, setMissing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const step = tutorial.steps[index];
  const done = step.done(state) || skipped.has(index);
  const last = index === tutorial.steps.length - 1;

  useEffect(() => { onStep(step); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    (focusables()[0] ?? dialog)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onExit(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const items = focusables();
      if (!items.length) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onExit, finished]);

  useEffect(() => {
    if (!step.target) return;
    const els = Array.from(document.querySelectorAll(step.target));
    setMissing(els.length === 0);
    els.slice(0, 40).forEach((e) => e.classList.add('tut-highlight'));
    return () => els.forEach((e) => e.classList.remove('tut-highlight'));
  });

  const showMe = () => {
    const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
    el?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el?.classList.add('tut-show');
    window.setTimeout(() => el?.classList.remove('tut-show'), 1800);
  };
  const next = () => {
    if (!last) { setIndex(index + 1); return; }
    onComplete(tutorial);
    setFinished(true);
  };

  if (finished) {
    return (
      <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-label={tutorial.title} tabIndex={-1} ref={dialogRef}>
        <p role="status">🎉 {tutorial.doneMessage}</p>
        <div className="row"><button onClick={onExit}>Close</button></div>
      </div>
    );
  }

  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-label={tutorial.title} tabIndex={-1} ref={dialogRef}>
      <div className="tut-title">{tutorial.title} (step {index + 1} of {tutorial.steps.length})</div>
      <p aria-live="polite">{done ? '✅ ' : '👉 '}{step.text}</p>
      {missing && step.fallback && <p className="tut-fallback" role="note">{step.fallback}</p>}
      <div className="row">
        <button className="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button>
        <button disabled={!done} onClick={next}>{last ? 'Finish' : 'Next'}</button>
        {step.target && <button className="secondary" onClick={showMe}>Show me</button>}
        {!done && <button className="secondary" onClick={() => setSkipped(new Set(skipped).add(index))}>Skip step</button>}
        <button className="secondary" onClick={onExit}>Exit</button>
      </div>
    </div>
  );
}
