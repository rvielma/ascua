#!/usr/bin/env bash
# Todo lo que hay que comprobar antes de registrar o publicar, en local.
#
# Es lo que haría un CI, sin depender de uno: Rust (formato, clippy, tests y
# la versión mínima), el compilador en WebAssembly, las suites de TypeScript,
# ascua-check sobre los ejemplos y el build del sitio con su documentación.
#
#   bash scripts/verificar.sh            # todo
#   bash scripts/verificar.sh --rapido   # sin MSRV ni el build del sitio
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

rapido=false
[[ "${1:-}" == "--rapido" ]] && rapido=true

paso() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }

paso "Rust: formato, clippy y tests"
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --quiet 2>&1 | grep -E "^test result" | awk '{s+=$4; f+=$6} END {print "  " s " tests, " f " fallidos"; exit f > 0}'

if ! $rapido; then
  # La versión mínima que declara Cargo.toml.
  msrv=$(grep -m1 '^rust-version' Cargo.toml | cut -d'"' -f2)
  if rustup toolchain list | grep -q "^$msrv"; then
    paso "Rust $msrv (la versión mínima)"
    cargo "+$msrv" check --workspace --all-targets --quiet
  else
    echo "  (sin la toolchain $msrv: rustup toolchain install $msrv --profile minimal)"
  fi
fi

paso "El compilador: nativo y WebAssembly"
cargo build --quiet --bin ascuac
bash scripts/compilar-wasm.sh | tail -1

paso "Enlaces a packages/"
bash scripts/enlazar-paquetes.sh

paso "Tipos del runtime"
(cd packages/runtime && npx --no-install tsc --noEmit -p tsconfig.build.json)

paso "Tests de TypeScript"
for dir in packages/runtime packages/router packages/testing packages/check packages/ts-plugin \
           examples/panel-ts examples/ssr-ts; do
  printf '  %-22s' "$dir"
  (cd "$dir" && npx --no-install vitest run 2>&1 | grep -E "Tests " || { npx --no-install vitest run; exit 1; })
done

paso "ascua-check sobre los ejemplos"
for dir in examples/panel-ts examples/ssr-ts; do
  printf '  %-22s' "$dir"
  (cd "$dir" && node ../../packages/check/bin/ascua-check.js | tail -1)
done

if ! $rapido; then
  paso "Build del ejemplo SSR"
  (cd examples/ssr-ts && npx --no-install vite build --outDir dist/cliente >/dev/null \
    && npx --no-install vite build --ssr src/entrada-servidor.ts --outDir dist/servidor >/dev/null)
  echo "  ok"

  paso "Sitio y documentación"
  sh web/build.sh | grep -E "páginas"
fi

printf '\n\033[32m✓ todo en orden\033[0m\n'
