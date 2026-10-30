import { useState } from 'react';
import type { Project } from '../model/project';
import {
  GLIDE_BARS, MAX_BPM, MIN_BPM, moveTempoChange, nextFreeTempoBar, removeTempoChange, setTempoChange, songBars,
} from '../model/tempo';
import {
  AUTOMATION_PARAMS, automationLane, clearAutomation, laneValue, moveAutomationPoint, nextFreeAutomationBar, removeAutomationPoint,
  setAutomationPoint, startingValue, type AutomationParam,
} from '../model/automation';
import { Icon } from './Icon';

const glideLabel = (bars: number) => bars === 0 ? 'At once' : bars === 1 ? 'Over 1 bar' : `Over ${bars} bars`;
const panLabel = (value: number) => Math.abs(value) < 0.005 ? 'C' : `${value < 0 ? 'L' : 'R'}${Math.round(Math.abs(value) * 100)}`;
const valueLabel = (param: AutomationParam, value: number) => param === 'volume' ? `${Math.round(value * 100)}%` : panLabel(value);

/** Song › Play from: start the song (or loop) at any bar; while playing, jumps there. */
export function PlayFrom({ project, onPlayFrom }: { project: Project; onPlayFrom: (bar: number) => void }) {
  const bars = songBars(project);
  const [bar, setBar] = useState(0);
  if (bars < 2) return null;
  const from = Math.min(bar, bars - 1);
  return (
    <div className="play-from">
      <label>Play from
        <select id="play-from" value={from} onChange={(event) => setBar(Number(event.target.value))}>
          {Array.from({ length: bars }, (_, index) => <option key={index} value={index}>Bar {index + 1}</option>)}
        </select>
      </label>
      <button id="play-from-btn" aria-label={`Play from bar ${from + 1}`} onClick={() => onPlayFrom(from)}>
        <Icon name="play" className="inline-icon" /> Play
      </button>
    </div>
  );
}

/** Song › Tempo: the starting tempo, then changes at bars, at once or gliding. */
export function TempoMap({ project, onChange }: { project: Project; onChange: (next: Project) => void }) {
  const bars = songBars(project);
  if (bars < 2) return null;
  const changes = (project.tempoChanges ?? []).filter((change) => change.bar < bars);
  const free = nextFreeTempoBar(project);
  return (
    <section className="song-tempo bass-assistant" aria-label="Tempo">
      <h3>Tempo</h3>
      <div className="timing-row timing-start"><span>Bar 1</span><span>{project.bpm} BPM</span></div>
      {changes.map((change) => (
        <div className="timing-row tempo-change" key={change.bar}>
          <select aria-label={`Bar of tempo change at bar ${change.bar + 1}`} value={change.bar}
            onChange={(event) => onChange(moveTempoChange(project, change.bar, Number(event.target.value)))}>
            {Array.from({ length: bars - 1 }, (_, index) => index + 1)
              .filter((bar) => bar === change.bar || !changes.some((other) => other.bar === bar))
              .map((bar) => <option key={bar} value={bar}>Bar {bar + 1}</option>)}
          </select>
          <input type="number" min={MIN_BPM} max={MAX_BPM} aria-label={`Tempo at bar ${change.bar + 1}`} value={change.bpm}
            onChange={(event) => onChange(setTempoChange(project, change.bar, Number(event.target.value), change.glideBars ?? 0))} />
          <select aria-label={`Change at bar ${change.bar + 1}`} value={change.glideBars ?? 0}
            onChange={(event) => onChange(setTempoChange(project, change.bar, change.bpm, Number(event.target.value)))}>
            {GLIDE_BARS.map((glide) => <option key={glide} value={glide}>{glideLabel(glide)}</option>)}
          </select>
          <button className="secondary" aria-label={`Remove tempo change at bar ${change.bar + 1}`}
            onClick={() => onChange(removeTempoChange(project, change.bar))}><Icon name="close" className="inline-icon" /></button>
        </div>
      ))}
      <button id="tempo-add" className="secondary" disabled={free === undefined}
        onClick={() => { if (free !== undefined) onChange(setTempoChange(project, free, project.tempoChanges?.at(-1)?.bpm ?? project.bpm)); }}>
        <Icon name="add" className="inline-icon" /> Tempo change
      </button>
    </section>
  );
}

