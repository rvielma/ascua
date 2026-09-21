#!/bin/sh
# Envoltorio de cargo que sortea la invalidación de firmas de macOS.
#
# Los binarios que cargo produce (build scripts, proc-macros, tests) quedan con
# la firma ad-hoc del linker rota tras ser copiados a target/. El kernel los
# mata con SIGKILL al ejecutarlos, sin ninguna salida, y cargo lo reporta como
# "process didn't exit successfully ... (signal: 9)".
#
# Aquí se detecta ese caso concreto, se re-firman los artefactos y se reintenta.
# Un error de compilación normal no dispara el reintento.
#
#   ./scripts/cargo.sh test
#   ./scripts/cargo.sh clippy --all-targets
set -e

intentos=0
maximo=5

while :; do
    salida=$(mktemp)
    # La salida va a un archivo y se vuelca después: con una tubería, `$?`
    # sería el estado de `tee`, no el de cargo, y el fallo pasaría inadvertido.
    if cargo "$@" >"$salida" 2>&1; then
        estado=0
    else
        estado=1
    fi
    cat "$salida"

    if ! grep -q "SIGKILL" "$salida"; then
        rm -f "$salida"
        exit $estado
    fi
    rm -f "$salida"

    intentos=$((intentos + 1))
    if [ "$intentos" -ge "$maximo" ]; then
        echo "cargo: SIGKILL persistente tras $maximo re-firmas" >&2
        exit 1
    fi

    echo "→ re-firmando artefactos de target/ y reintentando ($intentos/$maximo)" >&2
    find target -type f -perm +111 ! -name '*.rlib' ! -name '*.d' \
        -exec codesign --force --sign - {} \; 2>/dev/null || true
done
