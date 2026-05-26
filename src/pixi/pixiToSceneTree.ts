import * as PIXI from 'pixi.js-legacy';
import {
  EllipseNode,
  GroupNode,
  LineNode,
  Mat2D,
  PathNode,
  RectNode,
  SceneNode,
  SpriteNode,
} from '../scene/sceneTree';
import { InteractiveRegistry } from '../events/interactiveRegistry';

/**
 * Walks a PIXI.Container tree and produces an immutable Scene Tree snapshot.
 *
 * `any` is used in two spots that touch Pixi internals:
 *  - `geometry.graphicsData` — undocumented but stable in pixi.js 7.x and is
 *    the only way to introspect what beginFill/drawRect/moveTo recorded.
 *  - `shape.type` — numeric tag from PIXI.SHAPES enum.
 */
export function pixiToSceneTree(
  root: PIXI.Container,
  registry: InteractiveRegistry,
): GroupNode {
  registry.clear();
  let counter = 0;
  const nextId = (): string => `n${counter++}`;

  const convert = (obj: PIXI.DisplayObject): SceneNode | null => {
    obj.transform.updateLocalTransform();
    const lt = obj.transform.localTransform;
    const transform: Mat2D = {
      a: lt.a, b: lt.b, c: lt.c, d: lt.d, tx: lt.tx, ty: lt.ty,
    };

    const base = {
      id: nextId(),
      transform,
      alpha: obj.alpha,
      visible: obj.visible,
    };

    const pixiId = (obj as PIXI.Container).name || base.id;
    if (obj.eventMode === 'static' || obj.eventMode === 'dynamic') {
      registry.register(pixiId, obj);
    }

    if (obj instanceof PIXI.Graphics) {
      const children = convertGraphics(obj, nextId, pixiId);
      return { ...base, type: 'group', children, pixiId };
    }

    if (obj instanceof PIXI.Sprite) {
      const baseTex = obj.texture.baseTexture;
      const resource = baseTex.resource as unknown as { source?: unknown };
      const src = resource?.source;
      if (!(src instanceof HTMLImageElement)) {
        return wrapEmpty(base, pixiId);
      }
      const sprite: SpriteNode = {
        id: nextId(),
        transform: {
          a: 1, b: 0, c: 0, d: 1,
          tx: -obj.anchor.x * obj.width,
          ty: -obj.anchor.y * obj.height,
        },
        alpha: 1,
        visible: true,
        type: 'sprite',
        image: src,
        width: obj.width,
        height: obj.height,
        pixiId,
      };
      return { ...base, type: 'group', children: [sprite], pixiId };
    }

    if (obj instanceof PIXI.Container) {
      const children: SceneNode[] = [];
      for (const ch of obj.children) {
        const node = convert(ch);
        if (node) children.push(node);
      }
      return { ...base, type: 'group', children, pixiId };
    }

    return null;
  };

  const node = convert(root);
  if (!node || node.type !== 'group') {
    return identityGroup();
  }
  return node;
}

function identityGroup(): GroupNode {
  return {
    type: 'group',
    id: 'root',
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    alpha: 1,
    visible: true,
    children: [],
  };
}

function wrapEmpty(
  base: { id: string; transform: Mat2D; alpha: number; visible: boolean },
  pixiId: string,
): GroupNode {
  return { ...base, type: 'group', children: [], pixiId };
}

function colorToHex(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

function convertGraphics(g: PIXI.Graphics, nextId: () => string, pixiId: string): SceneNode[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (g.geometry as any).graphicsData as Array<{
    shape: { type: number; [k: string]: unknown };
    fillStyle: { visible: boolean; color: number; alpha: number };
    lineStyle: { visible: boolean; color: number; alpha: number; width: number };
  }>;
  const out: SceneNode[] = [];

  for (const item of data) {
    const fill = item.fillStyle?.visible
      ? { color: colorToHex(item.fillStyle.color), alpha: item.fillStyle.alpha }
      : undefined;
    const stroke = item.lineStyle?.visible
      ? {
          color: colorToHex(item.lineStyle.color),
          alpha: item.lineStyle.alpha,
          width: item.lineStyle.width,
        }
      : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = item.shape as any;
    const baseId = nextId();
    const id0 = identity();

    // PIXI.SHAPES: POLY=0, RECT=1, CIRC=2, ELIP=3, RREC=4
    switch (shape.type) {
      case 1: {
        const r: RectNode = {
          id: baseId, transform: id0, alpha: 1, visible: true, pixiId,
          type: 'rect',
          x: shape.x, y: shape.y, width: shape.width, height: shape.height,
          fill, stroke,
        };
        out.push(r);
        break;
      }
      case 2: {
        const e: EllipseNode = {
          id: baseId, transform: id0, alpha: 1, visible: true, pixiId,
          type: 'ellipse',
          cx: shape.x, cy: shape.y, rx: shape.radius, ry: shape.radius,
          fill, stroke,
        };
        out.push(e);
        break;
      }
      case 3: {
        const e: EllipseNode = {
          id: baseId, transform: id0, alpha: 1, visible: true, pixiId,
          type: 'ellipse',
          cx: shape.x, cy: shape.y, rx: shape.width, ry: shape.height,
          fill, stroke,
        };
        out.push(e);
        break;
      }
      case 0: {
        const points: number[] = [...(shape.points as number[])];
        if (!fill && stroke) {
          const l: LineNode = {
            id: baseId, transform: id0, alpha: 1, visible: true, pixiId,
            type: 'line', points, stroke,
          };
          out.push(l);
        } else {
          const p: PathNode = {
            id: baseId, transform: id0, alpha: 1, visible: true, pixiId,
            type: 'path', points, fill, stroke,
          };
          out.push(p);
        }
        break;
      }
      default:
        // RREC etc — skip for MVP.
        break;
    }
  }

  return out;
}

function identity(): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}
