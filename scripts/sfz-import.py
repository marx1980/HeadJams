#!/usr/bin/env python3
"""Import an SFZ instrument into a bundled MusicMaker instrument (manifest.json + mono 16-bit WAV).

Dev only; needs ffmpeg and numpy. Generic: reads <control>/<global>/<master>/<group>/<region>
opcodes (sample, key, lokey, hikey, pitch_keycenter, lovel, hivel, lorand, hirand, seq_position,
tune, volume, trigger) and keeps a budget-friendly subset.

Example (Karoryfer Emily, CC0):
  git clone --depth 1 https://github.com/sfzinstruments/karoryfer.emilyguitar SRC
  python3 scripts/sfz-import.py SRC/emily_clean.sfz --id clean-guitar --name "Clean Guitar" \\
    --family guitar --creator "Karoryfer Samples (D. Smolken)" --licence CC0-1.0 \\
    --source "Emily Guitar by Karoryfer Samples" --url https://github.com/sfzinstruments/karoryfer.emilyguitar \\
    --commit "$(git -C SRC rev-parse HEAD)" --layers 2,4 --round-robins 2 --rate 22050 --seconds 2.0 \\
    --keys 40-90 --release-ms 250

Velocity layers are counted from soft (1) to loud; the kept layers are widened to cover 1-127.
One gain is applied to every file so the loudest peak is -1 dBFS, keeping the dynamics between layers.
"""
import argparse, datetime, json, re, subprocess, sys, wave
from pathlib import Path
import numpy as np

NOTE_NAMES = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}


def note_number(value):
    """SFZ keys may be numbers or names like c4, f#3, db2 (c4 = 60)."""
    value = value.strip().lower()
    if re.fullmatch(r'-?\d+', value):
        return int(value)
    match = re.fullmatch(r'([a-g])([#b]?)(-?\d+)', value)
    if not match:
        raise ValueError(f'bad key {value!r}')
    letter, accidental, octave = match.groups()
    return NOTE_NAMES[letter] + {'#': 1, 'b': -1, '': 0}[accidental] + (int(octave) + 1) * 12


def parse_sfz(path, defines=None):
    """Return a list of regions as dicts with every inherited opcode resolved (#include and #define supported)."""
    defines = {} if defines is None else defines
    text = re.sub(r'//[^\n]*', '', path.read_text(errors='replace'))
    for _ in range(4):  # includes may include further files (MTG Solo Sax)
        if '#include' not in text:
            break
        text = re.sub(r'#include\s+"([^"]+)"', lambda m: re.sub(r'//[^\n]*', '', (path.parent / m.group(1)).read_text(errors='replace')), text)
    for name, value in re.findall(r'#define\s+(\$\w+)\s+(\S+)', text):
        defines[name] = value
    text = re.sub(r'#define[^\n]*', '', text)
    for name, value in sorted(defines.items(), key=lambda item: -len(item[0])):
        text = text.replace(name, value)
    order = ['control', 'global', 'master', 'group']
    levels = {level: {} for level in order}
    regions, target = [], None
    for token in re.split(r'(<\w+>)', text):
        header = re.fullmatch(r'<(\w+)>', token.strip())
        if header:
            name = header.group(1)
            if name == 'region':
                target = {}
                for level in order:
                    target.update(levels[level])
                regions.append(target)
            elif name in levels:
                for level in order[order.index(name):]:
                    levels[level] = {}
                target = levels[name]
            else:
                target = {}  # <curve>, <effect> and other sections are ignored
            continue
        if target is None:
            continue
        # key=value pairs; a sample path may contain spaces, so it runs to the next opcode or line end.
        for match in re.finditer(r'(\w+)=(.*?)(?=\s+\w+=|\n|$)', token):
            target[match.group(1)] = match.group(2).strip()
    default_path = levels['control'].get('default_path', '')
    for region in regions:
        region.setdefault('default_path', default_path)
    return regions


def describe(region):
    key = region.get('key')
    low = note_number(region.get('lokey', key or '0'))
    high = note_number(region.get('hikey', key or '127'))
    root = note_number(region.get('pitch_keycenter', key or str(low)))
    return {
        'sample': (region['default_path'] + region['sample']).replace('\\', '/'),
        'low': low, 'high': high, 'root': root,
        'lovel': int(region.get('lovel', 1)), 'hivel': int(region.get('hivel', 127)),
        'rr': float(region.get('lorand', region.get('seq_position', 0))),
        'tune': float(region.get('tune', 0)), 'volume': float(region.get('volume', 0)),
    }


def decode(path, rate, seconds):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(rate),
                          '-t', str(seconds), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype='<f4').copy()


