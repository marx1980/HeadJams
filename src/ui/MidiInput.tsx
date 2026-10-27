import { useEffect, useRef, useState } from 'react';
import { parseMidiMessage, supportsMidiInput, type MidiMessage } from '../platform/midi';
import type { Channel } from '../model/project';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { CapacitorMIDIDevice } from '@eugabrielsilva/capacitor-midi-device';

interface MidiEventLike {
  data: Uint8Array;
  timeStamp: number;
}

interface MidiInputLike {
  id: string;
  name?: string;
  state?: string;
  onmidimessage: ((event: MidiEventLike) => void) | null;
}

interface MidiAccessLike {
  inputs: Map<string, MidiInputLike>;
  onstatechange: (() => void) | null;
}

type MidiNavigator = Navigator & {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MidiAccessLike>;
};

export function MidiInput({
  channels, targetChannelId, onTargetChannelChange, recording, onRecordingChange, onMessage, onReleaseAll, onConnected,
}: {
  channels: Channel[];
  targetChannelId: string;
  onTargetChannelChange: (id: string) => void;
  recording: boolean;
  onRecordingChange: (recording: boolean) => void;
  onMessage: (message: MidiMessage, timestamp: number) => void;
  onReleaseAll: () => void;
  onConnected: () => void;
}) {
  const [access, setAccess] = useState<MidiAccessLike>();
  const [connected, setConnected] = useState(false);
  const [inputs, setInputs] = useState<MidiInputLike[]>([]);
  const [nativeDevices, setNativeDevices] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const nativeListeners = useRef<PluginListenerHandle[]>([]);
  const nativePlatform = Capacitor.isNativePlatform();
  const messageRef = useRef(onMessage);
  const releaseRef = useRef(onReleaseAll);
  messageRef.current = onMessage;
  releaseRef.current = onReleaseAll;

  useEffect(() => {
    if (!access) return;
    const refresh = () => {
      const available = [...access.inputs.values()];
      setInputs(available);
      setConnected(true);
      setSelectedId((current) => available.some((input) => input.id === current)
        ? current : available[0]?.id ?? '');
      if (!available.length) releaseRef.current();
    };
    access.onstatechange = refresh;
    refresh();
    return () => { access.onstatechange = null; };
  }, [access]);

  useEffect(() => {
    const input = inputs.find((item) => item.id === selectedId);
    if (!input) return;
    input.onmidimessage = (event) => {
      const message = parseMidiMessage(event.data);
      if (!message) return;
      if (message.type === 'all-notes-off') releaseRef.current();
      messageRef.current(message, event.timeStamp);
    };
    return () => {
      input.onmidimessage = null;
      releaseRef.current();
    };
  }, [inputs, selectedId]);

  useEffect(() => {
    if (!nativePlatform || !connected || !selectedId || !nativeDevices[Number(selectedId)]) return;
    void CapacitorMIDIDevice.openDevice({ deviceNumber: Number(selectedId) })
      .catch(() => setError('Could not open this MIDI input. Reconnect the device and try again.'));
    return () => { releaseRef.current(); };
  }, [connected, nativeDevices, nativePlatform, selectedId]);

  useEffect(() => () => {
    nativeListeners.current.forEach((listener) => { void listener.remove(); });
  }, []);

  const enable = async () => {
    if (nativePlatform) {
      setOpening(true);
      setError('');
      try {
        nativeListeners.current = [
          await CapacitorMIDIDevice.addListener('MIDI_MSG_EVENT', (event) => {
            const message = parseMidiMessage(event.data);
            if (message) messageRef.current(message, performance.now());
          }),
          await CapacitorMIDIDevice.addListener('MIDI_CON_EVENT', ({ value }) => {
            setNativeDevices(value);
            setSelectedId((current) => current && Number(current) < value.length ? current : value.length ? '0' : '');
            if (!value.length) releaseRef.current();
          }),
        ];
        await CapacitorMIDIDevice.initConnectionListener();
        const { value } = await CapacitorMIDIDevice.listMIDIDevices();
        setNativeDevices(value);
        setSelectedId(value.length ? '0' : '');
        setConnected(true);
        onConnected();
      } catch {
        setError('Could not access MIDI devices. Check permissions and reconnect the device.');
      } finally {
        setOpening(false);
      }
      return;
    }
    const request = (navigator as MidiNavigator).requestMIDIAccess;
    if (!request) {
      setError('MIDI input is not supported in this browser. Try a recent desktop browser over HTTPS.');
      return;
    }
    setOpening(true);
    setError('');
    try {
      setAccess(await request.call(navigator, { sysex: false }));
      setConnected(true);
      onConnected();
    } catch (reason) {
      setError(reason instanceof Error && reason.name === 'SecurityError'
        ? 'MIDI permission was denied or blocked. Allow MIDI access in browser settings and try again.'
        : 'Could not open MIDI input. Check browser permissions and reconnect the device.');
    } finally {
      setOpening(false);
    }
  };

  const disconnect = () => {
    releaseRef.current();
    setAccess(undefined);
    setConnected(false);
    setInputs([]);
    setNativeDevices([]);
    setSelectedId('');
    setError('');
    nativeListeners.current.forEach((listener) => { void listener.remove(); });
    nativeListeners.current = [];
  };

  return (
    <section className="panel midi-panel" aria-label="MIDI keyboard">
      <h2>MIDI keyboard</h2>
      {!connected ? (
        <button id="midi-connect" className="secondary" disabled={!supportsMidiInput() || opening} onClick={() => void enable()}>
          {opening ? 'Connecting…' : 'Connect MIDI keyboard'}
        </button>
      ) : (
        <>
          <label>MIDI input
            <select aria-label="MIDI input" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {nativePlatform
                ? nativeDevices.map((name, index) => <option key={`${name}-${index}`} value={String(index)}>{name}</option>)
                : inputs.map((input) => <option key={input.id} value={input.id}>{input.name || 'MIDI device'}{input.state === 'connected' ? '' : ' · disconnected'}</option>)}
              {!(nativePlatform ? nativeDevices.length : inputs.length) && <option value="">No MIDI devices connected</option>}
            </select>
          </label>
          <label>Record to channel
            <select aria-label="MIDI recording channel" value={targetChannelId} onChange={(event) => onTargetChannelChange(event.target.value)}>
              {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
            </select>
          </label>
          <button id="midi-record" disabled={!selectedId || !targetChannelId} onClick={() => onRecordingChange(!recording)}>
            {recording ? 'Stop MIDI recording' : 'Record MIDI'}
          </button>
          {recording && <span role="status">Recording MIDI notes…</span>}
          <button className="secondary" onClick={() => { onRecordingChange(false); disconnect(); }}>Disconnect</button>
        </>
      )}
      {!supportsMidiInput() && <p className="hint">This browser or native WebView does not expose Web MIDI. MIDI input requires a supported browser and a secure context.</p>}
      {connected && !(nativePlatform ? nativeDevices.length : inputs.length) && <p className="hint">Connect a MIDI keyboard, then choose its input above.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
