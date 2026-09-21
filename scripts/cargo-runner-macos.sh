#!/bin/sh
# Runner de cargo para macOS: re-firma el binario y restaura DYLD_*.
#
# Dos problemas distintos de esta plataforma, los dos invisibles desde el
# código:
#
# 1. Los binarios que cargo copia a target/ quedan con la firma ad-hoc del
#    linker rota, y el kernel los mata con SIGKILL en el exec sin ninguna
#    salida. Se arregla re-firmando ad-hoc justo antes de ejecutar.
#
# 2. SIP borra las variables DYLD_* al invocar un intérprete protegido como
#    /bin/sh, que es lo que hace este propio script. Los binarios de test de
#    los crates proc-macro enlazan libstd dinámicamente y dependen de
#    DYLD_FALLBACK_LIBRARY_PATH, así que hay que reconstruirla aquí.
#
# Ninguna de las dos cosas afecta al código ni al artefacto publicado.
set -e

bin="$1"
shift

codesign --force --sign - "$bin" >/dev/null 2>&1 || true

bindir=$(cd "$(dirname "$bin")" && pwd)
sysroot=$(rustc --print sysroot)
targetlib=$(rustc --print target-libdir)
DYLD_FALLBACK_LIBRARY_PATH="$bindir:$targetlib:$sysroot/lib:/usr/local/lib:/usr/lib"
export DYLD_FALLBACK_LIBRARY_PATH

exec "$bin" "$@"
