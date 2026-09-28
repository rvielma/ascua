# vite-plugin-ascua

Compila las plantillas de [Ascua](https://ascua.gitweave.run) dentro de Vite, y
entrega a Vite el CSS que el compilador extrae de los `<style>`.

```sh
stil add -D vite-plugin-ascua      # o npm install -D vite-plugin-ascua
```

```js
// vite.config.ts
import ascua from "vite-plugin-ascua";

export default {
  plugins: [ascua()],
};
```

Por defecto compila con el módulo **WebAssembly** de `ascua-compilador`, que
viene como dependencia: un artefacto para todas las plataformas, sin
`postinstall`. Con `ascua({ bin: "./target/release/ascuac" })` se usa un
ejecutable nativo, que es algo más rápido.

El plugin hace dos cosas y ninguna más: pasar cada archivo con plantillas por el
compilador, y registrar el CSS resultante como un módulo más para que Vite lo
inyecte en desarrollo y lo extraiga a un `.css` en el build. No toca la
reactividad, no empaqueta y no resuelve módulos.

## Sitios estáticos

```js
export default { plugins: [ascua({ sitio: true })] };
```

Cada archivo de `src/rutas/` pasa a ser una página: `vite` la sirve en
desarrollo y `vite build` escribe un HTML por ruta en `dist/`, con sus estilos
dentro y, solo si tiene islas, el script que las hidrata. Rutas con parámetros
(`[id].ts` con `parametros()`), datos con `cargar()`, un marco común
(`_marco.ts`), `404.ts` y rutas que son archivos (`sitemap.xml.ts`).

Con `ascua({ sitio: { modo: "servidor" } })`, el build deja además
`dist/servidor/index.mjs`, un servidor Node con todo dentro que renderiza en
cada petición. Guía en
[ascua.gitweave.run/docs/sitios](https://ascua.gitweave.run/docs/sitios/).

## Licencia

MIT OR Apache-2.0
