#!/bin/sh
# Genera el sitio: WASM de las islas + HTML del servidor.
#
#   ./build.sh && stil run dev
set -e
cd "$(dirname "$0")"

# Un target compartido con el demo. No es solo por ahorrar espacio: en macOS,
# compilar un build script desde cero suele morir con SIGKILL por la firma ad
# hoc del linker, y reutilizar un target donde ya se ejecutaron correctamente
# evita el problema entero. Ver scripts/cargo-runner-macos.sh.
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$(cd .. && pwd)/.target-web}"

# El CSS lo extrae la macro al compilar; se limpia para no arrastrar hojas de
# versiones anteriores del template.
rm -rf target/ascua-css
touch src/contenido.rs

echo "→ islas (wasm)"
cargo build --release --target wasm32-unknown-unknown --lib
wasm-bindgen --target web --no-typescript --out-dir pkg \
    "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/sitio.wasm"

echo "→ html (servidor)"
cargo run --quiet --bin generar

ls -lh pkg/sitio_bg.wasm
