import { useState } from 'react';
import { clearTrackBar, copyTrackBar, fillTrackFromBar } from '../model/bars';
import type { Channel, NoteLength, Project } from '../model/project';
import {
  canPaste, canSetLength, copyTrack, copyTrackTo, lengthOptions, loadClip, pasteTrack, saveClip, setTrackLength, setTrackView,
  trackKind, trackLength, trackLengthId, trackView, viewOptions, type TrackLength,
} from '../model/trackPattern';
import { canEditSteps } from '../model/stepEdit';
import { Icon } from './Icon';

export type TapMode = 'hit' | 'insert' | 'remove';
const TAP_MODES: { id: TapMode; label: string }[] = [
  { id: 'hit', label: 'Hit' },
  { id: 'insert', label: 'Insert' },
  { id: 'remove', label: 'Remove' },
];

/** Beat › track › Pattern tools: Length, Steps, bar Fill / Copy / Clear, and copy-paste of the track's pattern. */
export function TrackPatternTools({
  project, channel, shownBar, onChange, onMessage, tap, onTap, noRoom, onInsertAnyway, onCancelInsert,
}: {
  project: Project;
  channel: Channel;
  shownBar?: number;
  onChange: (next: Project) => void;
  onMessage: (text: string) => void;
  tap: TapMode;
  onTap: (mode: TapMode) => void;
  /** An Insert would push the last step's hit off the end: ask before doing it. */
  noRoom: boolean;
  onInsertAnyway: () => void;
  onCancelInsert: () => void;
}) {
  const [clip, setClip] = useState(loadClip);
  const trackBars = Math.max(1, Math.ceil(trackLength(project, channel) / project.noteLength));
  const [barChoice, setBarChoice] = useState(shownBar ?? 0);
  const bar = Math.min(barChoice, trackBars - 1);
  const others = project.channels.filter((item) => item.id !== channel.id && (channel.lanes ? item.lanes : !item.lanes)
    && (trackKind(channel) !== 'hits' || trackKind(item) === 'hits'));
  return (
    <div className="track-tools">
      {canEditSteps(channel) && (
        <div className="track-tools-full tap-modes" role="group" aria-label={`Tap mode for ${channel.name}`}>
          <span>Tap</span>
          {TAP_MODES.map((mode) => (
            <button key={mode.id} className={tap === mode.id ? 'on' : 'secondary'} aria-pressed={tap === mode.id}
              onClick={() => onTap(mode.id)}>{mode.label}</button>
          ))}
        </div>
      )}
      {noRoom && (
        <div className="track-tools-full no-room" role="alert">
          <span>No room · last step is lost</span>
          <button onClick={onInsertAnyway}>Insert anyway</button>
          <button className="secondary" onClick={onCancelInsert}>Cancel</button>
        </div>
      )}
      {canSetLength(channel) && (
        <label>Length
          <select aria-label={`Length of ${channel.name}`} value={trackLengthId(project, channel)}
            onChange={(event) => onChange(setTrackLength(project, channel.id, event.target.value as TrackLength))}>
            {lengthOptions(project).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      )}
      <label>Steps
        <select aria-label={`Steps of ${channel.name}`} value={trackView(project, channel)}
          onChange={(event) => onChange(setTrackView(project, channel.id, Number(event.target.value) as NoteLength))}>
          {viewOptions(project).map((n) => <option key={n} value={n}>1/{n}</option>)}
        </select>
      </label>
      {trackBars > 1 && (
        <>
          <label>Bar
            <select aria-label={`Bar of ${channel.name}`} value={bar} onChange={(event) => setBarChoice(Number(event.target.value))}>
              {Array.from({ length: trackBars }, (_, index) => <option key={index} value={index}>Bar {index + 1}</option>)}
            </select>
          </label>
          <label>To bar
            <select aria-label={`Copy bar ${bar + 1} of ${channel.name} to`} value=""
              onChange={(event) => onChange(copyTrackBar(project, channel.id, bar, Number(event.target.value)))}>
              <option value="" disabled>Copy</option>
              {Array.from({ length: trackBars }, (_, index) => index).filter((index) => index !== bar)
                .map((index) => <option key={index} value={index}>Bar {index + 1}</option>)}
            </select>
          </label>
          <button className="secondary" aria-label={`Fill ${channel.name} with bar ${bar + 1}`}
            onClick={() => onChange(fillTrackFromBar(project, channel.id, bar))}><Icon name="duplicate" className="inline-icon" /> Fill</button>
          <button className="secondary" aria-label={`Clear bar ${bar + 1} of ${channel.name}`}
            onClick={() => onChange(clearTrackBar(project, channel.id, bar))}><Icon name="close" className="inline-icon" /> Clear</button>
        </>
      )}
      <button className="secondary" aria-label={`Copy ${channel.name} pattern`} onClick={() => {
        const copied = copyTrack(project, channel.id);
        if (!copied) return;
        saveClip(copied);
        setClip(copied);
        onMessage('Pattern copied');
      }}>Copy</button>
      <button className="secondary" aria-label={`Paste pattern into ${channel.name}`} disabled={!canPaste(clip, channel)}
        onClick={() => { if (clip) onChange(pasteTrack(project, channel.id, clip)); }}>Paste</button>
      {others.length > 0 && (
        <label className="track-tools-wide">To track
          <select aria-label={`Copy ${channel.name} pattern to track`} value=""
            onChange={(event) => onChange(copyTrackTo(project, channel.id, event.target.value))}>
            <option value="" disabled>Copy</option>
            {others.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
