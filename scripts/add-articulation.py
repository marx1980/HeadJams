#!/usr/bin/env python3
"""Add an articulation (staccato, breath, keys…) to a bundled instrument (dev only; needs ffmpeg and numpy).

Two sources:
  --from-dir DIR   an instrument folder made by sfz-import.py (pitched articulations such as staccato);
                   its regions are added with a file/id prefix.
  --files F...     plain recordings of unpitched noises (breath, key clicks); each becomes a full-range
                   round-robin region that the player does not pitch-shift.

The new regions are levelled against the instrument's default articulation (RMS of their first
--level-window seconds vs the sustained level of the existing regions), the manifest version is bumped
so caches refresh, and the processing note is extended.

Examples:
  python3 scripts/sfz-import.py SRC/FluteStac.sfz --id flute --out /tmp/stac ... --articulation staccato
  python3 scripts/add-articulation.py flute --from-dir /tmp/stac --articulation staccato --note "FluteStac.sfz"
  python3 scripts/add-articulation.py tenor-sax --files SRC/ten_b_0*.flac --articulation breath --seconds 0.6 --level-db -6
"""
import argparse, json, shutil, subprocess, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent / 'app/public/instruments'


def read_wav(path):
    with wave.open(str(path)) as w:
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        return data, w.getframerate()


def write_wav(path, data, rate):
    pcm = np.clip(np.round(data * 32767), -32768, 32767).astype(np.int16)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def rms(data):
    return float(np.sqrt(np.mean(data ** 2))) if len(data) else 0.0


def sustained_level(folder, manifest):
    levels = []
    for region in manifest['regions']:
        if region['articulation'] != manifest['defaultArticulation']:
            continue
        data, rate = read_wav(folder / region['file'])
        start = region.get('loopStartMs', 150) / 1000
        end = region.get('loopEndMs', 600) / 1000
        levels.append(rms(data[int(start * rate):int(end * rate)]))
    return float(np.median(levels)) if levels else 0.1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('instrument')
    ap.add_argument('--articulation', required=True)
    ap.add_argument('--from-dir', type=Path)
    ap.add_argument('--files', nargs='+', type=Path)
    ap.add_argument('--seconds', type=float, default=0.6, help='--files: cut each recording to this length')
    ap.add_argument('--fade-ms', type=float, default=80)
    ap.add_argument('--level-window', type=float, default=0.15, help='seconds measured from the start of each new region')
    ap.add_argument('--level-db', type=float, default=-1.0, help='level of the new regions relative to the sustained level')
    ap.add_argument('--note', default='', help='source note for the processing text')
    args = ap.parse_args()

    folder = ROOT / args.instrument
    manifest = json.loads((folder / 'manifest.json').read_text())
    prefix = {'staccato': 'st', 'breath': 'br', 'keys': 'ky'}.get(args.articulation, args.articulation[:3])
    manifest['regions'] = [r for r in manifest['regions'] if r['articulation'] != args.articulation]
    for old in folder.glob(f'{prefix}-*.wav'):
        old.unlink()
    target = sustained_level(folder, manifest)
    rate = None
    added = []
    if args.from_dir:
        source = json.loads((args.from_dir / 'manifest.json').read_text())
        for region in source['regions']:
            data, rate = read_wav(args.from_dir / region['file'])
            new = dict(region, id=f"{prefix}-{region['id']}", file=f"{prefix}-{region['file']}", articulation=args.articulation)
            for key in ('loopStartMs', 'loopEndMs', 'gainDb'):
                new.pop(key, None)
            shutil.copyfile(args.from_dir / region['file'], folder / new['file'])
            added.append((new, data, rate, region.get('gainDb', 0)))
    else:
        rate = 22050
        for index, path in enumerate(sorted(args.files)):
            raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(rate), '-t', str(args.seconds),
                                  '-f', 'f32le', '-'], check=True, capture_output=True).stdout
            data = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
            fade = min(len(data), int(args.fade_ms / 1000 * rate))
            if fade:
                data[-fade:] *= np.linspace(1, 0, fade)
                data[:min(len(data), 64)] *= np.linspace(0, 1, min(len(data), 64))
            data = data / max(1e-9, np.abs(data).max()) * 0.89
            name = f'{prefix}-{index + 1}.wav'
            write_wav(folder / name, data, rate)
            region = {
                'id': f'{prefix}-{index + 1}', 'file': name, 'rootMidi': 60, 'lowMidi': 0, 'highMidi': 127,
                'velocityLow': 1, 'velocityHigh': 127, 'articulation': args.articulation,
                'roundRobinGroup': prefix, 'roundRobinIndex': index,
            }
            added.append((region, data, rate, 0))
    # Level the new regions against the sustained sound: one offset for all, keeping their own balance.
    measured = float(np.median([rms(data[:max(1, int(args.level_window * r))]) * 10 ** (g / 20) for _, data, r, g in added]))
    offset = 20 * np.log10(max(1e-9, target) / max(1e-9, measured)) + args.level_db
    # Never push the loudest new recording past -0.5 dBFS.
    loudest = max(float(np.abs(data).max()) * 10 ** (g / 20) for _, data, _, g in added)
    offset = min(offset, 20 * np.log10(0.94 / max(1e-9, loudest)))
    for region, _, _, own in added:
        gain = round(own + offset, 2)
        if abs(gain) > 0.01:
            region['gainDb'] = gain
        manifest['regions'].append(region)
    manifest['version'] = manifest.get('version', 1) + 1
    note = f" Added {args.articulation} ({len(added)} regions{', ' + args.note if args.note else ''}) with scripts/add-articulation.py, levelled {offset:+.1f} dB against the sustain."
    parts = manifest['provenance'].get('processing', '').split(' Added ')
    kept = [parts[0]] + [part for part in parts[1:] if not part.startswith(f'{args.articulation} ')]
    manifest['provenance']['processing'] = ' Added '.join(kept).rstrip() + note
    (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    size = sum(f.stat().st_size for f in folder.iterdir()) / 1e6
    print(f'{args.instrument}: +{len(added)} {args.articulation} regions, offset {offset:+.1f} dB, folder {size:.2f} MB, version {manifest["version"]}')


if __name__ == '__main__':
    main()
