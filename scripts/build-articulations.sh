#!/bin/sh
# Rebuild the extra articulations on the bundled instruments (dev only; needs git, ffmpeg, numpy):
# staccato/spiccato (VSCO-2-CE, Bear Sax) and sax breath and key noise (MTG Solo Saxophones, Bear Sax).
#
#   VSCO  clone of https://github.com/sgossner/VSCO-2-CE with these SFZ files checked out from the SFZ branch:
#         FluteStac PiccoloStac ClarinetStac OboeStac BassoonStac TromboneStac TrumpetStac FHornStac TubaStac
#         CelloEnsSpic ViolaEnsSpic ViolinEnsSpic ContrabassSpic (.sfz)
#   BEAR  clone of https://github.com/sfzinstruments/karoryfer.bear-sax
#   MTG   clone of https://github.com/sfzinstruments/MTG.SoloSax (CC BY 4.0)
#
# Usage: scripts/build-articulations.sh VSCO BEAR MTG   (run after build-instruments.sh, which resets the instruments)
set -e
V=$1; B=$2; M="$3/MTG Solo Saxophones/Samples"; T=$(mktemp -d)
HERE=$(dirname "$0")
imp() { id=$1; shift; python3 -I "$HERE/sfz-import.py" "$@" --id "$id" --name x --family brass --creator x --licence CC0-1.0 --source x \
  --url x --articulation staccato --round-robins 1 --rate 22050 --seconds 0.8 --fade-ms 200 --release-ms 150 --pitch-limit 3 --out "$T/$id"; }
add() { python3 -I "$HERE/add-articulation.py" "$1" --from-dir "$T/$1" --articulation staccato --note "$2"; }
imp flute "$V/FluteStac.sfz" --layers first,last --level-zones && add flute FluteStac.sfz
imp piccolo "$V/PiccoloStac.sfz" --layers first,last --level-zones && add piccolo PiccoloStac.sfz
imp clarinet "$V/ClarinetStac.sfz" --layers first,last --level-zones && add clarinet ClarinetStac.sfz
imp oboe "$V/OboeStac.sfz" --layers first,last --level-zones && add oboe OboeStac.sfz
imp bassoon "$V/BassoonStac.sfz" --layers first,last --level-zones && add bassoon BassoonStac.sfz
imp brass "$V/TromboneStac.sfz@34-53" "$V/TrumpetStac.sfz@57-84" --layers first,last --level-zones && add brass "TromboneStac.sfz, TrumpetStac.sfz"
imp french-horn "$V/FHornStac.sfz" --layers first,last --level-zones && add french-horn FHornStac.sfz
imp tuba "$V/TubaStac.sfz" --layers first,last --level-zones && add tuba TubaStac.sfz
imp strings "$V/CelloEnsSpic.sfz@36-53" "$V/ViolaEnsSpic.sfz@55-62" "$V/ViolinEnsSpic.sfz@66-86" --layers first,last --level-zones \
  && add strings "CelloEnsSpic.sfz, ViolaEnsSpic.sfz, ViolinEnsSpic.sfz (spiccato)"
imp viola "$V/ViolaEnsSpic.sfz" --layers first,last --level-zones && add viola "ViolaEnsSpic.sfz (spiccato)"
imp contrabass "$V/ContrabassSpic.sfz" --layers first,last --level-zones && add contrabass "ContrabassSpic.sfz (spiccato)"
# Bear Sax: the staccato map without its keyswitch lines, next to the other programs so ../Samples resolves.
grep -v 'sw_' "$B/Programs/poly/staccato_map.sfz" > "$B/Programs/bear_staccato.sfz"
imp baritone-sax "$B/Programs/bear_staccato.sfz" --layers last --level-zones && add baritone-sax "Bear Sax staccato_map.sfz, loudest layer"
# The lowest Bear Sax zone maps key 36 to a D1 root; keep it on its root (the validator rejects low > high).
python3 - <<'PY'
import json
p = 'app/public/instruments/baritone-sax/manifest.json'
m = json.load(open(p))
for r in m['regions']:
    if r['lowMidi'] > r['highMidi']:
        r['lowMidi'] = r['highMidi'] = r['rootMidi']
open(p, 'w').write(json.dumps(m, indent=2) + '\n')
PY

# Sax breath and key noise: MTG recordings 0.35–0.9 s (breath) and 0.15–0.4 s (keys), the first six of each.
pick() { for f in "$M"/$1_*.flac; do d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f");
  python3 -c "import sys; sys.exit(0 if $2 <= $d <= $3 else 1)" && echo "$f"; done | head -6; }
for pair in tenor-sax:ten soprano-sax:sop alto-sax:alt; do id=${pair%%:*}; k=${pair##*:}
  python3 -I "$HERE/add-articulation.py" "$id" --files $(pick ${k}_b 0.35 0.9) --articulation breath --seconds 0.6 --fade-ms 120 \
    --level-window 0.6 --level-db -14 --note "MTG Solo Saxophones breath noises, CC BY 4.0"
  python3 -I "$HERE/add-articulation.py" "$id" --files $(pick ${k}_k 0.15 0.4) --articulation keys --seconds 0.2 --fade-ms 60 \
    --level-window 0.1 --level-db -18 --note "MTG Solo Saxophones key noises, CC BY 4.0"
done
# Baritone: slices of Bear Sax's own breath recording and key noises (CC0).
for i in 0 1 2 3 4; do ffmpeg -v error -y -ss "$(python3 -c "print(0.4 + $i * 0.9)")" -i "$B/Samples/noise_breath.wav" -t 0.6 "$T/breath$i.wav"; done
python3 -I "$HERE/add-articulation.py" baritone-sax --files "$T"/breath*.wav --articulation breath --seconds 0.6 --fade-ms 150 \
  --level-window 0.6 --level-db -14 --note "Bear Sax noise_breath.wav slices"
python3 -I "$HERE/add-articulation.py" baritone-sax --files "$B/Samples/c2_close_rr1.wav" "$B/Samples/c2_open_rr2.wav" "$B/Samples/g2_open_rr1.wav" \
  --articulation keys --seconds 0.2 --fade-ms 60 --level-window 0.1 --level-db -18 --note "Bear Sax key noises"
rm -rf "$T"
