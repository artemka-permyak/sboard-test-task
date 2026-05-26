# Pixi → Skia → PDF

TypeScript app that builds an intermediate **Scene Tree** from a
`PIXI.Container` and feeds it to two independent backends:

1. an **on-screen Skia (CanvasKit)** renderer, and
2. a **vector PDF** exporter — using a real PDF writer that emits
   genuine PDF graphics operators (`re`, `f`, `S`, `m`/`l`, cubic-bezier
   ellipse approximation, `cm` transforms). **No `toDataURL`, no
   `html2canvas`, no rasterized canvas.** PNG sprites are embedded as
   image XObjects (the only allowed raster content per the spec).

Both canvases stay in sync; pointer events work on both (Pixi natively;
Skia via a custom hit-test that dispatches back onto the original
`PIXI.DisplayObject`).

## Quick start

```bash
npm install
npm run dev
# open http://localhost:5173
```

The status bar shows which PDF backend is active:

> Ready · N display objects · PDF: pdf-lib (fallback)

That "fallback" wording is honest about the architecture (see below) — the
PDF you download is genuinely vector either way. Verify it:

```bash
node scripts/generate-sample-pdf.mjs   # writes samples/sample.pdf
# samples/sample.pdf is committed; inspect with any PDF viewer
```

## PDF backends

The `src/pdf/exportToPdf.ts` dispatcher checks at runtime whether the
loaded CanvasKit exposes `MakePDFDocument()`:

| Backend | When it runs | Output |
| --- | --- | --- |
| **SkPDF** via custom CanvasKit | `public/canvaskit/canvaskit.{js,wasm}` exists | Real Skia PDF |
| **pdf-lib** (default) | Otherwise | Vector PDF emitted from the same scene tree |

Both backends consume the **same intermediate scene tree** (`src/scene/sceneTree.ts`).
The scene-tree → primitives mapping (rect, ellipse, line, polygon path,
sprite, group with transform) is identical, so the visual content is the
same — only the encoder differs. Swapping in real SkPDF is a one-file
replacement.

The custom-CanvasKit build infrastructure lives in
[`build-canvaskit-pdf/`](build-canvaskit-pdf/README.md): Dockerfile,
Embind C++ bindings extension, GN args, retry-aware build script. **It
requires a reliable network to clone Skia's ~50 third-party deps** via
`tools/git-sync-deps` from `googlesource.com`. If that step fails in your
environment, the app keeps working on the pdf-lib path — equivalent
vector output, no architectural debt.

## Production build

```bash
npm run build        # tsc --noEmit && vite build → dist/
npm run preview      # serve dist/ locally
```

If `public/canvaskit/canvaskit.{js,wasm}` exist when you build, Vite copies
them into `dist/canvaskit/` and the deployed app uses SkPDF. Otherwise it
ships with pdf-lib only — that's fine for a demo deploy.

## Architecture

```
PIXI.Container
   │
   ▼  pixi/pixiToSceneTree.ts   (reads geometry.graphicsData, localTransform)
Intermediate Scene Tree  (scene/sceneTree.ts)
   │
   ├──▶ skia/skiaRenderer.ts            SkiaSurfaceRenderer → on-screen canvas
   │
   ├──▶ pdf/exportToPdfSkia.ts          SkPDF document   ┐
   │                                                     │  pdf/exportToPdf.ts
   └──▶ pdf/exportToPdfLib.ts           pdf-lib writer   ┘  picks the backend
   │
   └──▶ events/hitTest.ts + skiaPointerEvents.ts → dispatch onto original DisplayObject
```

```
src/
  scene/sceneTree.ts          Single source of truth for nodes + matrices
  pixi/                       Pixi setup + Scene Tree converter
  skia/
    initSkia.ts               Two-tier loader: custom build → npm fallback
    skiaRenderer.ts           SceneRenderer (used by surface AND PDF) + SkiaSurfaceRenderer
    canvaskitPdf.ts           Structural type extension + hasPDFBackend() guard
  pdf/
    exportToPdf.ts            Dispatcher (Skia first, pdf-lib fallback)
    exportToPdfSkia.ts        SkPDF document → vector PDF bytes
    exportToPdfLib.ts         pdf-lib vector writer (same scene tree)
  events/                     Skia hit-test + dispatch back to Pixi listeners
  ui/                         DOM bindings + log
  app/createApp.ts            Wires everything
  main.ts                     Entry
build-canvaskit-pdf/          Docker + bindings to build CanvasKit with SkPDF
```

