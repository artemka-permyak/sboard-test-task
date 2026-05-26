import {
  EllipseNode,
  LineNode,
  Mat2D,
  PathNode,
  RectNode,
  SceneNode,
  SpriteNode,
  applyToPoint,
  invert,
  multiply,
} from '../scene/sceneTree';

/**
 * Returns the topmost interactive node containing the world point.
 * "Topmost" = last in DFS draw order (i.e. drawn last, painted on top).
 */
export function hitTest(
  root: SceneNode,
  worldX: number,
  worldY: number,
): { pixiId: string } | null {
  const order: Array<{
    pixiId: string;
    localX: number;
    localY: number;
    node: SceneNode;
  }> = [];

  const walk = (node: SceneNode, parent: Mat2D): void => {
    if (!node.visible || node.alpha <= 0) return;
    const world = multiply(parent, node.transform);
    if (node.type === 'group') {
      for (const ch of node.children) walk(ch, world);
      return;
    }
    const inv = invert(world);
    const local = applyToPoint(inv, worldX, worldY);
    order.push({
      pixiId: node.pixiId ?? '',
      localX: local.x,
      localY: local.y,
      node,
    });
  };

  walk(root, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

  for (let i = order.length - 1; i >= 0; i--) {
    const entry = order[i];
    if (!entry.pixiId) continue;
    if (containsLocal(entry.node, entry.localX, entry.localY)) {
      return { pixiId: entry.pixiId };
    }
  }
  return null;
}

function containsLocal(node: SceneNode, x: number, y: number): boolean {
  switch (node.type) {
    case 'rect':
      return containsRect(node, x, y);
    case 'ellipse':
      return containsEllipse(node, x, y);
    case 'line':
      return containsLine(node, x, y);
    case 'path':
      return containsPath(node, x, y);
    case 'sprite':
      return containsSprite(node, x, y);
    case 'group':
      return false;
  }
}

function containsRect(n: RectNode, x: number, y: number): boolean {
  return x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height;
}

function containsEllipse(n: EllipseNode, x: number, y: number): boolean {
  if (n.rx <= 0 || n.ry <= 0) return false;
  const dx = (x - n.cx) / n.rx;
  const dy = (y - n.cy) / n.ry;
  return dx * dx + dy * dy <= 1;
}

function containsLine(n: LineNode, x: number, y: number): boolean {
  const tol = n.stroke.width / 2 + 2;
  for (let i = 0; i < n.points.length - 2; i += 2) {
    const x1 = n.points[i];
    const y1 = n.points[i + 1];
    const x2 = n.points[i + 2];
    const y2 = n.points[i + 3];
    if (distancePointToSegment(x, y, x1, y1, x2, y2) <= tol) return true;
  }
  return false;
}

function containsPath(n: PathNode, x: number, y: number): boolean {
  // Even-odd rule on closed polygon.
  let inside = false;
  const pts = n.points;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i];
    const yi = pts[i + 1];
    const xj = pts[j];
    const yj = pts[j + 1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function containsSprite(n: SpriteNode, x: number, y: number): boolean {
  return x >= 0 && x <= n.width && y >= 0 && y <= n.height;
}

function distancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
