import type { CanvasKit } from 'canvaskit-wasm';
import { setupUi } from '../ui/setupUi';
import { createPixiApplication } from '../pixi/createPixiApplication';
import { createDemoScene } from '../pixi/createDemoScene';
import { createRandomGraphic } from '../pixi/createRandomGraphic';
import { SceneState } from '../pixi/sceneState';
import { pixiToSceneTree } from '../pixi/pixiToSceneTree';
import { initSkia } from '../skia/initSkia';
import { SkiaSurfaceRenderer } from '../skia/skiaRenderer';
import { hasPDFBackend } from '../skia/canvaskitPdf';
import { InteractiveRegistry } from '../events/interactiveRegistry';
import { attachSkiaPointerEvents } from '../events/skiaPointerEvents';
import { exportSceneToPdf, downloadPdf } from '../pdf/exportToPdf';
import { PDF_FILENAME, STAGE_HEIGHT, STAGE_WIDTH } from './constants';
import { SceneNode } from '../scene/sceneTree';

export async function createApp(): Promise<void> {
  const ui = setupUi();
  ui.logger.setStatus('Loading CanvasKit…');

  const pixi = createPixiApplication(ui.pixiMount);
  const state = new SceneState();
  pixi.stage.addChild(state.root);
  state.initialize(
    createDemoScene(ui.logger.log.bind(ui.logger), () => state.emit()),
  );

  let renderer: SkiaSurfaceRenderer | null = null;
  let ck: CanvasKit | null = null;
  let customWasm = false;
  const registry = new InteractiveRegistry();
  let currentScene: SceneNode | null = null;

  let rafToken = 0;
  const scheduleRender = (): void => {
    if (rafToken) return;
    rafToken = requestAnimationFrame(() => {
      rafToken = 0;
      if (!renderer) return;
      currentScene = pixiToSceneTree(state.root, registry);
      renderer.render(currentScene);
      const pdfBackend =
        ck && hasPDFBackend(ck) ? 'SkPDF' : 'pdf-lib (fallback)';
      ui.logger.setStatus(
        `Ready · ${state.countDisplayObjects()} display objects · PDF: ${pdfBackend}`,
      );
    });
  };

  try {
    const init = await initSkia();
    ck = init.ck;
    customWasm = init.custom;
    renderer = new SkiaSurfaceRenderer(ck, ui.skiaCanvas);
    ui.logger.log(
      customWasm
        ? 'info: custom CanvasKit (SkPDF) loaded from /canvaskit/'
        : 'info: stock canvaskit-wasm loaded — PDF will use pdf-lib fallback',
    );
  } catch (err) {
    ui.logger.setStatus('Skia init failed');
    ui.logger.log(`info: Skia init error: ${String(err)}`);
    return;
  }

  attachSkiaPointerEvents({
    canvas: ui.skiaCanvas,
    registry,
    getScene: () => currentScene,
    onLog: ui.logger.log.bind(ui.logger),
  });

  state.onChange(scheduleRender);
  scheduleRender();

  ui.btnRandom.addEventListener('click', () => {
    const g = createRandomGraphic(ui.logger.log.bind(ui.logger));
    state.addRandom(g);
    ui.logger.log(`info: added ${g.name}`);
  });

  ui.btnReset.addEventListener('click', () => {
    state.clearRandom();
    ui.logger.log('info: scene reset');
  });

  ui.btnClearLog.addEventListener('click', () => ui.logger.clear());

  ui.btnPdf.addEventListener('click', async () => {
    if (!ck || !currentScene) return;
    ui.btnPdf.disabled = true;
    try {
      const result = await exportSceneToPdf(ck, currentScene, STAGE_WIDTH, STAGE_HEIGHT);
      downloadPdf(result.bytes, PDF_FILENAME);
      ui.logger.log(`info: PDF exported via ${result.backend}`);
    } catch (err) {
      ui.logger.log(`info: PDF export error: ${String(err)}`);
    } finally {
      ui.btnPdf.disabled = false;
    }
  });
}
