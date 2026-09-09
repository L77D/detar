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
| `detar-engine-trim.patch` | Zuschnitt von jsxr.ts (s. u.) | Doku |
| `BUILD-INFO.txt` | Commit, Build-Config, Größen | Doku |

Nicht enthalten (für Bildtracking ungenutzt): `xr-face.js` (Face Effects) und
`resources/` (Face-/Semantik-Modelle, Tablet-GLBs).

## Zuschnitt (DETAR)

`xr.js` ist gegenüber dem Monorepo-Stand um die Framework-Adapter (A-Frame,
Babylon.js, PlayCanvas, Sumerian, CloudStudio-Three), MediaRecorder,
CanvasScreenshot, LayersController (Sky/Semantik) und die Pixel-Array-Module
erleichtert — DETAR braucht nur `run`, `XrController`, `GlTextureRenderer`,
`Threejs`, `XrConfig`, `XrDevice`, `XrPermissions`, `loadChunk`. Der Eingriff ist
eine einzige Datei (`reality/app/xr/js/src/jsxr.ts`) und liegt als
`detar-engine-trim.patch` daneben: im Monorepo `git apply`, dann nur
`//reality/app/xr/js:xr` bauen (Sekunden, WASM bleibt gecacht). Ohne Patch
läuft DETAR mit dem ungekürzten `xr.js` genauso — nur 140 KB schwerer.

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

`wasmrelease` (ohne `simd`) baut die Variante für Browser ohne WASM-SIMD
(vor iOS 16.4 / Chrome 91) — sie liegt seit der Production-Härtung
(2026-09-09) in `vendor/8thwall-nosimd/` (gleicher Commit, gleicher Patch,
eigene `BUILD-INFO.txt` mit wasmtime-Prüfprotokoll). `js/main.js` wählt per
`WebAssembly.validate` auf dem SIMD-Testmodul; `?nosimd` erzwingt den
Fallback. **Bei jedem Engine-Update beide Varianten bauen** (zweiter Build
nutzt den Bazel-Disk-Cache, ≈ 5 min):

```bash
bazelisk build --config=wasmrelease //reality/app/xr/js:bundle
unzip -o bazel-bin/reality/app/xr/js/bundle.zip xr.js xr-tracking.js -d /pfad/zu/detar/vendor/8thwall-nosimd/
```
(Bazel-Ausgaben sind schreibgeschützt: vor dem Überschreiben `chmod u+w`.
Python-venv mit numpy und `PYTHON_BIN_PATH` nötig, s. BUILD-INFO.)

Eingecheckter Stand: siehe `BUILD-INFO.txt` (Commit, Datum, Build-Config,
Dateigrößen). Bei jedem Engine-Update diese Datei mitziehen und — wegen des
Safari-Caches (Pages: max-age 600, jede Datei einzeln) — den Build-Check in
`?stats` nutzen.
