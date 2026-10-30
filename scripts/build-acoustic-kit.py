#!/usr/bin/env python3
"""Build the bundled 'acoustic-kit' instrument from Karoryfer Big Rusty Drums (CC0).

Usage (dev only, needs git, ffmpeg and numpy):
  git clone --filter=blob:none --no-checkout https://github.com/sfzinstruments/karoryfer.big-rusty-drums SRC
  python3 scripts/build-acoustic-kit.py SRC

Picks 3 velocity layers x 2 round robins per piece, mixes close and overhead mics to mono,
trims silence, normalises each piece consistently (dynamics between layers are kept),
and writes 16-bit 44.1 kHz WAV files plus manifest.json to app/public/instruments/acoustic-kit.
WAV is used instead of MP3/AAC because those codecs add start padding that makes drums late.
"""
import json, re, subprocess, sys, wave
from pathlib import Path
import numpy as np

SRC = Path(sys.argv[1]).resolve()
OUT = Path(__file__).resolve().parent.parent / 'app/public/instruments/acoustic-kit'
RATE = 44100

# id, folder, {mic folder: weight}, MIDI note (GM), max seconds, choke group, gain dB
PIECES = [
    ('kick',      'kick_24/kick',      {'kick': 1.0, 'oh': 0.5},           36, 0.9, None,  0),
    ('snare',     'snare_14/center',   {'top': 1.0, 'btm': 0.35, 'oh': 0.6}, 38, 1.0, None, -1),
    ('sidestick', 'snare_14/sidestick', {'top': 1.0, 'oh': 0.5},           37, 0.45, None, -3),
    ('hat-closed','hihat_14/cl',       {'cl': 1.0, 'oh': 0.5},             42, 0.4, 'hat', -7),
    ('hat-pedal', 'hihat_14/chik',     {'cl': 1.0, 'oh': 0.5},             44, 0.4, 'hat', -8),
    ('hat-half',  'hihat_14/ho',       {'cl': 1.0, 'oh': 0.5},             45, 0.9, 'hat', -8),
    ('hat-open',  'hihat_14/open',     {'cl': 1.0, 'oh': 0.5},             46, 1.6, 'hat', -8),
    ('tom-high',  'tom_14/center',     {'cl': 1.0, 'oh': 0.5},             50, 1.2, None, -3),
    ('tom-mid',   'tom_15/center',     {'cl': 1.0, 'oh': 0.5},             48, 1.3, None, -3),
    ('tom-low',   'tom_18/center',     {'cl': 1.0, 'oh': 0.5},             43, 1.5, None, -3),
    ('crash',     'crash_17/cr',       {'cl': 1.0, 'oh': 0.7},             49, 2.6, None, -8),
    ('ride',      'ride_22/rd',        {'cl': 1.0, 'oh': 0.6},             51, 2.0, None, -9),
    ('ride-bell', 'ride_22/bl',        {'cl': 1.0, 'oh': 0.6},             53, 2.0, None, -9),
]
VELOCITY_BANDS = [(1, 70), (71, 105), (106, 127)]


def git(*args):
    return subprocess.run(['git', '-C', str(SRC), *args], check=True, capture_output=True, text=True).stdout


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def pick_files(folder, first_mic):
    names = [n.rsplit('/', 1)[1] for n in git('ls-tree', '--name-only', 'HEAD', f'Samples/{folder}/{first_mic}/').split()]
    parsed = {}
    for name in names:
        m = re.search(r'vl(\d+)_rr(\d+)', name)
        if m:
            parsed.setdefault(int(m.group(1)), {})[int(m.group(2))] = name
    layers = sorted(parsed)
    chosen = sorted({layers[round((len(layers) - 1) * f)] for f in (0.45, 0.72, 1.0)})
    return [(i, [parsed[layer][rr] for rr in sorted(parsed[layer])[:2]]) for i, layer in enumerate(chosen)]


