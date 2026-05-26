# Custom CanvasKit with SkPDF backend

The stock `canvaskit-wasm` npm package is compiled without Skia's PDF
backend (`SkPDF`). To get a real Skia-based PDF exporter in the browser we
build CanvasKit ourselves with `skia_use_pdf=true` and add a small Embind
binding that exposes `MakePDFDocument()` to JavaScript.

The frontend already knows how to use it: when
`public/canvaskit/canvaskit.{js,wasm}` are present, `src/skia/initSkia.ts`
loads them instead of the npm package, and `src/pdf/exportToPdf.ts`
dispatches to the SkPDF backend automatically.

## How to build

Requires Docker.

```bash
npm run build:canvaskit
```

That command (defined in the repo's `package.json`) runs:

```bash
docker build -t canvaskit-pdf-builder ./build-canvaskit-pdf
docker run --rm -v "$(pwd)/public/canvaskit:/output" canvaskit-pdf-builder
```

When it finishes, `public/canvaskit/canvaskit.js` and
`public/canvaskit/canvaskit.wasm` exist. Restart `npm run dev` — the status
bar will show **`PDF: SkPDF`** instead of **`PDF: pdf-lib (fallback)`**.

**Expect 30–60 minutes** the first time (≈5 GB of Skia + deps downloaded
into a Docker layer, then a full Skia + CanvasKit compile). Rebuilds after
that are minutes, because only the `COPY build.sh canvaskit_pdf_bindings.cpp
gn_args.txt` layer is invalidated.

## What's in this directory

| File | Purpose |
| --- | --- |
| `Dockerfile` | Uses the official `emscripten/emsdk:3.1.74` multi-arch base (works on arm64 / Apple Silicon natively), adds depot_tools + Skia main. |
| `build.sh` | Runs inside the container: syncs deps, drops the bindings cpp into `modules/canvaskit/`, patches `BUILD.gn`, runs `gn gen` + `ninja canvaskit`, copies output to `/output`. |
| `canvaskit_pdf_bindings.cpp` | Embind glue. Wraps `SkPDF::MakeDocument` as `PDFDocument` class with `beginPage(w,h)`, `endPage()`, `close() → Uint8Array`. |
| `gn_args.txt` | Skia GN build configuration — enables PDF + zlib + libpng, disables HarfBuzz/ICU/SkParagraph/etc to keep the wasm small. |

## How the bindings work

```cpp
// Inside canvaskit_pdf_bindings.cpp
class PDFDocumentJS : public SkRefCnt {
  SkDynamicMemoryWStream fStream;
  sk_sp<SkDocument>      fDoc = SkPDF::MakeDocument(&fStream);

  SkCanvas* beginPage(SkScalar w, SkScalar h) { return fDoc->beginPage(w, h); }
  void      endPage()                          { fDoc->endPage(); }
  val       close() {
    fDoc->close();
    sk_sp<SkData> d = fStream.detachAsData();
    /* copy to JS Uint8Array */
  }
};
```

`beginPage()` returns the same `SkCanvas*` type that the on-screen surface
returns, so the existing `SceneRenderer.drawScene(canvas, scene)` works
unchanged. SkPDF handles the Y-flip to PDF's bottom-left-origin internally,
so no coordinate transformation is needed.

## Troubleshooting

**`fatal: remote transport reported error`** during `git-sync-deps` — the
parallel git fetches (~10 concurrent clones) overwhelm the Docker network
on macOS (vpnkit/gvisor). The Dockerfile already forces sequential sync
via `sync-deps-sequential.py` and retries 8×, but if your link is very
flaky you can `docker build --no-cache` to start fresh, or build outside
Docker on Linux. Last-resort: drop into the half-built image and re-run
manually until it succeeds:
```bash
docker run --rm -it --entrypoint bash canvaskit-pdf-builder
# inside:
cd /skia && python3 /usr/local/bin/sync-deps-sequential.py
```
Re-running is safe — partially synced deps are detected and just fetched.

**`HTTP Error 404: wasm-binaries-arm64.tar.xz`** during `docker build`
— this happens on Apple Silicon if the Dockerfile installs an old emsdk
version that has no arm64 distribution. Our Dockerfile dodges this by
using the official multi-arch `emscripten/emsdk:3.1.74` base image. If
you've changed the base, either pin to an emsdk version `>= 3.1.45` (the
first arm64 release) or force amd64 emulation via Rosetta:
`docker build --platform=linux/amd64 ...`.

**`bin/gn: not found`** — depot_tools didn't sync gn. Inside the container:
`cd /skia && bin/fetch-gn`.

**`error: emcc not found on PATH`** — re-source emsdk:
`source $EMSDK/emsdk_env.sh` (the base image bakes the PATH so this should
not happen in Docker; only relevant if running natively).

**`patch ERROR: could not find "canvaskit_bindings.cpp"`** — Skia HEAD
reorganized the canvaskit BUILD.gn. Open `modules/canvaskit/BUILD.gn`, find
where `canvaskit_bindings.cpp` is referenced in the bindings target, and
add `"canvaskit_pdf_bindings.cpp"` next to it. Update `build.sh`'s patch
block accordingly.

**Build succeeds but `MakePDFDocument` is undefined at runtime** — the
bindings cpp got compiled but not linked. Check the build log for our
file's name; if missing, the BUILD.gn patch didn't take effect.

**Image size pain** — to throw the cache away and rebuild from scratch:
`docker build --no-cache -t canvaskit-pdf-builder ./build-canvaskit-pdf`.

## Verifying you got SkPDF

After a successful build:

```bash
ls -lh public/canvaskit/
# canvaskit.js   ~150–400 KB
# canvaskit.wasm  ~2–6 MB  (varies with flags)

# Quick sniff for PDF symbols in the wasm:
strings public/canvaskit/canvaskit.wasm | grep -i 'pdf\|SkPDF' | head
```

Then open the dev app — `Export PDF` will write a real Skia PDF, and the
status bar will say **`PDF: SkPDF`**.
