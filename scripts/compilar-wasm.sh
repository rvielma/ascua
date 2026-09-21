#!/usr/bin/env bash
# El compilador como módulo WebAssembly.
#
# Genera los dos destinos de `@ascua/compilador`: `pkg/` para Node (lo que usa
# el plugin de Vite) y `web/` para el navegador (lo que usa el playground). Es
# el mismo .wasm en los dos sitios; lo que cambia es el envoltorio que genera
# wasm-bindgen.
#
# Hay que ejecutarlo **siempre que cambie el compilador**: si no, el plugin
# seguirá usando el artefacto viejo y las plantillas nuevas se compilarán con
# las reglas de antes, sin avisar de nada.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

cargo build -p ascua-compilador --features wasm --target wasm32-unknown-unknown --release
wasm="target/wasm32-unknown-unknown/release/ascua_compilador.wasm"

wasm-bindgen --target nodejs --out-dir packages/compilador/pkg --no-typescript "$wasm"
wasm-bindgen --target web    --out-dir packages/compilador/web --no-typescript "$wasm"

# wasm-bindgen deja un .gitignore y un package.json que no pintan nada aquí:
# el paquete se publica desde packages/compilador/package.json.
rm -f packages/compilador/{pkg,web}/{.gitignore,package.json}

printf '\n%s\n' "$(ls -l packages/compilador/pkg/*.wasm | awk '{print $5 " bytes  " $9}')"
