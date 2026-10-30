#!/bin/sh
# Rebuild the bundled guitars (dev only; needs git, ffmpeg, numpy and py7zr or 7z).
#   NYLON: folder of SpanishClassicalGuitar-SFZFLAC-20190618.7z (FreePats, CC0), extracted
#   EMILY: clone of https://github.com/sfzinstruments/karoryfer.emilyguitar (CC0)
# Usage: scripts/build-guitars.sh NYLON EMILY
set -e
NYLON=$1
EMILY=$2
HERE=$(dirname "$0")
python3 -I "$HERE/sfz-import.py" "$NYLON/SpanishClassicalGuitar-20190618.sfz" --id nylon-guitar --name "Nylon Guitar" \
  --family guitar --creator "roberto@zenvoid.org (FreePats project)" --licence CC0-1.0 \
  --source "Spanish Classical Guitar (FreePats, version 2019-06-18)" --url http://freepats.zenvoid.org/Guitar/acoustic-guitar.html \
  --rate 32000 --seconds 2.5 --fade-ms 400 --keys 36-88 --release-ms 400 --pitch-limit 2 --gain-db -4
python3 -I "$HERE/sfz-import.py" "$EMILY/emily_clean.sfz" --id clean-guitar --name "Clean Guitar" \
  --family guitar --creator "Karoryfer Samples (D. Smolken)" --licence CC0-1.0 \
  --source "Emily Guitar by Karoryfer Samples" --url https://github.com/sfzinstruments/karoryfer.emilyguitar \
  --commit "$(git -C "$EMILY" rev-parse HEAD)" --layers 2,4 --round-robins 2 --rate 22050 --seconds 2.0 \
  --keys 40-88 --release-ms 250 --gain-db 2
