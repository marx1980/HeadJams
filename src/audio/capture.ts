/** One-shot microphone capture for the Capture sheet (hum.md H1). */

export interface CaptureResult {
  samples: Float32Array;
  sampleRate: number;
  /** Musical time of the first sample, when the project was playing (see alignment.ts). */
  recordingOffsetSeconds?: number;
}

export interface CaptureSession {
  stop: () => Promise<CaptureResult>;
  cancel: () => void;
}

/** Decode any browser-supported audio blob to mono samples. */
export async function decodeToMono(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < mono.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
    }
    return { samples: mono, sampleRate: decoded.sampleRate };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * Start recording from the microphone. `offsetFor` receives the recorder start time and the mic's
 * input latency and returns the recording offset (or undefined when nothing is playing).
 */
export async function startCapture(offsetFor: (recorderStartMs: number, inputLatencySec: number) => number | undefined): Promise<CaptureSession> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Audio recording is not supported in this browser.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { noiseSuppression: false, autoGainControl: false, echoCancellation: true },
  });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  let offset: number | undefined;
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.onstart = () => {
    const settings = stream.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number } | undefined;
    offset = offsetFor(performance.now(), Number.isFinite(settings?.latency) ? settings!.latency! : 0);
  };
  const release = () => stream.getTracks().forEach((track) => track.stop());
  recorder.start();
  return {
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    },
    stop: () => new Promise<CaptureResult>((resolve, reject) => {
      recorder.onstop = () => {
        release();
        decodeToMono(new Blob(chunks, { type: recorder.mimeType }))
          .then((decoded) => resolve({ ...decoded, ...(offset === undefined ? {} : { recordingOffsetSeconds: offset }) }))
          .catch(() => reject(new Error('The recording could not be decoded.')));
      };
      if (recorder.state === 'inactive') recorder.onstop(new Event('stop'));
      else recorder.stop();
    }),
  };
}
