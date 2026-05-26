/**
 * Intermediate Scene Tree.
 *
 * Both the Skia renderer and the PDF writer consume this representation,
 * so render logic is never duplicated between them.
 *
 * Coordinate system: Canvas/Pixi convention (Y down, origin top-left).
 * Matrices are stored in PIXI/Canvas order [a, b, c, d, tx, ty] which is
 * also identical to PDF's [a b c d e f] operand ordering for `cm`.
 */

export interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Mat2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export interface FillStyle {
  color: string; // "#rrggbb"
  alpha: number; // 0..1
}

export interface StrokeStyle {
  color: string;
  alpha: number;
  width: number;
}

interface BaseNode {
  id: string;
  transform: Mat2D;
  alpha: number;
  visible: boolean;
  pixiId?: string;
}

export interface GroupNode extends BaseNode {
  type: 'group';
  children: SceneNode[];
}

export interface RectNode extends BaseNode {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: FillStyle;
  stroke?: StrokeStyle;
}

export interface EllipseNode extends BaseNode {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill?: FillStyle;
  stroke?: StrokeStyle;
}

export interface LineNode extends BaseNode {
  type: 'line';
  points: number[];
  stroke: StrokeStyle;
}

export interface PathNode extends BaseNode {
  type: 'path';
  points: number[];
  fill?: FillStyle;
  stroke?: StrokeStyle;
}

export interface SpriteNode extends BaseNode {
  type: 'sprite';
  image: HTMLImageElement;
  width: number;
  height: number;
}

export type SceneNode =
  | GroupNode
  | RectNode
  | EllipseNode
  | LineNode
  | PathNode
  | SpriteNode;

export function multiply(a: Mat2D, b: Mat2D): Mat2D {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    tx: a.a * b.tx + a.c * b.ty + a.tx,
    ty: a.b * b.tx + a.d * b.ty + a.ty,
  };
}

export function invert(m: Mat2D): Mat2D {
  const det = m.a * m.d - m.b * m.c;
  if (!det) return IDENTITY;
  const inv = 1 / det;
  return {
    a: m.d * inv,
    b: -m.b * inv,
    c: -m.c * inv,
    d: m.a * inv,
    tx: (m.c * m.ty - m.d * m.tx) * inv,
    ty: (m.b * m.tx - m.a * m.ty) * inv,
  };
}

export function applyToPoint(m: Mat2D, x: number, y: number): { x: number; y: number } {
  return {
    x: m.a * x + m.c * y + m.tx,
    y: m.b * x + m.d * y + m.ty,
  };
}