/** A small picture of the lane across the song: one line, points as dots. */
function LaneSketch({ project, channelId, param }: { project: Project; channelId: string; param: AutomationParam }) {
  const lane = automationLane(project, channelId, param);
  const bars = songBars(project);
  const width = 200;
  const height = 40;
  const y = (value: number) => param === 'volume' ? height - 4 - value * (height - 8) : height / 2 - value * (height / 2 - 4);
  const samples = Array.from({ length: bars * 4 + 1 }, (_, index) => {
    const step = (index / 4) * project.noteLength;
    const channel = project.channels.find((item) => item.id === channelId);
    const value = lane ? laneValue(lane, step, project.noteLength) : param === 'volume' ? 1 : channel?.pan ?? 0;
    return `${(index / (bars * 4)) * width},${y(value)}`;
  });
  return (
    <svg className="lane-sketch" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: bars - 1 }, (_, index) => (
        <line key={index} x1={((index + 1) / bars) * width} x2={((index + 1) / bars) * width} y1={0} y2={height} className="lane-sketch-bar" />
      ))}
      <polyline points={samples.join(' ')} className="lane-sketch-line" vectorEffect="non-scaling-stroke" />
      {lane?.points.map((point) => <circle key={point.bar} cx={(point.bar / bars) * width} cy={y(point.value)} r={2.5} className="lane-sketch-dot" />)}
    </svg>
  );
}

/** Song › Automation: a track's volume or pan changing over the song. */
export function Automation({ project, onChange }: { project: Project; onChange: (next: Project) => void }) {
  const [channelChoice, setChannelChoice] = useState('');
  const [param, setParam] = useState<AutomationParam>('volume');
  const bars = songBars(project);
  const channel = project.channels.find((item) => item.id === channelChoice) ?? project.channels[0];
  if (bars < 2 || !channel) return null;
  const lane = automationLane(project, channel.id, param);
  const points = lane?.points ?? [];
  const free = nextFreeAutomationBar(project, channel.id, param);
  const barName = (bar: number) => bar >= bars ? 'End' : `Bar ${bar + 1}`;
  return (
    <section className="song-automation bass-assistant" aria-label="Automation">
      <h3>Automation</h3>
      <div className="automation-target">
        <label>Track
          <select id="automation-track" value={channel.id} onChange={(event) => setChannelChoice(event.target.value)}>
            {project.channels.map((item) => (
              <option key={item.id} value={item.id}>{item.name}{automationLane(project, item.id, 'volume') || automationLane(project, item.id, 'pan') ? ' •' : ''}</option>
            ))}
          </select>
        </label>
        <div className="layout-toggle" role="group" aria-label="Automate">
          {AUTOMATION_PARAMS.map((item) => (
            <button key={item.id} id={`automation-${item.id}`} className={param === item.id ? 'on' : 'secondary'} aria-pressed={param === item.id}
              onClick={() => setParam(item.id)}>{item.label}</button>
          ))}
        </div>
      </div>
      <LaneSketch project={project} channelId={channel.id} param={param} />
      {points.map((point) => (
        <div className="timing-row automation-point" key={point.bar}>
          <select aria-label={`Bar of ${param} point at ${barName(point.bar)}`} value={point.bar}
            onChange={(event) => onChange(moveAutomationPoint(project, channel.id, param, point.bar, Number(event.target.value)))}>
            {Array.from({ length: bars + 1 }, (_, bar) => bar)
              .filter((bar) => bar === point.bar || !points.some((other) => other.bar === bar))
              .map((bar) => <option key={bar} value={bar}>{barName(bar)}</option>)}
          </select>
          <input type="range" aria-label={`${param === 'volume' ? 'Volume' : 'Pan'} at ${barName(point.bar)}`}
            min={param === 'volume' ? 0 : -1} max={1} step={0.05} value={point.value}
            onChange={(event) => onChange(setAutomationPoint(project, channel.id, param, point.bar, Number(event.target.value)))} />
          <span className="automation-value">{valueLabel(param, point.value)}</span>
          <button className="secondary" aria-label={`Remove ${param} point at ${barName(point.bar)}`}
            onClick={() => onChange(removeAutomationPoint(project, channel.id, param, point.bar))}><Icon name="close" className="inline-icon" /></button>
        </div>
      ))}
      <div className="automation-actions">
        <button id="automation-add" className="secondary" disabled={free === undefined}
          onClick={() => {
            if (free === undefined) return;
            const value = lane ? laneValue(lane, free * project.noteLength, project.noteLength) : startingValue(channel, param);
            onChange(setAutomationPoint(project, channel.id, param, free, value));
          }}><Icon name="add" className="inline-icon" /> Point</button>
        <button className="secondary" disabled={!lane} onClick={() => onChange(clearAutomation(project, channel.id, param))}>Clear</button>
      </div>
    </section>
  );
}
