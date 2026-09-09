#!/bin/bash
# DETAR — schlankes three.js bauen (2026-09-09). Ergebnis: vendor/three/three.module.js
# (tree-shaken auf die Klassen, die App + 8th-Wall-Engine + OrbitControls brauchen,
# Liste in tools/three-slim-entry.js) und vendor/three/addons/controls/OrbitControls.js
# (aus dem three-Paket; sein `from 'three'` wird per sed auf den relativen Pfad
# ../../three.module.js umgeschrieben — seit 2026-09-09 gibt es KEINE Importmap
# mehr, weil sie iOS 16.4 / Chrome 89 voraussetzt).
# Nur nötig, wenn three aktualisiert wird oder eine neue THREE.*-Klasse im Code
# auftaucht (dann in three-slim-entry.js eintragen — fehlt sie, wirft der Browser
# "does not provide an export named …").
set -e
cd "$(dirname "$0")"
TMP=$(mktemp -d)
cp three-slim-entry.js "$TMP/entry.js"
cd "$TMP"
npm init -y >/dev/null
npm install --silent three@0.160.0 esbuild@0.24.2
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=inline --target=es2020 --outfile=three.module.js
DEST="$OLDPWD/../vendor/three"
cp three.module.js "$DEST/three.module.js"
cp node_modules/three/examples/jsm/controls/OrbitControls.js "$DEST/addons/controls/OrbitControls.js"
# Importmap-Spezifizierer 'three' → relativer Pfad (macOS-sed: -i '')
sed -i '' "s|} from 'three';|} from '../../three.module.js'; // DETAR: relativer Import statt Importmap (2026-09-09, s. tools/build-three.sh)|" "$DEST/addons/controls/OrbitControls.js"
grep -q "three.module.js'" "$DEST/addons/controls/OrbitControls.js" || { echo "sed auf OrbitControls.js hat nicht gegriffen"; exit 1; }
cp node_modules/three/LICENSE "$DEST/LICENSE"
ls -la "$DEST"
