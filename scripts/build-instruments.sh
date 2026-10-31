#!/bin/sh
# Rebuild the bundled SFZ-based instruments (dev only; needs git, ffmpeg and numpy). Each source is CC0.
#
#   NYLON  extracted SpanishClassicalGuitar-SFZFLAC-20190618.7z (FreePats: freepats.zenvoid.org/Guitar/acoustic-guitar.html)
#   EMILY  git clone https://github.com/sfzinstruments/karoryfer.emilyguitar
#   BASS   git clone https://github.com/sfzinstruments/karoryfer.black-and-blue-basses
#   VCSL   git clone https://github.com/sgossner/VCSL, then (SFZ files live on the sfz branch):
#          git -C VCSL checkout origin/sfz -- "Chordophones/Zithers/Grand Piano, Steinway B.sfz" "Electrophones/TX81Z - FM Piano.sfz"
#   VSCO   git clone https://github.com/sgossner/VSCO-2-CE, then (SFZ files live on the SFZ branch):
#          git -C VSCO checkout origin/SFZ -- CelloEnsSusVib.sfz ViolaEnsSusVib.sfz ViolinEnsSusVib.sfz TromboneSus.sfz TrumpetSus.sfz
#          Harp.sfz FluteSusVib.sfz ClarinetSus.sfz FHornSus.sfz Marimba.sfz Glockenspiel.sfz OrganQuiet.sfz CelloEnsPizz.sfz
#
# Usage: scripts/build-instruments.sh NYLON EMILY BASS VCSL VSCO   (pass "-" to skip one)
set -e
NYLON=$1; EMILY=$2; BASS=$3; VCSL=$4; VSCO=$5
IMPORT="python3 -I $(dirname "$0")/sfz-import.py"
commit() { git -C "$1" rev-parse HEAD 2>/dev/null || cat "$1/.commit"; }

if [ "$NYLON" != "-" ]; then
  $IMPORT "$NYLON/SpanishClassicalGuitar-20190618.sfz" --id nylon-guitar --tags acoustic,warm,soft,plucky --name "Nylon Guitar" \
    --family guitar --creator "roberto@zenvoid.org (FreePats project)" --licence CC0-1.0 \
    --source "Spanish Classical Guitar (FreePats, version 2019-06-18)" --url http://freepats.zenvoid.org/Guitar/acoustic-guitar.html \
    --rate 32000 --seconds 2.5 --fade-ms 400 --keys 36-88 --release-ms 400 --pitch-limit 2 --gain-db -4
fi
if [ "$EMILY" != "-" ]; then
  $IMPORT "$EMILY/emily_clean.sfz" --id clean-guitar --tags bright,plucky,smooth --name "Clean Guitar" \
    --family guitar --creator "Karoryfer Samples (D. Smolken)" --licence CC0-1.0 \
    --source "Emily Guitar by Karoryfer Samples" --url https://github.com/sfzinstruments/karoryfer.emilyguitar \
    --commit "$(commit "$EMILY")" --layers 2,4 --round-robins 2 --rate 22050 --seconds 2.0 \
    --keys 40-88 --release-ms 250 --gain-db 2
fi
if [ "$BASS" != "-" ]; then
  # Mapped at written pitch (an octave above sounding), hence --transpose -12.
  $IMPORT "$BASS/Programs/05-darkblack_pluck.sfz" --transpose -12 --id electric-bass --tags warm,punchy,plucky,acoustic --name "Electric Bass" \
    --family bass --creator "Karoryfer Samples" --licence CC0-1.0 \
    --source "Black And Blue Basses by Karoryfer Samples (Dark Black, finger plucks)" \
    --url https://github.com/sfzinstruments/karoryfer.black-and-blue-basses --commit "$(commit "$BASS")" \
    --layers 3,4 --round-robins 2 --rate 22050 --seconds 1.4 --fade-ms 300 --keys 23-52 --release-ms 120 \
    --pitch-limit 5 --polyphony 8 --gain-db -2
fi
if [ "$VCSL" != "-" ]; then
  $IMPORT "$VCSL/Chordophones/Zithers/Grand Piano, Steinway B.sfz" --require "/NoSus/" --id grand-piano --tags acoustic,warm,bright,plucky --name "Grand Piano" \
    --family piano --creator "Versilian Studios (VCSL)" --licence CC0-1.0 \
    --source "Versilian Community Sample Library: Grand Piano, Steinway B" --url https://github.com/sgossner/VCSL \
    --commit "$(commit "$VCSL")" --layers first,last --rate 22050 --seconds 2.6 --fade-ms 500 --keys 36-96 \
    --release-ms 300 --pitch-limit 2 --polyphony 32 --gain-db -2
