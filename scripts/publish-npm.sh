#!/usr/bin/env bash
# Publica los diez paquetes de Ascua en npm, en el orden en que dependen.
#
# Antes de correrlo, una sola vez:
#
#   npm login                      # stil no cubre `publish`; esto es de npm
#
# Los nombres van sin scope —`ascua`, `ascua-router`, `vite-plugin-ascua`…—:
# el scope `@ascua` es de otra organización.
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
bash scripts/build-wasm.sh > /dev/null

echo "==> El runtime, a dist/"
(cd packages/runtime && rm -rf dist && stil run build)

echo "==> El router, a dist/"
(cd packages/router && rm -rf dist && stil run build)

echo "==> ascua-query, a dist/"
(cd packages/query && rm -rf dist && stil run build)

echo "==> El paquete de testing, a dist/"
(cd packages/testing && rm -rf dist && stil run build)

# El orden importa: el plugin depende del compilador, así que el compilador
# tiene que existir en el registro antes de que se resuelva el plugin.
#
# Con doble factor, npm pide un código por publicación. Se pide aquí, después
# de construir, para que llegue fresco; si caduca a mitad de camino, se pide
# otro y se reintenta ese paquete. Lo que ya está publicado se salta, así que
# el script se puede volver a lanzar sin miedo.
otp=""
publicar() {
  local paquete="$1" nombre version
  nombre=$(node -p "require('./packages/$paquete/package.json').name")
  version=$(node -p "require('./packages/$paquete/package.json').version")

  if npm view "$nombre@$version" version >/dev/null 2>&1; then
    echo "==> $nombre@$version ya está publicado: se salta"
    return
  fi

  echo "==> npm publish $nombre@$version"
  while :; do
    local salida estado=0
    salida=$(cd "packages/$paquete" && npm publish --access public $seco ${otp:+--otp="$otp"} 2>&1) || estado=$?
    if [[ $estado -eq 0 ]]; then
      # La salida entera, y no solo la línea `+ paquete@versión`: npm avisa
      # ahí de lo que no es un error, como una publicación que queda en
      # espera de aprobación en vez de salir.
      echo "$salida" | sed 's/^/    /'
      if [[ -z "$seco" ]] && ! npm view "$nombre@$version" version >/dev/null 2>&1; then
        echo "    Aviso: npm aceptó $nombre@$version pero el registro todavía no lo muestra." >&2
        echo "    Puede estar propagándose (unos minutos) o en espera de aprobación en npmjs.com." >&2
      fi
      return
    fi
    if grep -q "EOTP" <<<"$salida"; then
      read -r -p "    código de doble factor (vacío para salir): " otp
      if [[ -z "$otp" ]]; then
        echo "    Sin código no se puede publicar. El código es el de la app de autenticación" >&2
        echo "    (la entrada «npm»), o usa un token granular con «Bypass 2FA»:" >&2
        echo "      npm config set //registry.npmjs.org/:_authToken=EL_TOKEN" >&2
        return 1
      fi
      continue
    fi
    echo "$salida" >&2
    return "$estado"
  done
}

for paquete in compilador runtime router query testing security vite-plugin create check ts-plugin; do
  publicar "$paquete"
done

echo
echo "Listo. Comprobación de que lo publicado sirve para algo:"
echo "  mkdir /tmp/prueba && cd /tmp/prueba && stil add ascua"
