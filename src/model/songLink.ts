import { normalizeProject } from './storage';
import type { Channel, Project, SoundDef } from './project';

/**
 * Song links (adoption.md): the whole project travels in the URL fragment (never sent to a server),
 * compressed with deflate. The user's own recordings cannot travel, so sounds made from them fall back
 * to factory sounds and captured takes stay behind.
 */

export const SONG_LINK_PARAM = 'song';
const VERSION = '1';

/** The project as it can be shared: no recordings, takes or personal instruments. */
export function projectForLink(p: Project): Project {
  const replace = new Map<string, string>();
  const customSounds: SoundDef[] = p.customSounds.flatMap((sound): SoundDef[] => {
    if (sound.assetSource !== 'user-sample') return [sound];
    if (sound.recordedChordsId) {
      const { recordedChordsId: _chords, ...rest } = sound;
      return [{ ...rest, assetSource: 'procedural' }];
    }
    if (sound.instrumentId?.startsWith('mine-')) {
      replace.set(sound.id, 'grand-piano');
      return [];
    }
    const { sampleId: _sample, sampleVersion: _version, ...rest } = sound;
    return [{ ...rest, assetSource: 'procedural' }];
  });
  const channel = (item: Channel): Channel => {
    const { original: _original, playOriginal: _play, ...rest } = item;
    return {
      ...rest,
      soundId: replace.get(item.soundId) ?? item.soundId,
      ...(item.lanes ? { lanes: item.lanes.map((lane) => ({ ...lane, soundId: replace.get(lane.soundId) ?? lane.soundId })) } : {}),
    };
  };
  const { personalInstruments: _personal, ...rest } = p;
  return {
    ...rest,
    customSounds,
    channels: p.channels.map(channel),
    patterns: p.patterns.map((pattern) => ({ ...pattern, channels: pattern.channels.map(channel) })),
    recognitionTakes: [],
  };
}

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const response = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

/** The fragment payload ("1.<deflated base64url>") for a project. */
export async function encodeSong(p: Project): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(projectForLink(p)));
  return `${VERSION}.${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

export async function decodeSong(payload: string): Promise<Project | undefined> {
  const [version, data] = payload.split('.', 2);
  if (version !== VERSION || !data) return undefined;
  try {
    const json = new TextDecoder().decode(await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw')));
    const project = normalizeProject(json);
    return project ? projectForLink(project) : undefined;
  } catch {
    return undefined;
  }
}

/** Full link for the app at `base` (e.g. https://host/MusicMaker/). */
export async function songLink(p: Project, base: string): Promise<string> {
  return `${base.split('#')[0]}#${SONG_LINK_PARAM}=${await encodeSong(p)}`;
}

/** The song payload in a location hash, if any. */
export function songPayload(hash: string): string | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get(SONG_LINK_PARAM) ?? undefined;
}
