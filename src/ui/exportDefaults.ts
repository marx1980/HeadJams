import { SAMPLE_RATE } from '../library/sounds';

export interface ExportDefaults { sampleRate: number; bitDepth: 16 | 24; normalize: boolean }

const KEY = 'musicmaker.exportDefaults';
const RATES = [44100, 48000, 96000];

export function fallbackExportDefaults(): ExportDefaults {
  return { sampleRate: SAMPLE_RATE, bitDepth: 16, normalize: false };
}

export function loadExportDefaults(): ExportDefaults {
  const base = fallbackExportDefaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ExportDefaults> | null;
    if (!raw || typeof raw !== 'object') return base;
    return {
      sampleRate: RATES.includes(raw.sampleRate as number) ? (raw.sampleRate as number) : base.sampleRate,
      bitDepth: raw.bitDepth === 24 ? 24 : 16,
      normalize: raw.normalize === true,
    };
  } catch {
    return base;
  }
}

export function saveExportDefaults(value: ExportDefaults): void {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
