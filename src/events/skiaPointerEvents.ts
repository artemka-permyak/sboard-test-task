import type * as PIXI from 'pixi.js-legacy';
import { SceneNode } from '../scene/sceneTree';
import { hitTest } from './hitTest';
import { InteractiveRegistry } from './interactiveRegistry';

interface Deps {
  canvas: HTMLCanvasElement;
  registry: InteractiveRegistry;
  getScene: () => SceneNode | null;
  onLog: (msg: string) => void;
}

/**
 * Attaches pointerdown/up/move to the Skia canvas, translates client coords
 * to canvas-local coords, runs hit-test against the current scene tree, and
 * emits the matching PIXI event onto the original DisplayObject.
 */
export function attachSkiaPointerEvents(deps: Deps): () => void {
  const { canvas, registry, getScene, onLog } = deps;

  const toCanvas = (ev: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (ev.clientX - rect.left) * scaleX,
      y: (ev.clientY - rect.top) * scaleY,
    };
  };

  const dispatch = (type: 'pointerdown' | 'pointerup', ev: PointerEvent): void => {
    const scene = getScene();
    if (!scene) return;
    const { x, y } = toCanvas(ev);
    const hit = hitTest(scene, x, y);
    if (!hit) return;
    const obj = registry.resolve(hit.pixiId) as PIXI.DisplayObject | undefined;
    if (!obj) return;
    onLog(`skia: ${hit.pixiId} ${type}`);
    obj.emit(type, ev as unknown as PIXI.FederatedPointerEvent);
  };

  const onDown = (e: PointerEvent): void => dispatch('pointerdown', e);
  const onUp = (e: PointerEvent): void => dispatch('pointerup', e);
  const onMove = (e: PointerEvent): void => {
    const scene = getScene();
    if (!scene) return;
    const { x, y } = toCanvas(e);
    canvas.classList.toggle('hover-interactive', !!hitTest(scene, x, y));
  };
  const onLeave = (): void => canvas.classList.remove('hover-interactive');

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
  };
}
