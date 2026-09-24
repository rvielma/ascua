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

## Licencia

MIT OR Apache-2.0
