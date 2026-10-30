#!/bin/sh
# Rebuild the bundled SFZ-based instruments (dev only; needs git, ffmpeg and numpy). Each source is CC0.
#
#   NYLON  extracted SpanishClassicalGuitar-SFZFLAC-20190618.7z (FreePats: freepats.zenvoid.org/Guitar/acoustic-guitar.html)
#   EMILY  git clone https://github.com/sfzinstruments/karoryfer.emilyguitar
#   BASS   git clone https://github.com/sfzinstruments/karoryfer.black-and-blue-basses
#   VCSL   git clone https://github.com/sgossner/VCSL, then (SFZ files live on the sfz branch):
#          git -C VCSL checkout origin/sfz -- "Chordophones/Zithers/Grand Piano, Steinway B.sfz"
#   VSCO   git clone https://github.com/sgossner/VSCO-2-CE, then (SFZ files live on the SFZ branch):
#          git -C VSCO checkout origin/SFZ -- CelloEnsSusVib.sfz ViolaEnsSusVib.sfz ViolinEnsSusVib.sfz
#
# Usage: scripts/build-instruments.sh NYLON EMILY BASS VCSL VSCO   (pass "-" to skip one)
set -e
NYLON=$1; EMILY=$2; BASS=$3; VCSL=$4; VSCO=$5
IMPORT="python3 -I $(dirname "$0")/sfz-import.py"
commit() { git -C "$1" rev-parse HEAD 2>/dev/null || cat "$1/.commit"; }

if [ "$NYLON" != "-" ]; then
  $IMPORT "$NYLON/SpanishClassicalGuitar-20190618.sfz" --id nylon-guitar --name "Nylon Guitar" \
    --family guitar --creator "roberto@zenvoid.org (FreePats project)" --licence CC0-1.0 \
    --source "Spanish Classical Guitar (FreePats, version 2019-06-18)" --url http://freepats.zenvoid.org/Guitar/acoustic-guitar.html \
    --rate 32000 --seconds 2.5 --fade-ms 400 --keys 36-88 --release-ms 400 --pitch-limit 2 --gain-db -4
fi
if [ "$EMILY" != "-" ]; then
  $IMPORT "$EMILY/emily_clean.sfz" --id clean-guitar --name "Clean Guitar" \
    --family guitar --creator "Karoryfer Samples (D. Smolken)" --licence CC0-1.0 \
    --source "Emily Guitar by Karoryfer Samples" --url https://github.com/sfzinstruments/karoryfer.emilyguitar \
    --commit "$(commit "$EMILY")" --layers 2,4 --round-robins 2 --rate 22050 --seconds 2.0 \
    --keys 40-88 --release-ms 250 --gain-db 2
fi
if [ "$BASS" != "-" ]; then
  # Mapped at written pitch (an octave above sounding), hence --transpose -12.
  $IMPORT "$BASS/Programs/05-darkblack_pluck.sfz" --transpose -12 --id electric-bass --name "Electric Bass" \
    --family bass --creator "Karoryfer Samples" --licence CC0-1.0 \
    --source "Black And Blue Basses by Karoryfer Samples (Dark Black, finger plucks)" \
    --url https://github.com/sfzinstruments/karoryfer.black-and-blue-basses --commit "$(commit "$BASS")" \
    --layers 3,4 --round-robins 2 --rate 22050 --seconds 1.4 --fade-ms 300 --keys 23-52 --release-ms 120 \
    --pitch-limit 5 --polyphony 8 --gain-db -2
fi
if [ "$VCSL" != "-" ]; then
  $IMPORT "$VCSL/Chordophones/Zithers/Grand Piano, Steinway B.sfz" --require "/NoSus/" --id grand-piano --name "Grand Piano" \
    --family piano --creator "Versilian Studios (VCSL)" --licence CC0-1.0 \
    --source "Versilian Community Sample Library: Grand Piano, Steinway B" --url https://github.com/sgossner/VCSL \
    --commit "$(commit "$VCSL")" --layers first,last --rate 22050 --seconds 2.6 --fade-ms 500 --keys 36-96 \
    --release-ms 300 --pitch-limit 2 --polyphony 32 --gain-db -2
fi
if [ "$VSCO" != "-" ]; then
  $IMPORT "$VSCO/CelloEnsSusVib.sfz@36-53" "$VSCO/ViolaEnsSusVib.sfz@55-62" "$VSCO/ViolinEnsSusVib.sfz@66-86" \
    --id strings --name "Strings" --family strings --creator "Versilian Studios (Sam Gossner, Simon Dalzell)" \
    --licence CC0-1.0 --source "VS Chamber Orchestra 2: Community Edition (cello, viola and violin sections, sustain with vibrato)" \
    --url https://github.com/sgossner/VSCO-2-CE --commit "$(commit "$VSCO")" --layers first,last --rate 22050 \
    --loop 1.2-3.2 --crossfade-ms 300 --release-ms 350 --pitch-limit 3 --polyphony 24 --gain-db 1
fi
