#!/usr/bin/env bash
# Enlaza los paquetes de Ascua del repositorio en cada sitio que los usa.
#
# Los ejemplos, el sitio y el playground importan `vite-plugin-ascua`,
# `ascua-compilador` y compañía como si vinieran de npm, pero en el
# repositorio tienen que ser los de `packages/`: si no, un cambio en el
# compilador no se probaría hasta publicarlo. Esto crea los symlinks en el
# `node_modules/` de cada uno. Se ejecuta después de instalar las
# dependencias, que borran lo que no conocen.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# El nombre en npm de cada directorio de packages/.
nombre() {
  case "$1" in
    runtime) echo ascua ;;
    vite-plugin) echo vite-plugin-ascua ;;
    *) echo "ascua-$1" ;;
  esac
}

enlazar() {
  local sitio="$1"
  shift
  mkdir -p "$raiz/$sitio/node_modules"
  # Los enlaces de antes del cambio de nombre, cuando todo iba bajo @ascua/.
  rm -rf "$raiz/$sitio/node_modules/@ascua"
  for paquete in "$@"; do
    ln -sfn "$raiz/packages/$paquete" "$raiz/$sitio/node_modules/$(nombre "$paquete")"
  done
}

enlazar packages/router     runtime
enlazar packages/testing    runtime
enlazar packages/check      compilador
enlazar packages/ts-plugin  compilador
enlazar examples/contador-ts compilador vite-plugin
enlazar examples/panel-ts   compilador vite-plugin router testing
enlazar examples/ssr-ts     compilador vite-plugin
enlazar web                 compilador vite-plugin
enlazar playground          compilador vite-plugin
enlazar benchmarks/ascua    compilador vite-plugin
