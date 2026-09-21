# El sitio, en la vía Rust/WebAssembly

**Este fue el sitio del proyecto hasta que se reescribió con la vía de
TypeScript**, que es la que está publicada hoy en ascua.gitweave.run. Se
conserva como ejemplo porque demuestra lo que la otra vía todavía no tiene: SSR
con hidratación real, midiendo *40 nodos adoptados y 0 creados*.

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

## Ya no se despliega

Su spec de despliegue se quitó a propósito: apuntaba al mismo servicio que el
sitio actual (`ascua-site`) y ejecutarlo por error publicaría esta versión
encima de la buena.

## Cifras del build

```
dist/index.html                       19.95 kB │ gzip:  6.02 kB
dist/assets/sitio_bg-*.wasm          134.68 kB │ gzip: 46.83 kB
dist/assets/index-*.js                 7.41 kB │ gzip:  2.93 kB
```

Medido en el navegador sobre el build de producción: **40 nodos adoptados, 0
creados**.
