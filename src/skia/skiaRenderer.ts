import type { Canvas, CanvasKit, Image as SkImage, Paint, Surface } from 'canvaskit-wasm';
import {
  EllipseNode,
  LineNode,
  Mat2D,
  PathNode,
  RectNode,
  SceneNode,
  SpriteNode,
} from '../scene/sceneTree';

/**
 * Pure scene drawer. Knows how to walk a SceneNode tree and emit Skia draw
 * calls onto any SkCanvas — the same primitives that the PDF document
 * receives via SkPDF::beginPage().
 */
export class SceneRenderer {
  private readonly imageCache = new WeakMap<HTMLImageElement, SkImage>();

  constructor(private readonly ck: CanvasKit) {}

  drawScene(canvas: Canvas, scene: SceneNode): void {
    this.drawNode(canvas, scene, 1);
  }

  private drawNode(canvas: Canvas, node: SceneNode, parentAlpha: number): void {
    if (!node.visible || node.alpha <= 0) return;
    const alpha = parentAlpha * node.alpha;

    canvas.save();
    canvas.concat(toSkiaMatrix(node.transform));

    switch (node.type) {
      case 'group':
        for (const ch of node.children) this.drawNode(canvas, ch, alpha);
        break;
      case 'rect':
        this.drawRect(canvas, node, alpha);
        break;
      case 'ellipse':
        this.drawEllipse(canvas, node, alpha);
        break;
      case 'line':
        this.drawLine(canvas, node, alpha);
        break;
      case 'path':
        this.drawPath(canvas, node, alpha);
        break;
      case 'sprite':
        this.drawSprite(canvas, node, alpha);
        break;
    }
    canvas.restore();
  }

  private drawRect(canvas: Canvas, n: RectNode, alpha: number): void {
    const rect = this.ck.XYWHRect(n.x, n.y, n.width, n.height);
    if (n.fill) {
      const p = this.makePaint(n.fill.color, n.fill.alpha * alpha, 'fill');
      canvas.drawRect(rect, p);
      p.delete();
    }
    if (n.stroke) {
      const p = this.makePaint(n.stroke.color, n.stroke.alpha * alpha, 'stroke', n.stroke.width);
      canvas.drawRect(rect, p);
      p.delete();
    }
  }

  private drawEllipse(canvas: Canvas, n: EllipseNode, alpha: number): void {
    const oval = this.ck.LTRBRect(n.cx - n.rx, n.cy - n.ry, n.cx + n.rx, n.cy + n.ry);
    if (n.fill) {
      const p = this.makePaint(n.fill.color, n.fill.alpha * alpha, 'fill');
      canvas.drawOval(oval, p);
      p.delete();
    }
    if (n.stroke) {
      const p = this.makePaint(n.stroke.color, n.stroke.alpha * alpha, 'stroke', n.stroke.width);
      canvas.drawOval(oval, p);
      p.delete();
    }
  }

  private drawLine(canvas: Canvas, n: LineNode, alpha: number): void {
    if (n.points.length < 4) return;
    const path = this.buildPolylinePath(n.points, false);
    const p = this.makePaint(n.stroke.color, n.stroke.alpha * alpha, 'stroke', n.stroke.width);
    canvas.drawPath(path, p);
    p.delete();
    path.delete();
  }

  private drawPath(canvas: Canvas, n: PathNode, alpha: number): void {
    if (n.points.length < 4) return;
    const path = this.buildPolylinePath(n.points, true);
    if (n.fill) {
      const p = this.makePaint(n.fill.color, n.fill.alpha * alpha, 'fill');
      canvas.drawPath(path, p);
      p.delete();
    }
    if (n.stroke) {
      const p = this.makePaint(n.stroke.color, n.stroke.alpha * alpha, 'stroke', n.stroke.width);
      canvas.drawPath(path, p);
      p.delete();
    }
    path.delete();
  }

  /**
   * In canvaskit-wasm 0.41 the `Path` type became immutable; mutable
   * construction now goes through `PathBuilder`. We build, then `detachAndDelete()`
   * which transfers the SkPath out of the builder and disposes the builder.
   */
  private buildPolylinePath(points: number[], close: boolean): import('canvaskit-wasm').Path {
    const pb = new this.ck.PathBuilder();
    pb.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
      pb.lineTo(points[i], points[i + 1]);
    }
    if (close) pb.close();
    return pb.detachAndDelete();
  }

  private drawSprite(canvas: Canvas, n: SpriteNode, alpha: number): void {
    const img = this.getOrCacheImage(n.image);
    if (!img) return;
    const paint = new this.ck.Paint();
    paint.setAlphaf(alpha);
    canvas.drawImageRect(
      img,
      this.ck.LTRBRect(0, 0, img.width(), img.height()),
      this.ck.LTRBRect(0, 0, n.width, n.height),
      paint,
    );
    paint.delete();
  }

  private getOrCacheImage(htmlImage: HTMLImageElement): SkImage | null {
    const cached = this.imageCache.get(htmlImage);
    if (cached) return cached;
    if (!htmlImage.complete || htmlImage.naturalWidth === 0) return null;
    const off = document.createElement('canvas');
    off.width = htmlImage.naturalWidth;
    off.height = htmlImage.naturalHeight;
    off.getContext('2d')!.drawImage(htmlImage, 0, 0);
    const img = this.ck.MakeImageFromCanvasImageSource(off);
    if (img) this.imageCache.set(htmlImage, img);
    return img;
  }

  private makePaint(
    hexColor: string,
    alpha: number,
    style: 'fill' | 'stroke',
    width = 1,
  ): Paint {
    const paint = new this.ck.Paint();
    paint.setAntiAlias(true);
    const { r, g, b } = parseHex(hexColor);
    paint.setColor(this.ck.Color4f(r / 255, g / 255, b / 255, alpha));
    paint.setStyle(style === 'stroke' ? this.ck.PaintStyle.Stroke : this.ck.PaintStyle.Fill);
    if (style === 'stroke') paint.setStrokeWidth(width);
    return paint;
  }
}

/**
 * Owns an on-screen SW canvas surface and re-paints it from a SceneNode.
 */
export class SkiaSurfaceRenderer {
  private surface: Surface | null = null;
  private readonly renderer: SceneRenderer;

  constructor(private readonly ck: CanvasKit, private readonly canvas: HTMLCanvasElement) {
    this.renderer = new SceneRenderer(ck);
  }

  render(scene: SceneNode): void {
    if (!this.surface) {
      const surface = this.ck.MakeSWCanvasSurface(this.canvas);
      if (!surface) throw new Error('Skia: failed to create surface');
      this.surface = surface;
    }
    const canvas = this.surface.getCanvas();
    canvas.clear(this.ck.WHITE);
    this.renderer.drawScene(canvas, scene);
    this.surface.flush();
  }

  dispose(): void {
    this.surface?.delete();
    this.surface = null;
  }
}

function toSkiaMatrix(m: Mat2D): number[] {
  // PIXI [a b c d tx ty] -> Skia row-major 3x3
  return [m.a, m.c, m.tx, m.b, m.d, m.ty, 0, 0, 1];
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}
