#!/bin/bash
# SimCoupe WASM Run Script for Linux/macOS
echo "Prefetching third-party library media..."
if ! node tools/prefetch-media.mjs; then
    echo "WARNING: media prefetch failed; those titles will have no playable image."
fi
echo "Starting local web server at http://localhost:8000"
python3 -m http.server --directory wasm/deploy