fi
if [ "$VSCO" != "-" ]; then
  $IMPORT "$VSCO/CelloEnsSusVib.sfz@36-53" "$VSCO/ViolaEnsSusVib.sfz@55-62" "$VSCO/ViolinEnsSusVib.sfz@66-86" \
    --id strings --tags acoustic,warm,smooth,sustained,soft --name "Strings" --family strings --creator "Versilian Studios (Sam Gossner, Simon Dalzell)" \
    --licence CC0-1.0 --source "VS Chamber Orchestra 2: Community Edition (cello, viola and violin sections, sustain with vibrato)" \
    --url https://github.com/sgossner/VSCO-2-CE --commit "$(commit "$VSCO")" --layers first,last --rate 22050 \
    --loop 1.2-3.2 --crossfade-ms 300 --release-ms 350 --pitch-limit 3 --polyphony 24 --gain-db 1
fi
if [ "$VCSL" != "-" ]; then
  $IMPORT "$VCSL/Electrophones/TX81Z - FM Piano.sfz" --id electric-piano --tags electronic,warm,soft,smooth,plucky --name "Electric Piano" \
    --family keys --creator "Versilian Studios (VCSL)" --licence CC0-1.0 \
    --source "Versilian Community Sample Library: Yamaha TX81Z FM Piano" --url https://github.com/sgossner/VCSL \
    --commit "$(commit "$VCSL")" --layers first,last --rate 22050 --seconds 2.5 --fade-ms 500 --keys 36-96 \
    --release-ms 250 --pitch-limit 2 --polyphony 32 --gain-db -2
fi
if [ "$VSCO" != "-" ]; then
  $IMPORT "$VSCO/TromboneSus.sfz@34-53" "$VSCO/TrumpetSus.sfz@57-84" \
    --id brass --tags acoustic,bright,punchy,sustained --name "Brass" --family brass --creator "Versilian Studios (Sam Gossner, Simon Dalzell)" \
    --licence CC0-1.0 --source "VS Chamber Orchestra 2: Community Edition (tenor trombone and trumpet, sustain)" \
    --url https://github.com/sgossner/VSCO-2-CE --commit "$(commit "$VSCO")" --layers first,last --rate 22050 \
    --loop 1.0-3.0 --crossfade-ms 300 --release-ms 250 --pitch-limit 3 --polyphony 24 --level-zones --gain-db 0
fi
if [ "$VSCO" != "-" ]; then
  CR="Versilian Studios (Sam Gossner, Simon Dalzell)"; URL=https://github.com/sgossner/VSCO-2-CE
  vsco() { # file id name family tags source extra...
    f=$1; id=$2; name=$3; fam=$4; tags=$5; src=$6; shift 6
    $IMPORT "$VSCO/$f" --id "$id" --tags "$tags" --name "$name" --family "$fam" --creator "$CR" --licence CC0-1.0 \
      --source "VS Chamber Orchestra 2: Community Edition ($src)" --url $URL --commit "$(commit "$VSCO")" --layers first,last --rate 22050 "$@"
  }
  vsco Harp.sfz harp Harp strings acoustic,warm,soft,plucky harp --seconds 3.0 --fade-ms 500 --release-ms 400 --pitch-limit 3 --polyphony 24
  vsco FluteSusVib.sfz flute Flute brass acoustic,soft,smooth,sustained "flute, sustain with vibrato" --loop 1.0-2.5 --crossfade-ms 300 --release-ms 250 --pitch-limit 3 --polyphony 16 --level-zones
  vsco ClarinetSus.sfz clarinet Clarinet brass acoustic,warm,smooth,sustained "clarinet, sustain" --round-robins 1 --loop 1.0-2.5 --crossfade-ms 300 --release-ms 250 --pitch-limit 3 --polyphony 16 --level-zones
  vsco FHornSus.sfz french-horn "French Horn" brass acoustic,warm,soft,sustained "French horn, sustain" --round-robins 1 --loop 1.0-3.0 --crossfade-ms 300 --release-ms 300 --pitch-limit 3 --polyphony 16 --level-zones
  vsco Marimba.sfz marimba Marimba keys acoustic,warm,plucky,punchy marimba --round-robins 1 --seconds 2.0 --fade-ms 400 --release-ms 200 --pitch-limit 3 --polyphony 24
  vsco Glockenspiel.sfz glockenspiel Glockenspiel keys acoustic,bright,plucky glockenspiel --round-robins 1 --seconds 2.0 --fade-ms 500 --release-ms 400 --pitch-limit 3 --polyphony 24
  vsco OrganQuiet.sfz church-organ "Church Organ" keys acoustic,warm,soft,sustained "organ, quiet" --round-robins 1 --loop 1.0-3.0 --crossfade-ms 300 --release-ms 300 --pitch-limit 3 --polyphony 24 --level-zones
  vsco CelloEnsPizz.sfz pizzicato-strings "Pizzicato Strings" strings acoustic,punchy,plucky "cello section, pizzicato" --round-robins 1 --seconds 1.5 --fade-ms 300 --release-ms 150 --pitch-limit 3 --polyphony 24
