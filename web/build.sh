#!/bin/sh
# Construye el sitio: el playground, la página y la documentación.
set -e
cd "$(dirname "$0")"

# stil donde lo hay; npm donde no, que es el CI. El store va al que ya existe
# en este volumen, si existe: clonefile no cruza volúmenes.
if command -v stil >/dev/null 2>&1; then
  if [ -z "${STIL_STORE:-}" ] && [ -d /Volumes/Working/.stil-store ]; then
    export STIL_STORE=/Volumes/Working/.stil-store
  fi
  correr() { stil run "$@"; }
  ejecutar() { stil exec "$@"; }
else
  correr() { npm run --silent "$@"; }
  ejecutar() { npx --no-install "$@"; }
fi

echo "→ playground (compilador wasm)"
( cd ../playground && correr build >/dev/null )
rm -rf public/playground
mkdir -p public
cp -R ../playground/dist public/playground

echo "→ sitio"
ejecutar vite build

echo "→ documentación"
node scripts/docs.mjs
