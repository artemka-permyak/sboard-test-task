import type { CanvasKit } from 'canvaskit-wasm';
import { SceneNode } from '../scene/sceneTree';
import { hasPDFBackend } from '../skia/canvaskitPdf';
import { exportSceneToPdfViaSkia } from './exportToPdfSkia';
import { exportSceneToPdfViaPdfLib } from './exportToPdfLib';

export type PdfBackend = 'skia' | 'pdf-lib';

export interface PdfResult {
  bytes: Uint8Array;
  backend: PdfBackend;
}

/**
 * Picks the SkPDF backend when our custom CanvasKit is loaded; otherwise
 * uses the pdf-lib vector writer. Both produce vector PDFs.
 */
export async function exportSceneToPdf(
  ck: CanvasKit,
  scene: SceneNode,
  width: number,
  height: number,
): Promise<PdfResult> {
  if (hasPDFBackend(ck)) {
    const bytes = exportSceneToPdfViaSkia(ck, scene, width, height);
    return { bytes, backend: 'skia' };
  }
  const bytes = await exportSceneToPdfViaPdfLib(scene, width, height);
  return { bytes, backend: 'pdf-lib' };
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  // TypeScript 5.7+ tightened Uint8Array's generic to require ArrayBuffer
  // (not SharedArrayBuffer) for BlobPart. Our bytes always come from regular
  // ArrayBuffer (pdf-lib / SkPDF copy into JS-owned heap), so the cast is sound.
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
