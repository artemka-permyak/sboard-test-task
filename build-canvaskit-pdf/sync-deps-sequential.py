#!/usr/bin/env python3
"""
Run Skia's tools/git-sync-deps with parallelism forced to 1.

Why: on Docker-for-mac the vpnkit/gvisor network stack cannot keep ~10
concurrent git fetches alive. git-sync-deps has no `-j` flag and pins the
thread count internally, so we monkey-patch the executors before exec'ing
the upstream script.

Idempotent: a partial run from a previous attempt is fine — git-sync-deps
fetches existing checkouts in place instead of re-cloning.
"""
import os
import sys

# Monkey-patch BOTH executors that git-sync-deps may use.
# multiprocessing.dummy.Pool was the older API, concurrent.futures the new one.
import multiprocessing.dummy as _mpd

_OrigPool = _mpd.Pool
def _SerialPool(*_a, **_kw):
    return _OrigPool(1)
_mpd.Pool = _SerialPool

import concurrent.futures as _cf

_OrigTPE = _cf.ThreadPoolExecutor
class _SerialTPE(_OrigTPE):  # type: ignore[misc]
    def __init__(self, max_workers=None, *a, **kw):
        super().__init__(max_workers=1, *a, **kw)
_cf.ThreadPoolExecutor = _SerialTPE  # type: ignore[assignment]


def main() -> int:
    script = os.environ.get("SKIA_DIR", "/skia") + "/tools/git-sync-deps"
    if not os.path.exists(script):
        print(f"sync-deps-sequential: cannot find {script}", file=sys.stderr)
        return 2
    with open(script) as f:
        code = compile(f.read(), script, "exec")
    sys.argv = [script]
    globals_for_script = {"__name__": "__main__", "__file__": script}
    exec(code, globals_for_script)  # noqa: S102
    return 0


if __name__ == "__main__":
    sys.exit(main())
