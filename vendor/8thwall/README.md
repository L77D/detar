# vendor/8thwall — Open-Source-8th-Wall-Engine (selbst gehostet)

Lizenz: MIT (`LICENSE`, © 2026 Niantic Spatial, Inc.).
Quelle: https://github.com/8thwall/8thwall — Bazel-Ziel `//reality/app/xr/js:bundle`.
Das ist **nicht** das „Distributed Engine Binary" (`@8thwall/engine-binary`,
eigene Lizenz, enthält SLAM als geschlossenes `xr-slam.js`) — davon liegt hier
nichts, und `js/main.js` fordert es nie an.

## Dateien

| Datei | Zweck | Pflicht |
|---|---|---|
| `xr.js` | Kern: Kamera-Pipeline (`XR8.run`), `GlTextureRenderer`, `Threejs`-Modul, Chunk-Loader | ja |
| `xr-tracking.js` | Bildtracker (Image Targets, kein SLAM). Wird von `xr.js` als Chunk `slam` nachgeladen — der Name ist historisch, in der Open-Source-Engine zeigt er auf diese Datei. WASM eingebettet. | ja |
| `LICENSE` | MIT | ja |

Nicht enthalten (für Bildtracking ungenutzt): `xr-face.js` (Face Effects) und
`resources/` (Face-/Semantik-Modelle, Tablet-GLBs).

## Herkunft / selbst bauen

Es gibt bislang kein npm-Release der Open-Source-Engine („We will also be
working on official releases … through npm", `packages/engine/README.md`).
Build aus dem Monorepo (macOS/Linux, Bazel per Bazelisk, git-lfs):

```bash
git clone --depth 1 https://github.com/8thwall/8thwall.git && cd 8thwall
git lfs pull
bazelisk build --config=wasmreleasesimd //reality/app/xr/js:bundle
# → bazel-bin/reality/app/xr/js/bundle.zip  (xr.js, xr-tracking.js, xr-face.js, resources/)
unzip -o bazel-bin/reality/app/xr/js/bundle.zip xr.js xr-tracking.js -d /pfad/zu/detar/vendor/8thwall/
```

`wasmrelease` (ohne `simd`) baut eine Variante für Browser ohne WASM-SIMD;
alle aktuellen iOS/Android-Browser können SIMD.

Eingecheckter Stand: siehe `BUILD-INFO.txt` (Commit, Datum, Build-Config,
Dateigrößen). Bei jedem Engine-Update diese Datei mitziehen und — wegen des
Safari-Caches (Pages: max-age 600, jede Datei einzeln) — den Build-Check in
`?stats` nutzen.
