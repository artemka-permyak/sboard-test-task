import type { CanvasKit } from 'canvaskit-wasm';
import { SceneRenderer } from '../skia/skiaRenderer';
import { SceneNode } from '../scene/sceneTree';
import { hasPDFBackend } from '../skia/canvaskitPdf';

/**
 * Real Skia PDF backend.
 *
 * Uses our custom CanvasKit build's `MakePDFDocument()`. SkPDF writes an
 * actual vector PDF (paths/fills/strokes/cubic-bezier ellipses, image
 * XObjects for sprites). Internally SkPDF handles the Y-flip to PDF
 * coordinates, so we reuse the on-screen SceneRenderer unchanged.
 *
 * Throws if the loaded CanvasKit does not expose SkPDF — callers should
 * dispatch to the pdf-lib fallback in that case.
 */
export function exportSceneToPdfViaSkia(
  ck: CanvasKit,
  scene: SceneNode,
  width: number,
  height: number,
): Uint8Array {
  if (!hasPDFBackend(ck)) {
    throw new Error('Skia PDF backend not available in this CanvasKit build');
  }
  const doc = ck.MakePDFDocument();
  try {
    const canvas = doc.beginPage(width, height);
    canvas.clear(ck.WHITE);
    new SceneRenderer(ck).drawScene(canvas, scene);
    doc.endPage();
    return doc.close();
  } catch (err) {
    doc.delete();
    throw err;
  }
}
