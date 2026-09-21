#!/bin/sh
# Compila el demo completo: WASM del cliente + HTML del servidor.
#
#   ./build.sh && python3 -m http.server 8080
set -e
cd "$(dirname "$0")"

# El CSS lo extrae la macro al compilar. Se limpia antes para que no queden
# hojas de versiones anteriores del template.
rm -rf target/ascua-css
touch src/app.rs

echo "→ cliente (wasm)"
../../scripts/cargo.sh build --release --target wasm32-unknown-unknown --lib
wasm-bindgen --target web --no-typescript --out-dir pkg \
    target/wasm32-unknown-unknown/release/demo.wasm

echo "→ servidor (html)"
../../scripts/cargo.sh run --quiet --bin generar

ls -lh pkg/demo_bg.wasm
