import * as PIXI from 'pixi.js-legacy';
import { DEMO_IMAGE_URL } from '../app/constants';

type LogFn = (msg: string) => void;

export function createDemoScene(onLog: LogFn, onSpriteReady: () => void): PIXI.Container {
  const mainContainer = new PIXI.Container();
  const subContainer = new PIXI.Container();

  const g1 = new PIXI.Graphics();
  const g2 = new PIXI.Graphics();
  const g3 = new PIXI.Graphics();
  const g4 = new PIXI.Graphics();

  g1.beginFill(0xff0000).drawEllipse(0, 0, 80, 40).endFill();
  g1.position.set(200, 100);
  g1.angle = 30;
  makeInteractive(g1, 'g1', onLog);

  g2.beginFill(0x0000ff).drawRect(-25, -35, 50, 70).endFill();
  g2.position.set(120, 60);
  g2.angle = 15;
  g2.scale.set(1.2, 1.4);
  makeInteractive(g2, 'g2', onLog);

  g3.lineStyle(6, 0xff8800, 1).moveTo(0, 0).lineTo(100, 70);
  g3.angle = -20;
  makeInteractive(g3, 'g3', onLog);

  g4.lineStyle(6, 0x00aa00, 1).moveTo(0, 50).lineTo(120, -20);
  g4.angle = 20;
  makeInteractive(g4, 'g4', onLog);

  subContainer.position.set(75, 50);
  subContainer.addChild(g3, g4);

  mainContainer.addChild(subContainer, g1, g2);

  PIXI.Texture.fromURL(DEMO_IMAGE_URL)
    .then((tex) => {
      const sprite = new PIXI.Sprite(tex);
      sprite.width = 80;
      sprite.height = 80;
      sprite.position.set(420, 260);
      sprite.anchor.set(0.5);
      sprite.angle = -10;
      makeInteractive(sprite, 'sprite', onLog);
      mainContainer.addChild(sprite);
      onSpriteReady();
    })
    .catch(() => {
      // Sprite is optional for MVP — if the PNG asset is missing, just skip it.
    });

  return mainContainer;
}

function makeInteractive(d: PIXI.DisplayObject, name: string, onLog: LogFn): void {
  d.eventMode = 'static';
  d.cursor = 'pointer';
  (d as PIXI.Container).name = name;
  d.on('pointerdown', () => onLog(`pixi: ${name} pointerdown`));
  d.on('pointerup', () => onLog(`pixi: ${name} pointerup`));
}
