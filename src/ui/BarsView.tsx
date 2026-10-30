import { useEffect, useState } from 'react';
import {
  barFamilies, barNames, barPreview, canDuplicateBar, canVaryBar, clearBar, copyBar, doubleLoop, duplicateBar, MAX_BARS, moveBar, setBarName, varyBar,
} from '../model/bars';
import { totalSteps, type Project } from '../model/project';
import { Icon } from './Icon';
import { PHRASE_VARIATIONS } from '../library/phrases';
import { SuggestionSet } from './SuggestionSet';

const HEIGHT = 64;

/** One bar's overview: notes as short bars by pitch, drum hits as ticks along the bottom, one colour per track. */
function BarSketch({ project, bar, colors }: { project: Project; bar: number; colors: string[] }) {
  const per = project.noteLength;
  const start = bar * per;
  const pitches = project.channels.flatMap((channel) => (channel.notes ?? []).map((note) => note.pitch));
  const low = pitches.length ? Math.min(...pitches) : 60;
  const high = pitches.length ? Math.max(...pitches) : 72;
  const span = Math.max(12, high - low + 1);
  const hitRows = project.channels.filter((channel) => channel.lanes?.length || channel.steps.some(Boolean)).length;
  // Notes use the top of the sketch and hits a strip at the bottom; with only hits, the strip fills the sketch.
  const hitArea = pitches.length ? 14 : HEIGHT - 8;
  const noteArea = HEIGHT - hitArea;
  const rowHeight = hitArea / Math.max(1, hitRows);
  const noteHeight = Math.max(2, (noteArea - 2) / span);
  let hitRow = 0;
  return (
    <svg className="bar-sketch" viewBox={`0 0 ${per} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
      {project.channels.map((channel, index) => {
        const color = colors[index % colors.length];
        const notes = (channel.notes ?? []).filter((note) => Math.floor(note.step / per) === bar).map((note) => (
          <rect key={note.id} x={note.step - start} width={Math.min(note.durationSteps, per - (note.step - start))} height={noteHeight}
            y={(noteArea - 2) * (1 - (note.pitch - low + 1) / span)} fill={color} />
        ));
        const chords = (channel.chordEvents ?? []).filter((event) => Math.floor(event.step / per) === bar).map((event) => (
          <rect key={event.id} x={event.step - start} width={0.6} y={Math.max(0, noteArea - 12)} height={10} fill={color} opacity={0.6} />
        ));
        const steps = channel.lanes
          ? channel.lanes.flatMap((lane) => lane.steps.slice(start, start + per).map((on, offset) => on ? offset : -1))
          : channel.steps.slice(start, start + per).map((on, offset) => on ? offset : -1);
        const hits = steps.filter((offset) => offset >= 0);
        const row = channel.lanes?.length || channel.steps.some(Boolean) ? hitRow++ : 0;
        const y = HEIGHT - hitArea + row * rowHeight + rowHeight * 0.2;
        return (
          <g key={channel.id}>
            {notes}
            {chords}
            {hits.map((offset, hit) => <rect key={`h${hit}`} x={offset + 0.15} width={0.7} y={y} height={Math.max(2, rowHeight * 0.6)} fill={color} />)}
          </g>
        );
      })}
    </svg>
  );
}

/** Beat › Bars (plan.md milestone A, Simple View): one card per bar of the loop. */
export function BarsView({ project, colors, playStep, playing, onChange, onAudition }: {
  project: Project;
  colors: string[];
  playStep: number | null;
  playing: boolean;
  onChange: (next: Project) => void;
  onAudition: (preview?: Project) => void;
}) {
  const [looping, setLooping] = useState<number>();
  const [varying, setVarying] = useState<number>();
  useEffect(() => { if (!playing) setLooping(undefined); }, [playing]);
  const families = barFamilies(project);
  const names = barNames(project);
  const per = project.noteLength;
  const current = looping === undefined && playStep !== null && !project.arrangement.length
    ? Math.floor((playStep % totalSteps(project)) / per) : looping;
  const change = (next: Project) => {
    if (looping !== undefined) { onAudition(undefined); setLooping(undefined); }
    setVarying(undefined);
    onChange(next);
  };

  return (
    <section className="bars-view" aria-label="Bars">
      <ol className="bar-cards">
        {Array.from({ length: project.loopBars }, (_, bar) => (
          <li key={bar} className={`bar-card${current === bar ? ' playing' : ''}`}>
            <div className="bar-card-head">
              <span className={`bar-family${families[bar] === '–' ? ' empty' : ''}`} aria-label={`Family ${families[bar]}`}>{families[bar]}</span>
              <input aria-label={`Name of bar ${bar + 1}`} placeholder={`Bar ${bar + 1}`} value={names[bar]}
                onChange={(event) => onChange(setBarName(project, bar, event.target.value))} />
            </div>
            <BarSketch project={project} bar={bar} colors={colors} />
            <div className="bar-card-actions">
              <button className={looping === bar ? 'on' : 'secondary'} aria-label={looping === bar ? 'Stop' : `Loop bar ${bar + 1}`}
                onClick={() => {
                  if (looping === bar) { onAudition(undefined); setLooping(undefined); return; }
                  setLooping(bar);
                  onAudition(barPreview(project, bar));
                }}><Icon name={looping === bar ? 'stop' : 'play'} className="inline-icon" /></button>
              <button className="secondary" aria-label={`Move bar ${bar + 1} left`} disabled={bar === 0}
                onClick={() => change(moveBar(project, bar, -1))}><Icon name="back" className="inline-icon" /></button>
              <button className="secondary" aria-label={`Move bar ${bar + 1} right`} disabled={bar === project.loopBars - 1}
                onClick={() => change(moveBar(project, bar, 1))}><Icon name="forward" className="inline-icon" /></button>
              <button className="secondary" aria-label={`Duplicate bar ${bar + 1}`} disabled={!canDuplicateBar(project, bar)}
                onClick={() => change(duplicateBar(project, bar))}><Icon name="duplicate" className="inline-icon" /></button>
              <select aria-label={`More for bar ${bar + 1}`} value="" disabled={project.loopBars < 2 && !canVaryBar(project, bar)}
                onChange={(event) => {
                  const [action, value] = event.target.value.split(':');
                  if (action === 'vary') {
                    if (looping !== undefined) { onAudition(undefined); setLooping(undefined); }
                    setVarying(varying === bar ? undefined : bar);
                  } else change(copyBar(project, bar, Number(value)));
                }}>
                <option value="" disabled>More</option>
                {project.loopBars > 1 && (
                  <optgroup label="Copy to">
                    {Array.from({ length: project.loopBars }, (_, to) => to).filter((to) => to !== bar)
                      .map((to) => <option key={to} value={`copy:${to}`}>{names[to] || `Bar ${to + 1}`}</option>)}
                  </optgroup>
                )}
                {canVaryBar(project, bar) && <option value="vary:">Vary</option>}
              </select>
              <button className="secondary" aria-label={`Clear bar ${bar + 1}`} disabled={families[bar] === '–'}
                onClick={() => change(clearBar(project, bar))}><Icon name="close" className="inline-icon" /></button>
            </div>
            {varying === bar && canVaryBar(project, bar) && (
              <SuggestionSet label={`Variations of bar ${bar + 1}`} playing={playing} onAudition={onAudition} keepLabel="Keep"
                items={PHRASE_VARIATIONS.map((item) => ({
                  id: item.id,
                  label: item.label,
                  preview: () => ({ ...varyBar(project, bar, item.id), arrangement: [] }),
                  keep: () => change(varyBar(project, bar, item.id)),
                }))} />
            )}
          </li>
        ))}
      </ol>
      <div className="bar-view-actions">
        <button id="double-loop" className="secondary" disabled={project.loopBars * 2 > MAX_BARS}
          onClick={() => change(doubleLoop(project))}><Icon name="duplicate" className="inline-icon" /> Double loop</button>
      </div>
    </section>
  );
}
