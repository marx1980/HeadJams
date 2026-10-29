/** Polyphony limits, voice stealing and choke groups, shared by live playback and export. */

export interface TrackedVoice {
  id: number;
  start: number;
  /** When the note is released (one-shots count as released immediately). */
  noteEnd: number;
  /** When the voice is fully silent. */
  end: number;
  level: number;
  /** Voices sharing this key count against one polyphony limit (instrument on a channel). */
  polyKey: string;
  /** Voices sharing this key cut each other off (for example closed and open hi-hat). */
  chokeKey?: string;
}

export interface VoiceCut {
  id: number;
  at: number;
}

/** Seconds used to fade out a choked or stolen voice. */
export const CUT_FADE_SEC = 0.01;

export class VoiceTracker {
  private active: TrackedVoice[] = [];

  /** Register a new voice; returns the earlier voices that must be cut at its start time. */
  add(voice: TrackedVoice, maxPolyphony: number): VoiceCut[] {
    const t = voice.start;
    this.active = this.active.filter((active) => active.end > t);
    const cuts: VoiceCut[] = [];
    const cut = (victim: TrackedVoice) => {
      cuts.push({ id: victim.id, at: t });
      this.active = this.active.filter((active) => active !== victim);
    };
    if (voice.chokeKey) {
      for (const active of [...this.active]) if (active.chokeKey === voice.chokeKey) cut(active);
    }
    const limit = Math.max(1, maxPolyphony);
    let same = this.active.filter((active) => active.polyKey === voice.polyKey);
    while (same.length >= limit) {
      cut(chooseVictim(same, t));
      same = this.active.filter((active) => active.polyKey === voice.polyKey);
    }
    this.active.push(voice);
    return cuts;
  }

  get size(): number {
    return this.active.length;
  }
}

/** Steal order: released voices (oldest first), then the quietest, then the oldest. */
export function chooseVictim(voices: readonly TrackedVoice[], now: number): TrackedVoice {
  const byAge = (a: TrackedVoice, b: TrackedVoice) => a.start - b.start || a.id - b.id;
  const released = voices.filter((voice) => voice.noteEnd <= now).sort(byAge);
  if (released.length) return released[0];
  return [...voices].sort((a, b) => a.level - b.level || byAge(a, b))[0];
}
