#!/bin/bash
# DETAR — Fonts auf die genutzten Zeichen kürzen (Production-Härtung 2026-09-09).
# Eingabe: die Original-TTFs (Google Fonts, OFL) — NICHT im Repo, Pfad als $1.
# Zeichenmenge: alles aus cards/*.js, js/*.js, index.html, css/*.css plus
# komplettes Latin-1 (Sicherheit) plus typografische Zeichen („“”‚‘’…–—→✅ …),
# gesammelt in tools/font-subset-unicodes.txt (bei neuen Karten-Texten mit
# ungewöhnlichen Zeichen neu erzeugen — Python-Schnipsel im Kommentar unten).
# Hinting wird entfernt (fpgm/prep/cvt): iOS/macOS und Android/Skia werten
# TrueType-Instruktionen nicht aus, Outlines bleiben identisch — Jersey 10
# 76,6 → 18,5 KB, Silkscreen 32,2 → 13,9 KB. Pfeile/Häkchen fehlen schon im
# Original, dort fällt der Browser auf die Systemschrift zurück (war so).
#   pip install fonttools brotli
#   tools/build-fonts.sh /pfad/zu/originalen   # enthält Jersey10-Regular.ttf, Silkscreen-Regular.ttf
# Zeichenmenge neu sammeln:
#   python3 -c "import glob;s=set();[s.update(open(f,encoding='utf-8').read()) for f in glob.glob('cards/*.js')+glob.glob('js/*.js')+['index.html']+glob.glob('css/*.css')];s|=set('„“”‚‘’…–—→✅⋮•×←↑↓✓©®€°±²³§');s|={chr(c) for c in range(0x20,0x7F)}|{chr(c) for c in range(0xA0,0x100)};open('tools/font-subset-unicodes.txt','w').write(','.join('U+%04X'%ord(c) for c in sorted(s) if ord(c)>=0x20))"
set -e
SRC="${1:?Pfad zu den Original-TTFs}"
cd "$(dirname "$0")/.."
for f in Jersey10-Regular Silkscreen-Regular; do
  pyftsubset "$SRC/$f.ttf" --unicodes-file=tools/font-subset-unicodes.txt --output-file="assets/fonts/$f.ttf" \
    --layout-features='*' --name-IDs='*' --name-legacy --notdef-outline --glyph-names --no-hinting
  ls -la "assets/fonts/$f.ttf"
done