fi
if [ "$VSCO" != "-" ]; then
  # More VSCO-2-CE instruments (extra SFZ files: BassoonSus OboeSusVib PiccoloSus TubaSus ContrabassSusVB ViolaEnsSusVib Timpani Xylophone TubularBells).
  vsco BassoonSus.sfz bassoon Bassoon brass acoustic,warm,soft,sustained "bassoon, sustain" --round-robins 1 --loop 1.0-2.5 --crossfade-ms 300 --release-ms 250 --pitch-limit 3 --polyphony 16 --level-zones
  vsco OboeSusVib.sfz oboe Oboe brass acoustic,bright,smooth,sustained "oboe, sustain with vibrato" --round-robins 1 --loop 1.0-2.5 --crossfade-ms 300 --release-ms 250 --pitch-limit 3 --polyphony 16 --level-zones
  vsco PiccoloSus.sfz piccolo Piccolo brass acoustic,bright,soft,sustained "piccolo, sustain" --round-robins 1 --loop 1.0-2.5 --crossfade-ms 300 --release-ms 250 --pitch-limit 3 --polyphony 16 --level-zones
  vsco TubaSus.sfz tuba Tuba brass acoustic,warm,punchy,sustained "tuba, sustain" --round-robins 1 --loop 1.0-3.0 --crossfade-ms 300 --release-ms 250 --pitch-limit 3 --polyphony 16 --level-zones
  vsco ContrabassSusVB.sfz contrabass Contrabass strings acoustic,warm,dark,sustained "contrabass, sustain with vibrato" --round-robins 1 --loop 1.0-3.0 --crossfade-ms 300 --release-ms 300 --pitch-limit 3 --polyphony 16 --level-zones
  vsco ViolaEnsSusVib.sfz viola Viola strings acoustic,warm,smooth,sustained "viola, sustain with vibrato" --round-robins 1 --loop 1.0-3.0 --crossfade-ms 300 --release-ms 300 --pitch-limit 3 --polyphony 16 --level-zones
  vsco Timpani.sfz timpani Timpani percussion acoustic,warm,punchy timpani --round-robins 1 --seconds 3.0 --fade-ms 500 --release-ms 300 --pitch-limit 3 --polyphony 16
  vsco Xylophone.sfz xylophone Xylophone keys acoustic,bright,plucky xylophone --round-robins 1 --seconds 2.0 --fade-ms 400 --release-ms 200 --pitch-limit 3 --polyphony 24
  vsco TubularBells.sfz tubular-bells "Tubular Bells" keys acoustic,bright,warm "tubular bells" --round-robins 1 --seconds 4.0 --fade-ms 800 --release-ms 500 --pitch-limit 3 --polyphony 16
fi
# Saxophones (not from VSCO). WERE, BEAR, MTG are clones of karoryfer.weresax, karoryfer.bear-sax, sfzinstruments/MTG.SoloSax (CC BY 4.0 for MTG).
#   alto:     sfz-import.py WERE/Programs/alto_map_piano_dynamic.sfz WERE/Programs/alto_map_forte_dynamic.sfz --id alto-sax --layers first,last --round-robins 1 --rate 22050 --loop 1.0-2.5 --crossfade-ms 300 --release-ms 250 --pitch-limit 3 --polyphony 16 --level-zones ...
#   baritone: an SFZ listing only the *_looped_f samples of BEAR/Programs/poly/dynfade_map.sfz (the p/f pair is crossfaded on CC1, which the importer does not model), then --loop 1.0-2.5
#   tenor, soprano: sfz-import.py "MTG/MTG Solo Saxophones/MTG Tenor Sax.sfz" --require "_[fp]_[0-9]+\." --layers first,last --round-robins 1 --loop 1.0-2.5 ...