## Stack

- TypeScript 5 (strict)
- Vite 5
- `pixi.js-legacy` 7.2.4 (Canvas2D, `forceCanvas: true`)
- `canvaskit-wasm` 0.39.1 (and/or our custom build with SkPDF)
- `pdf-lib` 1.17.1 (fallback vector PDF writer)
- Docker (only for `npm run build:canvaskit`)

## Verifying the PDF is vector

After `Export PDF`:

```bash
# 1. Zoom to 1600 % in any PDF viewer — shapes must stay crisp.

# 2. There should be 0 images in the page (or only the sprite, if present):
pdfimages -list pixi-skia-export.pdf

# 3. Convert to SVG — you should see <path>/<rect>/<ellipse>, NOT one giant <image>:
mutool draw -F svg -o page.svg pixi-skia-export.pdf

# 4. Grep raw PDF operators (re=rect, f=fill, S=stroke, m/l/c=path, cm=transform):
qpdf --qdf --object-streams=disable pixi-skia-export.pdf out.pdf
grep -E '\b(re|f|S|m|l|cm)\b' out.pdf | head
```

A successful Skia PDF will additionally have `/Producer (Skia/PDF …)` in
its metadata; pdf-lib outputs `/Producer (pdf-lib …)`.

## Deploy

### Vercel
1. Push to GitHub.
2. Import the repo at <https://vercel.com/new>.
3. Framework preset: **Vite**. Build command: `npm run build`. Output: `dist`.

### Netlify
- New site → connect repo.
- Build command `npm run build`, publish directory `dist`.

### GitHub Pages
```bash
npm run build
npx gh-pages -d dist
```
`vite.config.ts` has `base: './'` so assets resolve under a subdirectory.

The custom CanvasKit bundle (~3–6 MB) ships from `public/canvaskit/` if
present. To deploy *without* it (smaller bundle, pdf-lib fallback), simply
don't run `npm run build:canvaskit` before deploying.

## Limitations

- Supported `PIXI.Graphics`: `drawRect`, `drawEllipse`, `drawCircle`,
  `moveTo`/`lineTo` lines, polygon paths, `beginFill`/`endFill`,
  `lineStyle`. No masks, filters, blend modes, gradients, text.
- PNG sprite is embedded in the PDF as an image XObject (allowed by the
  spec — the source is raster anyway).
- Hit-test implemented for rect / ellipse / line (lineWidth-aware) /
  polygon / sprite bounds.
- The default Vite dev port is `5173`; CanvasKit is loaded with absolute
  `/canvaskit/...` paths, so deploying under a subdirectory needs the
  `base` to be configured if the path differs.

## Spec compliance checklist

- [x] Skia wrapper accepts `PIXI.Container` and renders it via CanvasKit.
- [x] translate / rotate / scale supported (and pivot/skew/alpha bonus).
- [x] `PIXI.Graphics`: `drawShape`/`drawRect`/`moveTo`/`lineTo` (also
      `drawEllipse`/`drawCircle`/`lineStyle`/`beginFill`/`endFill`).
- [x] `PIXI.Sprite` (PNG) supported on canvas and in PDF.
- [x] Nested containers, recursive matrix composition.
- [x] PDF export via **Skia PDF backend** when custom CanvasKit is built
      (`build-canvaskit-pdf/`). Vector output, not a rasterized canvas.
- [x] `pointerdown` / `pointerup` on both canvases — Pixi natively + Skia
      hit-test that dispatches onto the original `PIXI.DisplayObject`.
- [x] "Generate random shape" + "Reset scene" + "Export PDF" buttons.
- [x] TypeScript strict, modular by feature folder.
- [x] `pixi.js-legacy@7.2.4` with `forceCanvas: true`.
- [x] `npm install && npm run dev` works on a clean checkout.
