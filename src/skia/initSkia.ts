import InitCanvasKit, { CanvasKit } from 'canvaskit-wasm';
import canvasKitNpmWasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url';

/**
 * Two-tier CanvasKit loader:
 *
 *   1. If `/canvaskit/canvaskit.js` exists, load THAT JS glue + wasm.
 *      This is our custom build (build-canvaskit-pdf/) that includes the
 *      SkPDF backend. The custom glue and wasm must be loaded as a pair
 *      because Embind bindings are baked into both halves.
 *
 *   2. Otherwise fall back to the npm `canvaskit-wasm` package. PDF export
 *      will then transparently fall through to the pdf-lib vector writer.
 *
 * `cached` deduplicates concurrent init calls.
 */

declare global {
  interface Window {
    CanvasKitInit?: (opts: { locateFile: (path: string) => string }) => Promise<CanvasKit>;
  }
}

let cached: Promise<{ ck: CanvasKit; custom: boolean }> | null = null;

export function initSkia(): Promise<{ ck: CanvasKit; custom: boolean }> {
  if (cached) return cached;
  cached = load();
  return cached;
}

async function load(): Promise<{ ck: CanvasKit; custom: boolean }> {
  const custom = await tryLoadCustom();
  if (custom) return { ck: custom, custom: true };
  const ck = await InitCanvasKit({ locateFile: () => canvasKitNpmWasmUrl });
  return { ck, custom: false };
}

async function tryLoadCustom(): Promise<CanvasKit | null> {
  // Use Vite's BASE_URL so the custom build resolves correctly both at the
  // dev-server root ('/') and under a subpath ('/sboard-test-task/' on GH Pages).
  const base = import.meta.env.BASE_URL; // ends with '/'
  const jsUrl = `${base}canvaskit/canvaskit.js`;
  const wasmUrl = `${base}canvaskit/canvaskit.wasm`;

  // Probe for the custom build. We can't rely on HEAD status alone because
  // Vite's dev server returns 200 + text/html for any missing path (SPA
  // fallback). Verify the content-type too.
  let head: Response;
  try {
    head = await fetch(jsUrl, { method: 'HEAD' });
  } catch {
    return null;
  }
  if (!head.ok) return null;
  const ctype = head.headers.get('content-type') ?? '';
  if (!/javascript|ecmascript/i.test(ctype)) return null;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-canvaskit="custom"]');
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = jsUrl;
    s.dataset.canvaskit = 'custom';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load custom canvaskit.js'));
    document.head.appendChild(s);
  });

  const init = window.CanvasKitInit;
  if (typeof init !== 'function') {
    console.warn('Custom canvaskit.js loaded but did not expose CanvasKitInit');
    return null;
  }
  return init({ locateFile: () => wasmUrl });
}
