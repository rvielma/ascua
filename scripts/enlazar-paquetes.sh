#!/usr/bin/env bash
# Enlaza los paquetes @ascua/* del repositorio en cada sitio que los usa.
#
# Los ejemplos, el sitio y el playground importan `@ascua/vite-plugin`,
# `@ascua/compilador` y compañía como si vinieran de npm, pero en el
# repositorio tienen que ser los de `packages/`: si no, un cambio en el
# compilador no se probaría hasta publicarlo. Esto crea los symlinks en
# `node_modules/@ascua/` de cada uno. Se ejecuta después de instalar las
# dependencias, que borran lo que no conocen.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

enlazar() {
  local sitio="$1"
  shift
  mkdir -p "$raiz/$sitio/node_modules/@ascua"
  for paquete in "$@"; do
    ln -sfn "$raiz/packages/$paquete" "$raiz/$sitio/node_modules/@ascua/$paquete"
  done
}

enlazar packages/router     runtime
enlazar packages/testing    runtime
enlazar packages/check      compilador
enlazar examples/contador-ts compilador vite-plugin
enlazar examples/panel-ts   compilador vite-plugin router testing
enlazar examples/ssr-ts     compilador vite-plugin
enlazar web                 compilador vite-plugin
enlazar playground          compilador vite-plugin
