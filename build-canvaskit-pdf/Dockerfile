# Reproducible build environment for CanvasKit-wasm + SkPDF backend.
#
#   docker build -t canvaskit-pdf-builder ./build-canvaskit-pdf
#   docker run --rm -v "$(pwd)/public/canvaskit:/output" canvaskit-pdf-builder
#
# Produces /output/canvaskit.js and /output/canvaskit.wasm.
#
# Uses the official `emscripten/emsdk` image as a base. It is multi-arch
# (linux/amd64 + linux/arm64) so Apple Silicon and Linux servers both work
# natively — we don't need Rosetta and we don't depend on upstream emsdk
# distributing arm64 binaries for older versions.
#
# Pinned version `3.1.74` is a recent emsdk known to compile Skia HEAD on
# both architectures. If Skia HEAD moves to require a newer emsdk, bump the
# FROM tag.
#
# First build is slow (~30–60 min; downloads ~5 GB of Skia + deps and
# compiles them). Subsequent rebuilds reuse Docker layers for everything
# except the bindings + build.sh layer and finish in minutes.

FROM emscripten/emsdk:3.1.74

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8

# Skia needs ninja, lbzip2 (for xz/bz2 unpacking inside git-sync-deps), and
# pkg-config. Everything else (python3, git, build-essential, emcc, node) is
# already in emscripten/emsdk.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ninja-build pkg-config lbzip2 \
    && rm -rf /var/lib/apt/lists/*

# --- Git tuning so deep concurrent fetches over Docker-on-mac's vpnkit
#     network don't trip "fatal: remote transport reported error". ---
RUN git config --global http.postBuffer 524288000 \
    && git config --global http.lowSpeedLimit 1000 \
    && git config --global http.lowSpeedTime 600 \
    && git config --global http.version HTTP/1.1

# --- depot_tools (provides gn helper, gclient, etc.) ---
ENV PATH="/depot_tools:${PATH}"
RUN git clone --depth 1 https://chromium.googlesource.com/chromium/tools/depot_tools.git /depot_tools

# --- Skia checkout (cached layer) ---
ENV SKIA_DIR=/skia
RUN git clone --depth 1 https://skia.googlesource.com/skia.git ${SKIA_DIR}

# Sync third-party deps once so this expensive step is cached. git-sync-deps
# fan-outs to ~50 git repos in parallel; on flaky links the first try often
# loses a connection mid-stream. Retry up to 5 times with backoff.
WORKDIR ${SKIA_DIR}

# Force git-sync-deps to clone sequentially. Skia's script fans out ~10
# concurrent git fetches which routinely tip over Docker-on-mac's vpnkit
# network ("fatal: remote transport reported error"). Single-thread is
# slower but reliable; retries are idempotent because git-sync-deps detects
# already-cloned deps and just does a fetch the second time around.
COPY sync-deps-sequential.py /usr/local/bin/sync-deps-sequential.py
RUN chmod +x /usr/local/bin/sync-deps-sequential.py

RUN set -e; \
    for i in 1 2 3 4 5 6 7 8; do \
        echo "[git-sync-deps] attempt $i (sequential)…"; \
        if python3 /usr/local/bin/sync-deps-sequential.py; then exit 0; fi; \
        echo "[git-sync-deps] attempt $i failed, sleeping 20s"; \
        sleep 20; \
    done; \
    echo "[git-sync-deps] all 8 retries exhausted"; \
    exit 1

# --- Our build context (changes here invalidate only this layer) ---
WORKDIR /build
COPY build.sh canvaskit_pdf_bindings.cpp gn_args.txt ./
RUN chmod +x build.sh

ENV OUT_DIR=/output
RUN mkdir -p ${OUT_DIR}
VOLUME ["/output"]

CMD ["/build/build.sh"]
