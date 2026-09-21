# El sitio de Ascua

Construido con Ascua. No es una demostración de juguete: el contenido que se lee
sale del mismo `render_to_string_hydratable` que usaría cualquier aplicación, y
los dos demos interactivos son islas que el navegador hidrata adoptando los
nodos que ya venían del servidor.

```sh
./build.sh          # wasm de las islas + html del servidor
stil run dev        # Vite sirviendo lo anterior, en :5178
stil run build      # build.sh + vite build -> dist/
```

## Quién hace qué

| Pieza | Responsable |
|---|---|
| El HTML del sitio | `src/bin/generar.rs`, en Rust nativo |
| Los componentes | `src/contenido.rs`, genéricos sobre `Backend` |
| Los demos en vivo | `src/demos.rs`, montados como islas |
| El CSS | los bloques `<style>` de cada componente, extraídos al compilar |
| El dev server | Vite, gestionado con `stil` |

Vite no es dueño de nada: sirve estáticos y copia assets. Si mañana hay que
cambiarlo, se cambia `vite.config.js` y el sitio sigue igual.

## En producción

En **https://ascua.gitweave.run**, en el cluster GCP de Mentat, junto a stil,
hull y condor. Hull con `serve: static`, 3 réplicas de 64 MB detrás de Condor.

```sh
mt --server https://www.getmentat.run up deploy/sitio.yaml
```

`mt up` hace el build local (wasm + html + vite), empaqueta la salida, la sube y
reescala. Es idempotente: para publicar un cambio, se vuelve a ejecutar.

## Cifras del build

```
dist/index.html                       19.95 kB │ gzip:  6.02 kB
dist/assets/sitio_bg-*.wasm          134.68 kB │ gzip: 46.83 kB
dist/assets/index-*.js                 7.41 kB │ gzip:  2.93 kB
```

Medido en el navegador sobre el build de producción: **40 nodos adoptados, 0
creados**.
