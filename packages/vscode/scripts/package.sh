#!/bin/sh
# Empaqueta la extensión: un .vsix con ascua-ts-plugin y ascua-compilador
# dentro, copiados de packages/ —lo mismo que se publica en npm—.
#
#   sh packages/vscode/scripts/package.sh [directorio de salida]
#
# Sin los node_modules de stil: vsce los recorre con `npm list` y no entiende
# los enlaces al store, así que se arma una carpeta aparte con archivos reales.
set -e
# La salida, relativa a donde se llama; sin argumento, packages/vscode/dist.
if [ -n "${1:-}" ]; then SALIDA="$(mkdir -p "$1" && cd "$1" && pwd)"; fi
cd "$(dirname "$0")/.."
SALIDA="${SALIDA:-$(mkdir -p dist && cd dist && pwd)}"
VERSION="$(node -p 'require("./package.json").version')"

ARMADO="$(mktemp -d)"
trap 'rm -rf "$ARMADO"' EXIT

cp package.json README.md LICENSE-MIT LICENSE-APACHE "$ARMADO/"
cp -R syntaxes "$ARMADO/"

# Cada paquete con lo que su package.json declara en `files`, como npm.
copiar() {
  origen="../$1"
  destino="$ARMADO/node_modules/$2"
  mkdir -p "$destino"
  cp "$origen/package.json" "$destino/"
  for f in $(node -p "require('$origen/package.json').files.join(' ')"); do
    cp -R "$origen/$f" "$destino/"
  done
}
copiar ts-plugin ascua-ts-plugin
copiar compilador ascua-compilador
# El navegador no hace falta: el plugin usa el módulo de Node.
rm -rf "$ARMADO/node_modules/ascua-compilador/web"

# vsce está en npm; con stil, sin la espera de 7 días que no aplica a una
# herramienta de empaquetado.
( cd "$ARMADO" && stil dlx @vscode/vsce --yes -- package --skip-license \
    --allow-missing-repository -o "$SALIDA/ascua-vscode-$VERSION.vsix" )
echo "$SALIDA/ascua-vscode-$VERSION.vsix"
