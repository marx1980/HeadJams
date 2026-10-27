import { useEffect, useRef, useState } from 'react';
import type { NoteEvent, Project } from '../model/project';
import { totalSteps } from '../model/project';
import { parseMidiNoteMessage, quantizeMidiNote } from '../platform/midi';

interface MidiInputLike {
  id: string;
  name?: string;
  onmidimessage: ((event: { data?: ArrayLike<number> | null }) => void) | null;
}

interface MidiAccessLike {
  inputs: { values: () => Iterable<MidiInputLike> };
  onstatechange: (() => void) | null;
}

interface PendingNote {
  startedAt: number;
  channelId: string;
  velocity: number;
}

type MidiNavigator = Navigator & {
  requestMIDIAccess?: () => Promise<MidiAccessLike>;
};

export function MidiRecorder({
  project, onNote,
}: {
  project: Project;
  onNote: (channelId: string, note: NoteEvent) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [access, setAccess] = useState<MidiAccessLike>();
  const [inputs, setInputs] = useState<MidiInputLike[]>([]);
  const [selectedInputId, setSelectedInputId] = useState('');
  const [channelId, setChannelId] = useState(project.channels[0]?.id ?? '');
  const [error, setError] = useState('');
  const projectRef = useRef(project);
  const channelIdRef = useRef(channelId);
  const onNoteRef = useRef(onNote);
  const captureStartedAtRef = useRef(0);
  const pendingNotesRef = useRef(new Map<string, PendingNote[]>());
  const [inputRevision, setInputRevision] = useState(0);
  projectRef.current = project;
  channelIdRef.current = channelId;
  onNoteRef.current = onNote;

  useEffect(() => {
    if (!project.channels.some((channel) => channel.id === channelId)) {
      setChannelId(project.channels[0]?.id ?? '');
    }
  }, [channelId, project.channels]);

  useEffect(() => {
    if (!recording || !access) return;
    const connectedInputs = [...access.inputs.values()];
    const selectedInputs = selectedInputId
      ? connectedInputs.filter((input) => input.id === selectedInputId)
      : connectedInputs;
    const onMessage = (input: MidiInputLike, event: { data?: ArrayLike<number> | null }) => {
      if (!event.data) return;
      const message = parseMidiNoteMessage(event.data);
      if (!message) return;
      const key = `${input.id}:${message.channel}:${message.pitch}`;
      const now = performance.now();
      if (message.type === 'note-on') {
        const pending = pendingNotesRef.current.get(key) ?? [];
        pending.push({
          startedAt: now,
          channelId: channelIdRef.current,
          velocity: message.velocity,
        });
        pendingNotesRef.current.set(key, pending);
        return;
      }
      const pending = pendingNotesRef.current.get(key);
      const started = pending?.shift();
      if (!started) return;
      if (pending?.length === 0) pendingNotesRef.current.delete(key);
      const currentProject = projectRef.current;
      const quantized = quantizeMidiNote(
        (started.startedAt - captureStartedAtRef.current) / 1000,
        (now - started.startedAt) / 1000,
        currentProject.bpm,
        currentProject.noteLength,
        totalSteps(currentProject),
      );
      if (!quantized || !currentProject.channels.some((channel) => channel.id === started.channelId)) return;
      onNoteRef.current(started.channelId, {
        id: `midi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        pitch: message.pitch,
        step: quantized.step,
        durationSteps: quantized.durationSteps,
        velocity: started.velocity,
      });
    };

    for (const input of selectedInputs) {
      input.onmidimessage = (event) => onMessage(input, event);
    }
    const refreshInputs = () => {
      setInputs([...access.inputs.values()]);
      setInputRevision((revision) => revision + 1);
    };
    access.onstatechange = refreshInputs;
    setInputs(connectedInputs);
    return () => {
      for (const input of selectedInputs) input.onmidimessage = null;
      access.onstatechange = null;
      pendingNotesRef.current.clear();
    };
  }, [access, inputRevision, recording, selectedInputId]);

  const startRecording = async () => {
    setError('');
    const requestAccess = (navigator as MidiNavigator).requestMIDIAccess;
    if (!requestAccess) {
      setError('Web MIDI is not supported in this browser. Try a supported desktop browser over HTTPS.');
      return;
    }
    try {
      const midiAccess = await requestAccess.call(navigator);
      captureStartedAtRef.current = performance.now();
      pendingNotesRef.current.clear();
      setAccess(midiAccess);
      setInputs([...midiAccess.inputs.values()]);
      setRecording(true);
    } catch {
      setError('MIDI access was not granted. Check browser permissions and try again.');
    }
  };

  const stopRecording = () => {
    setRecording(false);
    pendingNotesRef.current.clear();
  };

  return (
    <section className="panel midi-recorder" aria-label="MIDI input">
      <strong>MIDI input</strong>
      <div className="row">
        <label>Record to track
          <select aria-label="MIDI target track" value={channelId} disabled={recording || project.channels.length === 0}
            onChange={(event) => setChannelId(event.target.value)}>
            {project.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
          </select>
        </label>
        <label>MIDI device
          <select aria-label="MIDI device" value={selectedInputId} disabled={recording}
            onChange={(event) => setSelectedInputId(event.target.value)}>
            <option value="">All available devices</option>
            {inputs.map((input) => <option key={input.id} value={input.id}>{input.name || 'MIDI device'}</option>)}
          </select>
        </label>
        {recording
          ? <button className="secondary" onClick={stopRecording}>Stop MIDI recording</button>
          : <button disabled={!project.channels.length} onClick={() => void startRecording()}>Record MIDI</button>}
      </div>
      {recording && <p className="hint" role="status">Listening for MIDI notes. Notes are quantized to the current loop and saved to the selected track.</p>}
      {!recording && inputs.length === 0 && !error && <p className="hint">Connect a MIDI input, then choose Record MIDI.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
