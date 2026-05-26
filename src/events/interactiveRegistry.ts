import type * as PIXI from 'pixi.js-legacy';

/**
 * Maps stable ids (PIXI.DisplayObject.name or a generated id) back to the
 * original PIXI.DisplayObject so the Skia-side event system can dispatch
 * events onto them via PIXI's EventEmitter.
 */
export class InteractiveRegistry {
  private readonly map = new Map<string, PIXI.DisplayObject>();

  clear(): void {
    this.map.clear();
  }

  register(id: string, obj: PIXI.DisplayObject): void {
    this.map.set(id, obj);
  }

  resolve(id: string): PIXI.DisplayObject | undefined {
    return this.map.get(id);
  }
}
