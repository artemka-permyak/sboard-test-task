// Standalone Node script that mirrors what src/pdf/exportToPdfLib.ts does in
// the browser. Drops the sprite (no DOM in Node), keeps every vector path, so
// the resulting samples/sample.pdf is verifiably vector for reviewers.
//
//   node scripts/generate-sample-pdf.mjs
//
// Then poke at it with:
//   pdfimages -list samples/sample.pdf       # → 0 images = pure vector
//   qpdf --qdf --object-streams=disable samples/sample.pdf out.pdf
//   grep -Ec '\b(re|f|S|m|l|cm)\b' out.pdf

import { writeFileSync } from 'node:fs';
import {
  PDFDocument,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from 'pdf-lib';

const W = 600;
const H = 400;

const pdf = await PDFDocument.create();
pdf.setTitle('Pixi → Skia → PDF sample (vector)');
pdf.setProducer('pdf-lib (sample)');
const page = pdf.addPage([W, H]);

// Flip Y once so we can use canvas-style coords.
page.pushOperators(
  pushGraphicsState(),
  concatTransformationMatrix(1, 0, 0, -1, 0, H),
);

// Helper: push transform, run body, pop.
const withTransform = (a, b, c, d, tx, ty, body) => {
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(a, b, c, d, tx, ty));
  body();
  page.pushOperators(popGraphicsState());
};

const deg = (d) => (d * Math.PI) / 180;
const xform = (x, y, angle, sx = 1, sy = 1) => {
  const cos = Math.cos(deg(angle)), sin = Math.sin(deg(angle));
  return [cos * sx, sin * sx, -sin * sy, cos * sy, x, y];
};

// g1 — red ellipse at (200,100), rotated 30°
withTransform(...xform(200, 100, 30), () => {
  page.drawEllipse({ x: 0, y: 0, xScale: 80, yScale: 40, color: rgb(1, 0, 0) });
});

// g2 — blue rect at (120,60), rotated 15°, scaled (1.2, 1.4)
withTransform(...xform(120, 60, 15, 1.2, 1.4), () => {
  page.drawRectangle({ x: -25, y: -35, width: 50, height: 70, color: rgb(0, 0, 1) });
});

// subContainer at (75,50) wrapping two lines (g3, g4)
withTransform(...xform(75, 50, 0), () => {
  withTransform(...xform(0, 0, -20), () => {
    page.drawLine({
      start: { x: 0, y: 0 },
      end: { x: 100, y: 70 },
      thickness: 6,
      color: rgb(1, 0.53, 0),
    });
  });
  withTransform(...xform(0, 0, 20), () => {
    page.drawLine({
      start: { x: 0, y: 50 },
      end: { x: 120, y: -20 },
      thickness: 6,
      color: rgb(0, 0.67, 0),
    });
  });
});

page.pushOperators(popGraphicsState());
const bytes = await pdf.save();
writeFileSync('samples/sample.pdf', bytes);
console.log(`wrote samples/sample.pdf (${bytes.length} bytes)`);
