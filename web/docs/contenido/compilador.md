---
titulo: Compilador y plugin
descripcion: El plugin de Vite, el paquete WebAssembly y la línea de comandos. Qué hace cada uno y cómo se configura.
---

## vite-plugin-ascua

```ts
// vite.config.ts
import ascua from "vite-plugin-ascua";

export default {
  plugins: [ascua()],
};
```

Hace dos cosas y ninguna más:

1. Pasa por el compilador cada `.ts`, `.js`, `.tsx` o `.jsx` que contenga
   ``view` `` o ``html` ``. Los demás archivos ni se tocan.
2. Registra el CSS de sus `<style>` como un módulo virtual, que Vite inyecta en
   desarrollo y extrae a un `.css` en el build.

No toca la reactividad, no empaqueta y no resuelve módulos. Corre con
`enforce: "pre"`: lo que sale es TypeScript normal, y de ahí en adelante lo
tratan las herramientas de siempre. Funciona igual en Vitest y en el modo SSR
de Vite.

### Opciones

| Opción | Qué hace |
|---|---|
| `bin` | Ruta a un `ascuac` nativo. Sin ella se usa el WebAssembly. |

```ts
ascua({ bin: "./target/release/ascuac" });
```

El nativo es algo más rápido, porque se ahorra arrancar el módulo; el
WebAssembly es un solo artefacto para todas las plataformas, sin nada que
descargar al instalar.

## ascua-compilador

El compilador, como módulo WebAssembly de 87 KB. Lo usa el plugin; se puede
llamar a mano:

```ts
const { compilar_json } = require("ascua-compilador");

const { code, css, map } = JSON.parse(compilar_json(fuente, "src/panel.ts"));
```

| Campo | Qué es |
|---|---|
| `code` | El archivo con las plantillas sustituidas. El resto, sin tocar. |
| `css` | El CSS de los `<style>`, ya con scope. Vacío si no hay. |
| `map` | El source map, con el original dentro (`sourcesContent`). |

**No transpila TypeScript**: lo que no es plantilla sale tal cual, tipos
incluidos. De eso se encarga Vite, o `tsc`, o esbuild.

En el navegador, el mismo `.wasm` con el envoltorio de `./web`:

```ts
import init, { compilar_json } from "ascua-compilador/web";

await init();
```

Es lo que hace funcionar el [playground](/playground/).

## ascuac

La línea de comandos, para mirar qué genera o integrarlo en otra herramienta:

```sh
ascuac src/contador.ts            # el código compilado, por la salida
cat src/contador.ts | ascuac      # desde la entrada estándar
ascuac --json --origen src/contador.ts src/contador.ts
```

| Opción | Qué hace |
|---|---|
| `--json` | Escribe `{"code", "css", "map"}` en vez de solo el código. |
| `--origen RUTA` | El nombre del archivo dentro del source map. |
| `-V`, `--version` | La versión. |

Se compila desde el repositorio con `cargo build --release --bin ascuac`.

## Qué reconoce como plantilla

`view` o `html` pegados a un backtick —``view`…` ``—, sin nada delante que los
haga parte de otro nombre: `miView` y `formatHtml` no son plantillas. El
escáner entiende cadenas, comentarios, expresiones regulares y plantillas
anidadas, así que un ``view` `` dentro de un comentario o de una cadena no se
toca.

Una plantilla puede contener otras en sus huecos —el `render` de un `<For>`—, y
cada una se compila por su cuenta, con su propio scope de CSS.

## ascua-check

`ascua-check` comprueba los tipos de dentro de las plantillas con el `tsc` del
proyecto. Está en [Tipos](/docs/tipos/).