def write_wav(path, audio, rate):
    pcm = np.clip(np.round(audio * 32767), -32768, 32767).astype('<i2')
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(pcm.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sfz', nargs='+', help='one or more SFZ files, each optionally limited to roots: file.sfz@LOW-HIGH')
    for name in ('id', 'name', 'family', 'creator', 'licence', 'source', 'url', 'commit'):
        ap.add_argument('--' + name, required=name != 'commit')
    ap.add_argument('--layers', help='velocity layers to keep, soft to loud: 1-based numbers or first/last (default: all)')
    ap.add_argument('--round-robins', type=int, default=99)
    ap.add_argument('--rate', type=int, default=44100)
    ap.add_argument('--seconds', type=float, default=3.0)
    ap.add_argument('--fade-ms', type=float, default=300)
    ap.add_argument('--keys', default='0-127', help='only regions whose root is in this MIDI range')
    ap.add_argument('--release-ms', type=float, default=200)
    ap.add_argument('--pitch-limit', type=int, default=3)
    ap.add_argument('--polyphony', type=int, default=24)
    ap.add_argument('--gain-db', type=float, default=0)
    ap.add_argument('--articulation', default='sustain')
    ap.add_argument('--transpose', type=int, default=0,
                    help='semitones added to the SFZ keys when samples are mapped at written pitch (bass: -12)')
    ap.add_argument('--require', help='only samples whose path matches this regex')
    ap.add_argument('--exclude', help='skip samples whose path matches this regex')
    ap.add_argument('--loop', help='loop START-END seconds (with a baked crossfade); the file ends at END')
    ap.add_argument('--crossfade-ms', type=float, default=250)
    ap.add_argument('--tags', help='comma-separated description words (warm, bright, dark, soft, punchy, acoustic, electronic, smooth, plucky, sustained)')
    ap.add_argument('--level-zones', action='store_true', help='even out loudness across key zones (keeps layer balance)')
    ap.add_argument('--out', type=Path)
    args = ap.parse_args()

    out = args.out or Path(__file__).resolve().parent.parent / 'app/public/instruments' / args.id
    key_low, key_high = (int(v) for v in args.keys.split('-'))
    regions, seen = [], set()
    for spec in args.sfz:
        path, _, roots = spec.partition('@')
        path = Path(path)
        low, high = (int(v) for v in roots.split('-')) if roots else (0, 127)
        for raw in parse_sfz(path):
            if 'sample' not in raw or raw.get('trigger', 'attack') != 'attack' or any(k.startswith('sw_') for k in raw):
                continue
            region = describe(raw)
            for key in ('low', 'high', 'root'):
                region[key] += args.transpose
            region['path'] = path.parent / region['sample']
            if args.require and not re.search(args.require, region['sample']):
                continue
            if args.exclude and re.search(args.exclude, region['sample']):
                continue
            # Programs often list the same region twice (for example poly and mono modes).
            identity = (str(region['path']), region['lovel'], region['hivel'])
            if identity in seen or not (low <= region['root'] <= high and key_low <= region['root'] <= key_high):
                continue
            seen.add(identity)
            regions.append(region)
    if not regions:
        sys.exit('no regions matched')

    # Group by key zone, then by velocity layer, then round robin order.
    zones = {}
    for region in regions:
        zones.setdefault((region['low'], region['high'], region['root']), {}).setdefault(
            (region['lovel'], region['hivel']), []).append(region)
    keep = args.layers.split(',') if args.layers else None

    # Zones from different SFZ files can overlap at a split point: share the keys between the two roots.
    keyed = sorted(zones.items(), key=lambda item: item[0][2])
    bounds = [[low, high] for (low, high, _), _ in keyed]
    for i in range(len(keyed) - 1):
        root, next_root = keyed[i][0][2], keyed[i + 1][0][2]
        if bounds[i][1] >= bounds[i + 1][0] and root != next_root:
            split = (root + next_root) // 2
            bounds[i][1], bounds[i + 1][0] = split, split + 1

    picked = []
    for ((_, _, root), layers), (low, high) in zip(keyed, bounds):
        ordered = sorted(layers.items())
        index_of = lambda token: 1 if token == 'first' else len(ordered) if token == 'last' else int(token)
        chosen = ([ordered[i - 1] for i in dict.fromkeys(index_of(t) for t in keep) if i <= len(ordered)]
                  if keep else ordered)
        for index, ((lovel, hivel), alternatives) in enumerate(chosen):
            velocity_low = 1 if index == 0 else chosen[index - 1][0][1] + 1
            velocity_high = 127 if index == len(chosen) - 1 else hivel
            for rr, region in enumerate(sorted(alternatives, key=lambda r: r['rr'])[:args.round_robins]):
                picked.append((dict(region, low=low, high=high), velocity_low, velocity_high, index + 1, rr))

    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('*.wav'):
        old.unlink()
    fade = int(args.fade_ms / 1000 * args.rate)
    loop = tuple(float(v) for v in args.loop.split('-')) if args.loop else None
    seconds = loop[1] if loop else args.seconds
    audio = {}
    for region, *_ in picked:
        data = decode(region['path'], args.rate, seconds)
        if loop:
            start, end = (int(round(v * args.rate)) for v in loop)
            if len(data) < end:
                sys.exit(f"{region['sample']} is shorter than the loop end")
            # Crossfade the end of the loop into the audio just before its start, so the jump is seamless.
            xf = min(int(args.crossfade_ms / 1000 * args.rate), start)
            t = np.linspace(0, np.pi / 2, xf, dtype=np.float32)
            data[end - xf:end] = data[end - xf:end] * np.cos(t) + data[start - xf:start] * np.sin(t)
        elif len(data) > fade and len(data) >= int(args.seconds * args.rate) - 1:
            data[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32) ** 2
        audio[region['sample']] = data * 10 ** (region['volume'] / 20)
    if args.level_zones:
        # Even out loudness across the range: each zone's loudest layer is brought to the median zone level
        # (at most ±12 dB); the layers within a zone keep their balance.
        def rms(data):
            head = data[: int(1.5 * args.rate)]
            return float(np.sqrt(np.mean(head ** 2))) or 1e-9
        loudest = {}
        for region, _low, _high, layer, _rr in picked:
            key = region['root']
            level = rms(audio[region['sample']])
            if layer >= loudest.get(key, (0, 0))[0]:
                loudest[key] = (layer, level)
        target = float(np.median([level for _, level in loudest.values()]))
        zone_gain = {key: float(np.clip(target / level, 10 ** (-12 / 20), 10 ** (12 / 20))) for key, (_, level) in loudest.items()}
        for region, *_ in picked:
            audio[region['sample']] = audio[region['sample']] * zone_gain[region['root']]
    peak = max(float(np.max(np.abs(a))) for a in audio.values()) or 1.0
    gain = 10 ** (-1 / 20) / peak

    manifest_regions = []
    for region, velocity_low, velocity_high, layer, rr in picked:
        rid = f"n{region['root']}-v{layer}-rr{rr + 1}"
        write_wav(out / f'{rid}.wav', audio[region['sample']] * gain, args.rate)
        entry = {
            'id': rid, 'file': f'{rid}.wav', 'rootMidi': region['root'], 'lowMidi': region['low'],
            'highMidi': region['high'], 'velocityLow': velocity_low, 'velocityHigh': velocity_high,
            'articulation': args.articulation, 'roundRobinGroup': f"n{region['root']}-v{layer}", 'roundRobinIndex': rr,
        }
        if region['tune']:
            entry['tuneCents'] = region['tune']
        if loop:
            entry['loopStartMs'] = round(loop[0] * 1000)
            entry['loopEndMs'] = round(loop[1] * 1000)
        manifest_regions.append(entry)

    url = f"{args.url}/tree/{args.commit}" if args.commit else args.url
    layers_text = f"velocity layers {args.layers}" if args.layers else 'all velocity layers'
    manifest = {
        'schemaVersion': 1, 'id': args.id, 'name': args.name, 'family': args.family, 'version': 1,
        'engine': 'sampler', 'defaultArticulation': args.articulation, 'maxPolyphony': args.polyphony,
        'pitchShiftLimitSemitones': args.pitch_limit, 'preloadStrategy': 'range',
        **({'gainDb': int(args.gain_db) if args.gain_db.is_integer() else args.gain_db} if args.gain_db else {}),
        **({'tags': [tag.strip() for tag in args.tags.split(',') if tag.strip()]} if args.tags else {}),
        'envelope': {'mode': 'sustain', 'attackMs': 1, 'releaseMs': args.release_ms},
        'provenance': {
            'source': args.source, 'url': url, 'creator': args.creator, 'licence': args.licence,
            'obtained': datetime.date.today().isoformat(), 'redistribution': True, 'modification': True,
            'processing': (f"Imported from {', '.join(Path(spec).name for spec in args.sfz)} with scripts/sfz-import.py: "
                           f"{layers_text}, up to {args.round_robins} round robins, MIDI roots {args.keys}"
                           + (f" (keys transposed {args.transpose:+d} to sounding pitch)" if args.transpose else "")
                           + f"; mono, {args.rate} Hz, "
                           + (f"looped {loop[0]:g}-{loop[1]:g} s with a {args.crossfade_ms:g} ms crossfade" if loop else
                              f"cut to {args.seconds:g} s with a {args.fade_ms:g} ms fade")
                           + ("; zone levels evened out (±12 dB max)" if args.level_zones else "")
                           + "; one gain for all files (peak -1 dBFS); 16-bit WAV."),
        },
        'regions': manifest_regions,
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    size = sum(f.stat().st_size for f in out.glob('*.wav'))
    print(f'{len(manifest_regions)} regions, {size / 1e6:.2f} MB -> {out}')


if __name__ == '__main__':
    main()
