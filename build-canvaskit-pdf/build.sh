#!/usr/bin/env bash
# Build CanvasKit-wasm with the SkPDF backend and our extra JS bindings.
# Intended to run inside the Dockerfile in this directory, but works on any
# Linux host that has depot_tools + Emscripten on PATH and a Skia checkout.
#
# Env vars:
#   SKIA_DIR    — path to Skia checkout (default /skia)
#   OUT_DIR     — directory to copy canvaskit.{js,wasm} into (default /output)
#   EMSDK       — path to emsdk install (must be exported by `emsdk_env.sh`)

set -euo pipefail

SKIA_DIR="${SKIA_DIR:-/skia}"
OUT_DIR="${OUT_DIR:-/output}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -d "$SKIA_DIR" ]]; then
  echo "[build] ERROR: SKIA_DIR=$SKIA_DIR does not exist" >&2
  exit 1
fi

echo "[build] Skia:   $SKIA_DIR"
echo "[build] Output: $OUT_DIR"
echo "[build] EMSDK:  ${EMSDK:-(unset)}"

cd "$SKIA_DIR"

echo "[build] Syncing third-party deps (python3 tools/git-sync-deps)…"
python3 tools/git-sync-deps

echo "[build] Copying bindings extension into modules/canvaskit/…"
cp "$SCRIPT_DIR/canvaskit_pdf_bindings.cpp" modules/canvaskit/canvaskit_pdf_bindings.cpp

echo "[build] Patching modules/canvaskit/BUILD.gn to include the extension…"
python3 - "$SKIA_DIR" <<'PY'
import pathlib, re, sys
skia_dir = pathlib.Path(sys.argv[1])
build_gn = skia_dir / "modules" / "canvaskit" / "BUILD.gn"
text = build_gn.read_text()
needle = '"canvaskit_bindings.cpp"'
add = '"canvaskit_pdf_bindings.cpp"'
if add in text:
    print("[patch] BUILD.gn already references", add)
    sys.exit(0)
if needle not in text:
    print("[patch] ERROR: could not find", needle, "in", build_gn, file=sys.stderr)
    sys.exit(1)
# Insert our file right after the canvaskit_bindings.cpp entry.
text = text.replace(needle, f'{needle},\n    {add}', 1)
build_gn.write_text(text)
print("[patch] BUILD.gn updated")
PY

echo "[build] Writing GN args…"
mkdir -p out/canvaskit_pdf
cp "$SCRIPT_DIR/gn_args.txt" out/canvaskit_pdf/args.gn

# Emscripten paths required by Skia's BUILD.gn for target_os="emscripten".
if [[ -z "${EMSDK:-}" ]]; then
  echo "[build] ERROR: EMSDK env var must be set (source emsdk_env.sh first)" >&2
  exit 1
fi

# Make sure emcc is on PATH.
if ! command -v emcc >/dev/null; then
  echo "[build] ERROR: emcc not found on PATH" >&2
  exit 1
fi

echo "[build] Ensuring bin/gn exists…"
if [[ ! -x bin/gn ]]; then
  python3 bin/fetch-gn
fi

echo "[build] gn gen…"
bin/gn gen out/canvaskit_pdf

echo "[build] ninja canvaskit…"
ninja -C out/canvaskit_pdf canvaskit

echo "[build] Copying artifacts to $OUT_DIR…"
mkdir -p "$OUT_DIR"
cp out/canvaskit_pdf/canvaskit.js "$OUT_DIR/canvaskit.js"
cp out/canvaskit_pdf/canvaskit.wasm "$OUT_DIR/canvaskit.wasm"

echo "[build] Done."
ls -lh "$OUT_DIR"
