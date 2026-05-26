import {
  PDFDocument,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from 'pdf-lib';
import {
  EllipseNode,
  LineNode,
  PathNode,
  RectNode,
  SceneNode,
  SpriteNode,
} from '../scene/sceneTree';

/**
 * pdf-lib vector writer — pure-JS fallback for when the custom CanvasKit
 * (with SkPDF) is not present.
 *
 * Still vector: emits real PDF operators (`re`, `f`, `S`, `m`/`l`,
 * cubic-bezier ellipse approximation, `cm` transforms). PNG sprites are
 * embedded as image XObjects.
 */
export async function exportSceneToPdfViaPdfLib(
  scene: SceneNode,
  pageWidth: number,
  pageHeight: number,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([pageWidth, pageHeight]);

  // Flip Y once at the page level so the rest of the writer uses canvas
  // coordinates. Sprites get a local re-flip to stay upright.
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(1, 0, 0, -1, 0, pageHeight),
  );

  await drawNode(pdf, page, scene, 1);

  page.pushOperators(popGraphicsState());
  return pdf.save();
}

type Page = ReturnType<PDFDocument['addPage']>;

async function drawNode(
  pdf: PDFDocument,
  page: Page,
  node: SceneNode,
  parentAlpha: number,
): Promise<void> {
  if (!node.visible || node.alpha <= 0) return;
  const alpha = parentAlpha * node.alpha;

  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(
      node.transform.a,
      node.transform.b,
      node.transform.c,
      node.transform.d,
      node.transform.tx,
      node.transform.ty,
    ),
  );

  switch (node.type) {
    case 'group':
      for (const ch of node.children) await drawNode(pdf, page, ch, alpha);
      break;
    case 'rect':
      drawRect(page, node, alpha);
      break;
    case 'ellipse':
      drawEllipse(page, node, alpha);
      break;
    case 'line':
      drawLine(page, node, alpha);
      break;
    case 'path':
      drawPath(page, node, alpha);
      break;
    case 'sprite':
      await drawSprite(pdf, page, node, alpha);
      break;
  }

  page.pushOperators(popGraphicsState());
}

function asColor(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  return rgb(((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255);
}

function drawRect(page: Page, n: RectNode, alpha: number): void {
  page.drawRectangle({
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
    color: n.fill ? asColor(n.fill.color) : undefined,
    opacity: n.fill ? n.fill.alpha * alpha : undefined,
    borderColor: n.stroke ? asColor(n.stroke.color) : undefined,
    borderWidth: n.stroke ? n.stroke.width : undefined,
    borderOpacity: n.stroke ? n.stroke.alpha * alpha : undefined,
  });
}

function drawEllipse(page: Page, n: EllipseNode, alpha: number): void {
  page.drawEllipse({
    x: n.cx,
    y: n.cy,
    xScale: n.rx,
    yScale: n.ry,
    color: n.fill ? asColor(n.fill.color) : undefined,
    opacity: n.fill ? n.fill.alpha * alpha : undefined,
    borderColor: n.stroke ? asColor(n.stroke.color) : undefined,
    borderWidth: n.stroke ? n.stroke.width : undefined,
    borderOpacity: n.stroke ? n.stroke.alpha * alpha : undefined,
  });
}

function drawLine(page: Page, n: LineNode, alpha: number): void {
  for (let i = 0; i < n.points.length - 2; i += 2) {
    page.drawLine({
      start: { x: n.points[i], y: n.points[i + 1] },
      end: { x: n.points[i + 2], y: n.points[i + 3] },
      thickness: n.stroke.width,
      color: asColor(n.stroke.color),
      opacity: n.stroke.alpha * alpha,
    });
  }
}

function drawPath(page: Page, n: PathNode, alpha: number): void {
  if (n.points.length < 4) return;
  let d = `M ${n.points[0]} ${n.points[1]}`;
  for (let i = 2; i < n.points.length; i += 2) d += ` L ${n.points[i]} ${n.points[i + 1]}`;
  d += ' Z';
  page.drawSvgPath(d, {
    color: n.fill ? asColor(n.fill.color) : undefined,
    opacity: n.fill ? n.fill.alpha * alpha : undefined,
    borderColor: n.stroke ? asColor(n.stroke.color) : undefined,
    borderWidth: n.stroke ? n.stroke.width : undefined,
    borderOpacity: n.stroke ? n.stroke.alpha * alpha : undefined,
  });
}

async function drawSprite(
  pdf: PDFDocument,
  page: Page,
  n: SpriteNode,
  alpha: number,
): Promise<void> {
  const off = document.createElement('canvas');
  off.width = n.image.naturalWidth;
  off.height = n.image.naturalHeight;
  off.getContext('2d')!.drawImage(n.image, 0, 0);
  const dataUrl = off.toDataURL('image/png');
  const bytes = base64ToBytes(dataUrl.split(',')[1]);
  const embedded = await pdf.embedPng(bytes);

  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(1, 0, 0, -1, 0, n.height),
  );
  page.drawImage(embedded, { x: 0, y: 0, width: n.width, height: n.height, opacity: alpha });
  page.pushOperators(popGraphicsState());
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
