#!/usr/bin/env bash
# Publica los seis paquetes de Ascua en npm, en el orden en que dependen.
#
# Antes de correrlo, una sola vez:
#
#   npm login                      # stil no cubre `publish`; esto es de npm
#
# y el scope `@ascua` tiene que ser tuyo: o tu usuario de npm se llama
# `ascua`, o creas la organización `ascua` en npmjs.com (gratis para paquetes
# públicos) y publicas como miembro de ella.
#
# Con `--dry-run` no publica nada: enseña exactamente qué archivos iría a
# subir cada paquete. Conviene mirarlo antes de la primera vez, porque lo que
# se publica en npm no se puede reemplazar, solo deprecar.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

seco=""
if [[ "${1:-}" == "--dry-run" ]]; then
  seco="--dry-run"
fi

echo "==> El compilador, a WebAssembly"
./scripts/compilar-wasm.sh > /dev/null

echo "==> El runtime, a dist/"
(cd packages/runtime && rm -rf dist && stil run build)

echo "==> El router, a dist/"
(cd packages/router && rm -rf dist && stil run build)

echo "==> El paquete de testing, a dist/"
(cd packages/testing && rm -rf dist && stil run build)

# El orden importa: el plugin depende del compilador, así que el compilador
# tiene que existir en el registro antes de que se resuelva el plugin.
for paquete in compilador runtime router testing vite-plugin check; do
  echo "==> npm publish @ascua/$paquete"
  (cd "packages/$paquete" && npm publish --access public $seco)
done

echo
echo "Listo. Comprobación de que lo publicado sirve para algo:"
echo "  mkdir /tmp/prueba && cd /tmp/prueba && stil add @ascua/runtime"
