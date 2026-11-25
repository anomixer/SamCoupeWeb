@echo off
REM SimCoupe WASM Run Script for Windows
echo Prefetching third-party library media...
node tools/prefetch-media.mjs
if errorlevel 1 echo WARNING: media prefetch failed; those titles will have no playable image.
echo Starting local web server at http://localhost:8000
python -m http.server --directory wasm/deploy
