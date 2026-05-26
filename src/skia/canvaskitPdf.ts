/**
 * Type augmentation for our custom CanvasKit build that exposes SkPDF.
 *
 * The stock `canvaskit-wasm` typings do not declare these. We don't merge
 * into the canvaskit-wasm module: instead we define a structural extension
 * that we cast through (so the code still compiles against the stock
 * package while letting us call the extra methods at runtime).
 */

import type { Canvas, CanvasKit } from 'canvaskit-wasm';

export interface SkPDFDocument {
  /** Returns the SkCanvas for the new page. Same drawing API as on-screen. */
  beginPage(width: number, height: number): Canvas;
  /** Closes the current page; you may begin another. */
  endPage(): void;
  /**
   * Finalizes the document and returns the encoded PDF bytes.
   * After this call the document is unusable.
   */
  close(): Uint8Array;
  /** Releases C++ resources if `close()` was not called. */
  delete(): void;
}

export interface CanvasKitWithPDF extends CanvasKit {
  MakePDFDocument?: () => SkPDFDocument;
}

export function hasPDFBackend(
  ck: CanvasKit,
): ck is CanvasKitWithPDF & { MakePDFDocument: () => SkPDFDocument } {
  return typeof (ck as CanvasKitWithPDF).MakePDFDocument === 'function';
}
