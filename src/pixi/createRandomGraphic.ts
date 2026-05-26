import * as PIXI from 'pixi.js-legacy';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../app/constants';

const PALETTE = [0xef4444, 0x10b981, 0x3b82f6, 0xf59e0b, 0x8b5cf6, 0xec4899];

type Kind = 'rect' | 'ellipse' | 'line';

export function createRandomGraphic(onLog: (msg: string) => void): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const kinds: Kind[] = ['rect', 'ellipse', 'line'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];

  if (kind === 'rect') {
    const w = 30 + Math.random() * 80;
    const h = 30 + Math.random() * 80;
    g.beginFill(color, 0.85).drawRect(-w / 2, -h / 2, w, h).endFill();
  } else if (kind === 'ellipse') {
    const rx = 20 + Math.random() * 60;
    const ry = 20 + Math.random() * 60;
    g.beginFill(color, 0.85).drawEllipse(0, 0, rx, ry).endFill();
  } else {
    const len = 60 + Math.random() * 100;
    g.lineStyle(2 + Math.random() * 6, color, 1).moveTo(0, 0).lineTo(len, 0);
  }

  g.position.set(
    60 + Math.random() * (STAGE_WIDTH - 120),
    60 + Math.random() * (STAGE_HEIGHT - 120),
  );
  g.angle = Math.random() * 360;
  g.scale.set(0.7 + Math.random() * 0.8);

  const id = `rand-${Math.random().toString(36).slice(2, 7)}`;
  g.name = id;
  g.eventMode = 'static';
  g.cursor = 'pointer';
  g.on('pointerdown', () => onLog(`pixi: ${id} pointerdown`));
  g.on('pointerup', () => onLog(`pixi: ${id} pointerup`));

  return g;
}
