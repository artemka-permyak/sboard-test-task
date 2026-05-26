import * as PIXI from 'pixi.js-legacy';

/**
 * Tracks the root container plus a "random layer" so reset can wipe only
 * randomly added shapes while preserving the demo scene.
 */
export class SceneState {
  readonly root: PIXI.Container;
  private readonly randomLayer: PIXI.Container;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.root = new PIXI.Container();
    this.randomLayer = new PIXI.Container();
  }

  initialize(demo: PIXI.Container): void {
    this.root.removeChildren();
    this.root.addChild(demo);
    this.root.addChild(this.randomLayer);
    this.emit();
  }

  addRandom(node: PIXI.DisplayObject): void {
    this.randomLayer.addChild(node);
    this.emit();
  }

  clearRandom(): void {
    this.randomLayer.removeChildren();
    this.emit();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    for (const fn of this.listeners) fn();
  }

  countDisplayObjects(): number {
    let n = 0;
    const walk = (node: PIXI.DisplayObject): void => {
      n++;
      if (node instanceof PIXI.Container) {
        for (const ch of node.children) walk(ch);
      }
    };
    walk(this.root);
    return n;
  }
}
