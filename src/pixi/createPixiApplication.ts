import * as PIXI from 'pixi.js-legacy';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../app/constants';

export function createPixiApplication(mount: HTMLElement): PIXI.Application {
  const app = new PIXI.Application({
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    backgroundColor: 0xffffff,
    antialias: true,
    forceCanvas: true, // requirement: Canvas2D renderer
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  const view = app.view as HTMLCanvasElement;
  view.style.width = '100%';
  view.style.maxWidth = `${STAGE_WIDTH}px`;
  view.style.height = '400px';
  view.style.display = 'block';
  view.style.margin = '0 auto';
  mount.appendChild(view);

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  return app;
}
