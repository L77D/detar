# vendor/three — three.js 0.160.0, schlank gebündelt (MIT)

`three.module.js` ist KEIN Vollbau: per esbuild tree-shaken auf genau die
Klassen, die die App (`js/`), die 8th-Wall-Engine (`XR8.Threejs`, Namen aus
`vendor/8thwall/xr.js`) und `OrbitControls` (Desktop-Modus) benutzen — Liste
in `tools/three-slim-entry.js`, Bau mit `tools/build-three.sh`. 473 KB roh /
120 KB gz statt 1,2 MB / 250 KB gz vom CDN; und die App lädt nichts mehr von
Dritten. Seit der Production-Härtung (2026-09-09) gibt es KEINE Importmap mehr
(braucht iOS 16.4 / Chrome 89): `js/*.js` importieren
`../vendor/three/three.module.js` direkt, `OrbitControls.js` importiert
`../../three.module.js` (sed in `tools/build-three.sh`).

Neue `THREE.*`-Klasse im Code? In `tools/three-slim-entry.js` eintragen und
neu bauen — sonst meldet der Browser „does not provide an export named …".