def trim(audio, peak, max_seconds):
    threshold = peak * 10 ** (-50 / 20)
    above = np.nonzero(np.abs(audio) > threshold)[0]
    if not len(above):
        return audio[:1]
    start = max(0, above[0] - int(0.001 * RATE))
    env = np.convolve(np.abs(audio), np.ones(256) / 256, mode='same')
    tail = np.nonzero(env > peak * 10 ** (-56 / 20))[0]
    end = min(len(audio), start + int(max_seconds * RATE), (tail[-1] if len(tail) else len(audio)) + 1)
    out = audio[start:end].copy()
    fade = min(len(out), int(0.03 * RATE))
    out[-fade:] *= np.linspace(1, 0, fade)
    return out


def write_wav(path, audio):
    data = (np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes()
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(data)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.wav'):
        old.unlink()
    regions = []
    plan = []
    for piece, folder, mics, note, max_s, choke, gain in PIECES:
        first_mic = next(iter(mics))
        for band, files in pick_files(folder, first_mic):
            for rr, name in enumerate(files):
                plan.append((piece, folder, mics, note, max_s, choke, gain, band, rr, name))
    paths = sorted({f'Samples/{p[1]}/{mic}/{p[9]}' for p in plan for mic in p[2]})
    git('checkout', 'HEAD', '--', *paths)
    mixed = {}
    for piece, folder, mics, note, max_s, choke, gain, band, rr, name in plan:
        parts = [decode(SRC / f'Samples/{folder}/{mic}/{name}') * weight for mic, weight in mics.items()]
        length = max(len(p) for p in parts)
        mixed[(piece, band, rr)] = sum(np.pad(p, (0, length - len(p))) for p in parts)
    for piece, folder, mics, note, max_s, choke, gain in PIECES:
        keys = [k for k in mixed if k[0] == piece]
        peak = max(np.max(np.abs(mixed[k])) for k in keys)
        scale = 10 ** (-1 / 20) / peak
        for _, band, rr in sorted(keys):
            audio = trim(mixed[(piece, band, rr)] * scale, 10 ** (-1 / 20), max_s)
            file = f'{piece}-v{band + 1}-rr{rr + 1}.wav'
            write_wav(OUT / file, audio)
            low, high = VELOCITY_BANDS[band]
            region = {
                'id': f'{piece}-v{band + 1}-rr{rr + 1}', 'file': file, 'rootMidi': note, 'lowMidi': note, 'highMidi': note,
                'velocityLow': low, 'velocityHigh': high, 'articulation': 'hit',
                'roundRobinGroup': f'{piece}-v{band + 1}', 'roundRobinIndex': rr,
            }
            if gain:
                region['gainDb'] = gain
            if choke:
                region['chokeGroup'] = choke
            regions.append(region)
    commit = git('rev-parse', 'HEAD').strip()
    manifest = {
        'schemaVersion': 1, 'id': 'acoustic-kit', 'name': 'Acoustic Kit', 'family': 'drums', 'version': 1, 'engine': 'sampler',
        'defaultArticulation': 'hit', 'maxPolyphony': 24, 'pitchShiftLimitSemitones': 0, 'preloadStrategy': 'all',
        'envelope': {'mode': 'one-shot', 'attackMs': 0, 'releaseMs': 30},
        'provenance': {
            'source': 'Big Rusty Drums by Karoryfer Samples',
            'url': f'https://github.com/sfzinstruments/karoryfer.big-rusty-drums/tree/{commit}',
            'creator': 'Karoryfer Samples (D. Mateusz Jaworski)', 'licence': 'CC0-1.0', 'obtained': '2026-10-30',
            'redistribution': True, 'modification': True,
            'processing': 'Subset: 3 velocity layers x 2 round robins per piece; close and overhead mics mixed to mono; '
                          'resampled to 44.1 kHz; silence trimmed; per-piece peak normalised to -1 dBFS; 16-bit WAV. '
                          'Built with scripts/build-acoustic-kit.py.',
        },
        'regions': regions,
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (OUT / 'LICENCE.txt').write_text(
        'Big Rusty Drums by Karoryfer Samples, CC0 1.0 Universal (public domain dedication).\n'
        f'Source: https://github.com/sfzinstruments/karoryfer.big-rusty-drums (commit {commit}).\n'
        'This folder holds a processed subset; see processing notes in manifest.json.\n')
    total = sum(p.stat().st_size for p in OUT.glob('*.wav'))
    print(f'{len(regions)} regions, {total / 2**20:.2f} MB')


if __name__ == '__main__':
    main()
