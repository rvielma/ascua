#!/bin/sh
# Construye el sitio: el playground y luego la página.
set -e
cd "$(dirname "$0")"
export STIL_STORE="${STIL_STORE:-/Volumes/Working/.stil-store}"

echo "→ playground (compilador wasm)"
( cd ../playground && stil run build >/dev/null )
rm -rf public/playground
mkdir -p public
cp -R ../playground/dist public/playground

echo "→ sitio"
stil exec vite build
