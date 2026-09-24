#!/usr/bin/env bash
# Instala las dependencias de terceros de uno o varios directorios del repo.
#
# Los paquetes de Ascua se apartan mientras se instala: dentro del repositorio tienen
# que ser las de packages/, no las publicadas —los tests prueban el código de
# ahora—, y las pone después scripts/enlazar-paquetes.sh. Sin apartarlas, el
# gestor iría a buscarlas al registro.
#
# Usa stil si está, y npm si no, que es el caso del CI.
#
#   bash scripts/instalar-dependencias.sh packages/check examples/ssr-ts
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${STIL_STORE:-}" ] && [ -d /Volumes/Working/.stil-store ]; then
  export STIL_STORE=/Volumes/Working/.stil-store
fi

for dir in "$@"; do
  cd "$raiz/$dir"
  cp package.json package.json.original
  trap 'mv -f package.json.original package.json' EXIT
  node -e '
    const fs = require("fs");
    const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
    for (const campo of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const nombre of Object.keys(p[campo] ?? {})) {
        if (nombre === "ascua" || nombre.startsWith("ascua-") || nombre === "vite-plugin-ascua") delete p[campo][nombre];
      }
    }
    fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
  '
  if command -v stil >/dev/null 2>&1; then
    stil install > /dev/null
  else
    npm install --no-audit --no-fund --ignore-scripts --no-package-lock --loglevel=error
  fi
  mv -f package.json.original package.json
  trap - EXIT
done

bash "$raiz/scripts/enlazar-paquetes.sh"
