import { Logger } from './logger';

export interface UiHandles {
  btnRandom: HTMLButtonElement;
  btnReset: HTMLButtonElement;
  btnPdf: HTMLButtonElement;
  btnClearLog: HTMLButtonElement;
  pixiMount: HTMLElement;
  skiaCanvas: HTMLCanvasElement;
  logger: Logger;
}

export function setupUi(): UiHandles {
  const $ = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing #${id}`);
    return el as T;
  };
  const logger = new Logger($('event-log'), $('status'));
  return {
    btnRandom: $('btn-random'),
    btnReset: $('btn-reset'),
    btnPdf: $('btn-pdf'),
    btnClearLog: $('btn-clear-log'),
    pixiMount: $('pixi-mount'),
    skiaCanvas: $('skia-canvas') as HTMLCanvasElement,
    logger,
  };
}
